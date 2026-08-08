# -*- coding: utf-8 -*-
"""Streaming EN VIVO de sensores sinteticos (Pasto) -> broker MQTT.

Complementa a `insert_synthetic_sensors.py` (backfill one-shot que llena el
HISTORICO en el pasado). Este publica el valor del timestep CORRIENTE hacia
adelante en el topico `DataSensor/<sensor_id>` del broker MQTT del backend.

mqttService.js se suscribe a `DataSensor/+`, aplica la whitelist y persiste a
Mongo con createAt=ahora + emite por Socket.IO (dashboard en tiempo real).

SCAFFOLD Fase 1c: la generacion continua con granularidad variable/jitter y la
reconexion robusta se terminan al cablearlo con el predictor MPC. Por ahora:
obtiene de Mongo el ultimo createAt (retoma el backfill) o usa --start, genera
una ventana de clima REAL a partir de ahi y publica `--window` pasos (0=inf).

Ejemplos:
  python3 -m optimization.data.synthetic.publish --site pasto_narino \
      --seed 7 --window 12 --sleep 5                   # con MQTT (broker por env)
  python3 -m optimization.data.synthetic.publish --print-only --window 3
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import time
from typing import Dict, Optional

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient

logger = logging.getLogger("optimization.synthetic.publish")

KEYS = ["weather", "solar_pv", "load", "bess", "wind"]


def broker_url(env: Dict[str, str]) -> str:
    return env.get("MQTT_BROKER") or os.environ.get("MQTT_BROKER") or "mqtt://localhost:1883"


def parse_env_file(path: str) -> Dict[str, str]:
    out = {}
    if not path or not os.path.exists(path):
        return out
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def load_last_ts(mongo_uri: Optional[str], db_name: str, sid: str) -> Optional[pd.Timestamp]:
    """Ultima createAt del sensor en Mongo (donde quedo el backfill)."""
    if not mongo_uri:
        return None
    from pymongo import MongoClient
    c = MongoClient(mongo_uri)
    try:
        last = c[db_name][sid].find_one(sort=[("createAt", -1)], projection={"createAt": 1})
    finally:
        c.close()
    return pd.Timestamp(last["createAt"]) if last else None


def publish_once(client, sensor_id: str, payload: dict, qos: int = 1):
    """Publica el payload en el topico DataSensor/<sensor_id>."""
    topic = f"DataSensor/{sensor_id}"
    info = client.publish(topic, json.dumps(payload, default=str), qos=qos)
    if info.rc != 0:
        logger.warning("publish %s rc=%s", topic, info.rc)


def main() -> int:
    ap = argparse.ArgumentParser(description="Streaming real de sensores sinteticos")
    ap.add_argument("--site", default="pasto_narino")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--step", default="5min")
    ap.add_argument("--window", type=int, default=1, help="pasos a publicar (0 = infinito)")
    ap.add_argument("--sleep", type=float, default=5.0, help="segundos entre pasos")
    ap.add_argument("--jitter", type=float, default=0.0,
                    help="fraccion de aleatoriedad en el sleep (0.1 = 10%)")
    ap.add_argument("--qos", type=int, default=1)
    ap.add_argument("--start", default=None, help="inicio ISO (default: ultimo createAt + paso)")
    ap.add_argument("--print-only", action="store_true", help="solo imprimir JSON (sin MQTT)")
    ap.add_argument("--mongouri", default=None)
    ap.add_argument("--db", default=None)
    args = ap.parse_args()

    cfg = load_site(args.site)
    site_cfg = cfg["site"]
    tz = site_cfg.get("timezone", "America/Bogota")
    prefix = site_cfg["id"].split("_")[0] or "pasto"
    ids = {k: f"{prefix}_{k}" for k in KEYS}

    step_ms = pd.Timedelta(args.step)
    env = parse_env_file(os.environ.get("BACKEND_ENV", "Backend/.env"))
    db = args.db or env.get("MONGO_DB_NAME") or "grid"
    mongo_uri = args.mongouri or env.get("MONGO_URL") or os.environ.get("MONGO_URL")

    climate = OpenMeteoClient(latitude=site_cfg["latitude"],
                              longitude=site_cfg["longitude"],
                              timezone=tz)
    from optimization.data.synthetic.generator import generate_sensors

    # timestep base: --start, o ultimo createAt en Mongo, o ultima hora cerrada
    if args.start:
        cur = pd.Timestamp(args.start, tz=tz)
    else:
        last = load_last_ts(mongo_uri, db, ids["solar_pv"])
        cur = last.tz_convert(tz) if last is not None else \
            pd.Timestamp.now(tz=tz).floor("h")
    cur = cur + step_ms

    mqtt = None
    connected = False
    if not args.print_only:
        import paho.mqtt.client as mqtt_cli

        def _on_connect(client, userdata, flags, rc, props=None):
            nonlocal connected
            connected = rc == 0
            if connected:
                logger.info("MQTT conectado a %s", broker_url(env))
            else:
                logger.warning("MQTT reconnect rc=%s", rc)

        mqtt = mqtt_cli.Client(mqtt_cli.CallbackAPIVersion.VERSION2)
        mqtt.reconnect_delay_set(min_delay=1, max_delay=30)
        mqtt.on_connect = _on_connect
        try:
            mqtt.connect(env.get("MQTT_BROKER") or os.environ.get("MQTT_BROKER",
                                                                  broker_url(env)))
        except Exception as exc:
            logger.error("MQTT no disponible (%s); sigue en modo print", exc)
            mqtt = None
        if mqtt is not None:
            mqtt.loop_start()

    rng = np.random.default_rng(args.seed + 1)
    n = 0
    while args.window == 0 or n < args.window:
        # clima real de la ventana que contiene el paso (forecast horario)
        horizon = climate.fetch_forecast(past_days=1, forecast_days=1)
        sensors = generate_sensors(horizon, seed=args.seed, cfg=cfg, step=args.step)
        ts = cur
        row = {}
        for k in KEYS:
            df = sensors[k]
            if ts in df.index:
                row[k] = df.loc[ts].to_dict()
        if not row:
            logger.warning("Sin fila en %s; avanza slot", ts)
            cur = cur + step_ms
            continue
        if mqtt is not None and connected:
            for k in KEYS:
                if k in row:
                    publish_once(mqtt, ids[k], {**row[k], "createAt": ts.to_pydatetime()},
                                 qos=args.qos)
            logger.info("publicado %s (%d", ts, n + 1)
        else:
            print(json.dumps({"createAt": ts.isoformat(), "sensors": {
                k: row[k] for k in KEYS if k in row}}, default=str))

        cur = cur + step_ms
        n += 1
        if args.window != 0 and n < args.window:
            wait = args.sleep
            if args.jitter > 0:
                wait = max(0.0, wait * (1.0 + rng.uniform(-args.jitter, args.jitter)))
            time.sleep(wait)

    if mqtt is not None:
        mqtt.loop_stop()
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    raise SystemExit(main())