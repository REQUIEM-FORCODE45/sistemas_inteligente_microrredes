# -*- coding: utf-8 -*-
"""Backfill de sensores sinteticos de planta (Pasto) a MongoDB.

SCENARIO: das datos historicos "medidos" a la base desde el dia 1, para que
calibracion / predictor / panel tengan serie desde antes. Un solo uso
(one-shot). La version STREAMING en vivo es `publish.py` (topico MQTT).

Flujo (HO#3):
  1. Carga config del sitio (config/loader.py).
  2. Descarga CLIMA REAL horario del historico ERA5 (Open-Meteo archive).
  3. Genera sensores sinteticos con la "verdad oculta" (generator.py) a paso
     configurable (default 5 min) -> -*- 4032 muestras/sensor en 14 dias.
  4. Registra/asegura los dispositivos autorizados (AuthorizedDevice) con
     ids DETERMINISTAS por tipo (pasto_<tipo>), duenio = admin de la BD.
  5. Inserta los datos en la coleccion de cada sensor (== AuthorizedDevice._id)
     con `createAt` en el PASADO (fecha de la medicion).

Ejemplo:
  python3 -m optimization.data.synthetic.insert_synthetic_sensors \
      --site pasto_narino --seed 7 --days 14 --step 5min --dry-run
  python3 -m optimization.data.synthetic.insert_synthetic_sensors \
      --site pasto_narino --seed 42 --clima_intervalo 7
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from pymongo import MongoClient

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient
from optimization.data.synthetic.generator import generate_sensors

logger = logging.getLogger("optimization.synthetic.backfill")

# Tipo mongoose (enum de Device.js) por key de sensor sintetico.
# NOTA (decision de arquitectura): el CLIMA no es un sensor de la planta; se
# obtiene de Open-Meteo/TimesFM. 'weather' solo se genera con --include-weather.
SENSOR_TYPE: Dict[str, str] = {
    "weather": "meter",      # opcional (--include-weather)
    "solar_pv": "solar",
    "load": "meter",
    "bess": "battery",
    "wind": "meter",
}
SENSOR_LABEL: Dict[str, str] = {
    "weather": "Estacion meteorologica",
    "solar_pv": "Planta solar",
    "load": "Carga",
    "bess": "Bateria",
    "wind": "Aerogenerador",
}


# --------------------------------------------------------------------------- #
def parse_env_file(path: str) -> Dict[str, str]:
    """Minimo parser .env (KEY=value) sin dependencias extra (no python-dotenv)."""
    result = {}
    if not path or not os.path.exists(path):
        return result
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def resolve_mongo(env: Dict[str, str], cli_uri: Optional[str],
                  cli_db: Optional[str]) -> Tuple[str, str]:
    uri = cli_uri or env.get("MONGO_URL") or os.environ.get("MONGO_URL")
    db = cli_db or env.get("MONGO_DB_NAME") or os.environ.get("MONGO_DB_NAME") or "grid"
    if not uri:
        raise SystemExit(
            "No se encontro MONGO_URL. Pasa --mongouri o exporta MONGO_URL / Backend/.env"
        )
    return uri, db


def pick_owner(collection, prefer: Tuple[str, ...] = ("admin", "operator")) -> Optional[str]:
    """Elige un usuario dueno: admin, luego operator, luego cualquiera."""
    for role in prefer:
        u = collection.find_one({"role": role}, {"_id": 1})
        if u:
            return str(u["_id"])
    u = collection.find_one({}, {"_id": 1})
    return str(u["_id"]) if u else None


def _native(value):
    """Convierte tipos numpy a nativos (pymongo no serializa np.*/Timestamp)."""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.to_pydatetime()
    if isinstance(value, np.ndarray):
        return [_native(v) for v in value.tolist()] if value.ndim else value.item()
    return value


def sensor_documents(sensor_id: str, df: pd.DataFrame) -> List[dict]:
    """Convierte cada fila en un doc {payload..., createAt} (createAt en pasado)."""
    docs = []
    for ts, row in df.iterrows():
        payload = {k: _native(v) for k, v in row.to_dict().items() if k != "_id"}
        docs.append({**payload, "createAt": ts.to_pydatetime()})
    return docs


# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill de sensores sinteticos")
    parser.add_argument("--site", default="pasto_narino")
    parser.add_argument("--seed", type=int, default=7, help="verdad oculta (7 limpio, 42 realista)")
    parser.add_argument("--days", type=int, default=14, help="dias de historico a generar")
    parser.add_argument("--step", default="5min")
    parser.add_argument("--end-offset-days", type=int, default=7,
                        help="margen de dias al final (latencia ERA5) para tener datos en el pasado")
    parser.add_argument("--prefix", default=None, help="prefijo de ids oficiales (default: '<site>_')")
    parser.add_argument("--dry-run", action="store_true", help="solo imprime plan")
    parser.add_argument("--reset", action="store_true",
                        help="borra antes de insertar: colecciones de datos 'pasto_*' y dispositivos AuthorizedDevice 'pasto_*'")
    parser.add_argument("--include-weather", action="store_true",
                        help="genera tambien el sensor de clima sintetico (por defecto NO: "
                             "el clima es entrada externa de Open-Meteo/TimesFM, no un sensor)")
    parser.add_argument("--mongouri", default=None)
    parser.add_argument("--db", default=None)
    args = parser.parse_args()

    # sensores efectivos: weather SOLO con --include-weather (decision de
    # arquitectura: el clima no es un sensor de la planta)
    sensor_types = dict(SENSOR_TYPE)
    if not args.include_weather:
        sensor_types.pop("weather", None)

    cfg = load_site(args.site)
    site_cfg = cfg["site"]
    prefix = args.prefix or (args.site.split("_")[0] or "pasto")

    # 1) ventana temporal (fecha de medicion en el PASADO, con latencia ERA5)
    now = pd.Timestamp.now(tz=site_cfg.get("timezone", "America/Bogota")).floor("D")
    end = now - timedelta(days=args.end_offset_days)
    start = end - timedelta(days=args.days)
    logger.info("Ventana de clima: %s -> %s (%d dias)", start.date(), end.date(), args.days)

    # 2) clima real del historico ERA5
    client = OpenMeteoClient(latitude=site_cfg["latitude"],
                             longitude=site_cfg["longitude"],
                             timezone=site_cfg.get("timezone", "America/Bogota"))
    logger.info("Descargando clima ERA5 %s ~ %s ...", start.date(), end.date())
    climate = client.fetch_archive(start.date().isoformat(), end.date().isoformat())
    if climate.empty:
        logger.warning("Clima vacio %s..%s: reagusta --end-offset-days (ERA5 tiene latencia)",
                       start.date(), end.date())
        return 1
    logger.info("Clima descargado: %d filas horarias", len(climate))

    # 3) generacion de sensores (verdad oculta + efectos + ruido)
    sensors = generate_sensors(climate, seed=args.seed, cfg=cfg, step=args.step)
    for key, df in sensors.items():
        logger.info("  sensor %-9s %5d registros @ %s", key, len(df), args.step)

    ids_by_key = {k: f"{prefix}_{k}" for k in sensor_types}
    plan = [(key, ids_by_key[key], sensor_types[key], len(sensors[key]))
            for key in sensor_types]

    if args.dry_run:
        print("\n== PLAN (dry-run, sin conexion Mongo) ==")
        for key, sid, typ, n in plan:
            print(f"  {sid:20s} type={typ:8s} rows={n:5d}")
        if args.reset:
            print("\n  [--reset] se borrarian: colecciones de datos y dispositivos 'pasto_*'")
        print("\n[dry-run] No se conecto a Mongo ni se escribio nada.")
        return 0

    # 4) Mongo
    env = parse_env_file(os.environ.get("BACKEND_ENV", "Backend/.env"))
    uri, db_name = resolve_mongo(env, args.mongouri, args.db)
    logger.info("Conectando a Mongo dbname=%s", db_name)
    mongo = MongoClient(uri)
    db = mongo[db_name]

    # 4b) reset: borra datos sinteticos previos antes de regenerar
    if args.reset:
        prefix_rx = f"^{prefix}_"
        dropped = 0
        for coll in list(db.list_collection_names()):
            if coll.startswith(f"{prefix}_"):
                db[coll].drop()
                dropped += 1
        res = db["authorizeddevices"].delete_many({"_id": {"$regex": prefix_rx}})
        logger.info("[reset] colecciones de datos borradas: %d | dispositivos %s_*: %d",
                    dropped, prefix, res.deleted_count)

    owner = None
    for coll in ("usuarios", "users"):
        if coll in db.list_collection_names():
            owner = pick_owner(db[coll])
            if owner:
                break
    if not owner:
        mongo.close()
        raise SystemExit("Sin usuario dueño en BD; no puedo registrar dispositivos.")

    print("\n== PLAN ==")
    for key, sid, typ, n in plan:
        exists = db["authorizeddevices"].find_one({"_id": sid}, {"_id": 1}) is not None
        print(f"  {sid:20s} type={typ:8s} rows={n:5d} registrado={'SI' if exists else 'NO'}")

    # 5) asegurar dispositivos autorizados
    print("\n== REGISTRO dispositivos ==")
    for key, sid, typ, n in plan:
        if db["authorizeddevices"].find_one({"_id": sid}, {"_id": 1}):
            print(f"  {sid}: ya autorizado, ok.")
            continue
        db["authorizeddevices"].insert_one({
                "_id": sid, "userId": owner, "name": SENSOR_LABEL[key],
                "type": typ, "status": "active", "sharedWith": [],
                "createdAt": pd.Timestamp.now(tz="America/Bogota").to_pydatetime(),
            })
        print(f"  {sid}: registrado (dueno admin={owner})")

    # 6) insertar serie de cada sensor en su coleccion (nombre = sid)
    print("\n== INSERT datos ==")
    for key, sid, typ, n in plan:
        col = db[sid]
        docs = sensor_documents(sid, sensors[key])
        npre = col.count_documents({})
        res = col.insert_many(docs, ordered=False)
        print(f"  {sid}: +{len(res.inserted_ids)} (antes {npre})")

    mongo.close()
    print("\nBackfill completo.")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    raise SystemExit(main())