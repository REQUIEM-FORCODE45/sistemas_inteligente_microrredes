# -*- coding: utf-8 -*-
"""Servicio de calibracion POR SENSOR (bucle del diagrama, Opcion A).

Conecta el diagrama con la calibracion: dado un sensor mapeado a un nodo
(solar_panel, load, battery, wind_turbine), lee sus MEDICIONES de Mongo,
descarga el clima ERA5 del periodo medido y ajusta el modelo fisico del
activo (misma cascada N1/N2 de HO#3). El artefacto calibrado se guarda en
results/pasto_narino/calibrated/<sensor_id>.pkl y se reutiliza en cada
ciclo (calibracion auto-solo-si-falta + recalibracion explicita).

Tipos soportados:
  solar -> PvPlant calibrado (K + params + GBR + conformal)
  bess  -> eficiencias y capacidad (least_squares sobre SOC medido)
  wind  -> WindTurbine calibrado (K + GBR)
  load  -> perfil horario calibrado (media por hora + escala)
"""
from __future__ import annotations

import json
import logging
import os
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient

logger = logging.getLogger("optimization.calibration.service")

# Rutas ANCLADAS a la raiz del repo (no al cwd): el servicio puede correr
# desde optimization/ (uvicorn) o desde la raiz; los artefactos SIEMPRE viven
# en <repo>/results/... (bug encontrado: cwd=optimization/ rompia las rutas).
REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = str(REPO_ROOT / "results" / "pasto_narino" / "calibrated")


# --------------------------------------------------------------------------- #
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


def mongo_client(env: Optional[Dict[str, str]] = None):
    from pymongo import MongoClient
    env = env or parse_env_file(os.environ.get("BACKEND_ENV", "Backend/.env"))
    uri = env.get("MONGO_URL") or os.environ.get("MONGO_URL")
    db = env.get("MONGO_DB_NAME") or os.environ.get("MONGO_DB_NAME") or "grid"
    if not uri:
        raise RuntimeError("MONGO_URL no configurado (Backend/.env)")
    return MongoClient(uri), db


def read_sensor_series(sensor_id: str, value_cols: List[str],
                       max_days: float = 30.0) -> pd.DataFrame:
    """Serie del sensor desde su coleccion Mongo (nombre = sensor_id).

    Devuelve DataFrame con index = createAt (tz-aware) y value_cols.
    """
    client, db = mongo_client()
    try:
        col = client[db][sensor_id]
        docs = list(col.find({}, {"createAt": 1, **{c: 1 for c in value_cols}})
                    .sort("createAt", 1))
        if not docs:
            logger.warning("Sensor %s sin datos en Mongo", sensor_id)
            return pd.DataFrame()
        df = pd.DataFrame(docs).set_index("createAt")
        # BSON guarda en UTC (naive al leer): convertir a hora LOCAL del sitio.
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC").tz_convert("America/Bogota")
        else:
            df.index = df.index.tz_convert("America/Bogota")
        df = df[value_cols].apply(pd.to_numeric, errors="coerce")
        df = df.loc[df.index >= (df.index.max() - pd.Timedelta(days=max_days))]
        return df.dropna(how="all")
    finally:
        client.close()


def hourly_resample(df: pd.DataFrame) -> pd.DataFrame:
    """Agrega a horario (media) para alinear con el clima ERA5 horario."""
    if len(df) == 0:
        return df
    return df.resample("h").mean().dropna(how="all")


# --------------------------------------------------------------------------- #
def _fit_solar(cfg: dict, sensor_id: str, df: pd.DataFrame) -> dict:
    from optimization.calibration.experiments import build_nominal_plant, rmse
    from optimization.calibration.derating import estimate_derating, apply_derating
    from optimization.calibration.params import calibrate_params, build_plant
    from optimization.calibration.residual import (residual_features, fit_residual_gbr,
                                                   residual_predict)
    from optimization.calibration.conformal import (conformal_radius, coverage,
                                                     conformal_quantiles)
    from optimization.calibration.calibrated_plant import CalibratedPvPlant

    df = hourly_resample(df)
    s = cfg["site"]
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    start = (df.index.min() - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    end = (df.index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    climate = client.fetch_archive(start, end)
    p_meas = df["power_kw"].reindex(climate.index).dropna()
    p_meas = p_meas[p_meas > 0.01]          # solo horas de generacion
    climate = climate.loc[p_meas.index]
    if len(p_meas) < 48:
        raise ValueError(f"Solar: datos insuficientes ({len(p_meas)} h)")

    nominal = build_nominal_plant(cfg)
    # Cambio 06: split triple DISJUNTO (60% ajuste | 20% calibracion | 20%
    # holdout). k/params/GBR se ajustan SOLO con el tramo de ajuste; los
    # cuantiles se miden contra el predictor FINAL en calibracion; el holdout
    # solo mide cobertura (nunca calibra nada).
    n = len(climate)
    n_fit = int(0.6 * n)
    n_cal = int(0.2 * n)
    cli_fit, p_fit = climate.iloc[:n_fit], p_meas.iloc[:n_fit]
    cli_cal, p_cal = (climate.iloc[n_fit:n_fit + n_cal],
                      p_meas.iloc[n_fit:n_fit + n_cal])
    cli_va, p_va = climate.iloc[n_fit + n_cal:], p_meas.iloc[n_fit + n_cal:]

    k = estimate_derating(nominal.ac_power(cli_fit) / 1000.0, p_fit,
                          nominal.capacity_kwp)
    params = calibrate_params(nominal, cli_fit, p_fit)
    plant_calib = build_plant(nominal, params)

    feats_fit = residual_features(cli_fit, climate.index[0])
    resid_fit = (p_fit
                 - plant_calib.ac_power(cli_fit) / 1000.0)
    gbr = fit_residual_gbr(feats_fit, resid_fit)
    q = np.quantile(resid_fit.values, [0.10, 0.50, 0.90])

    # Residuo del predictor FINAL (fisico + GBR) en el tramo de calibracion.
    p50_cal = (apply_derating(plant_calib.ac_power(cli_cal) / 1000.0, k)
               + residual_predict(gbr, residual_features(cli_cal, climate.index[0])))
    cal_resid = p_cal - p50_cal
    radius = conformal_radius(cal_resid, alpha=0.2)
    bq = conformal_quantiles(cal_resid, alphas=(0.1, 0.9))

    # Cambio 09: memoria del artefacto (fecha, baseline, ventana usada).
    baseline = rmse(p50_cal, p_cal)
    ahora_utc = pd.Timestamp.now(tz="UTC").isoformat()
    calibrated = CalibratedPvPlant(plant=nominal, params=params, k=k,
                                   residual_model=gbr, residual_q=q,
                                   conformal_radius_kw=radius, alpha=0.2,
                                   t0=climate.index[0],
                                   meta={"sensor_id": sensor_id, "type": "solar",
                                         "calib_version": "06.1"},
                                   band_q={**bq, "split": "disjunto"},
                                   calibrated_at=ahora_utc,
                                   baseline_rmse_kw=float(baseline),
                                   n_horas=len(p_meas),
                                   source_window={"desde": str(p_meas.index[0]),
                                                  "hasta": str(p_meas.index[-1])})
    rmse_calib = rmse(plant_calib.ac_power(cli_va) / 1000.0, p_va)

    # Cobertura holdout de la banda asimetrica (solo medicion, criterio C3).
    p50_va = calibrated.predict_power(cli_va)
    band_va = pd.DataFrame({"P10": p50_va + bq["q10"], "P50": p50_va,
                            "P90": p50_va + bq["q90"]})
    calibrated.band_q["coverage_holdout"] = coverage(p_va, band_va)
    calibrated.band_q["ancho_medio_kw"] = float(
        (band_va["P90"] - band_va["P10"]).mean())
    return {"calibrated": calibrated, "rmse_calibrado_kw": rmse_calib,
            "n_horas": len(p_meas), "k": k, "params": params}


def _fit_bess(cfg: dict, sensor_id: str, df: pd.DataFrame) -> dict:
    from optimization.calibration.bess import calibrate_bess, calibrated_bess
    from optimization.physics.bess import Bess

    df = hourly_resample(df)
    power = df["battery_power_kw"].dropna()
    soc = df["soc_pct"].reindex(power.index).dropna()
    idx = power.index.intersection(soc.index)
    power, soc = power.loc[idx], soc.loc[idx]
    if len(power) < 24:
        raise ValueError(f"BESS: datos insuficientes ({len(power)})")
    dt_h = float(np.median(np.diff(idx)).total_seconds()) / 3600.0 or 1.0

    bess_cfg = cfg["bess"]
    nominal = Bess(capacity_kwh=bess_cfg["capacity_kwh"],
                   power_kw=bess_cfg["power_kw"],
                   soc_min=bess_cfg["soc_min"], soc_max=bess_cfg["soc_max"],
                   init_soc=bess_cfg["init_soc"],
                   charge_efficiency=bess_cfg["charge_efficiency"],
                   discharge_efficiency=bess_cfg["discharge_efficiency"])
    params = calibrate_bess(nominal, power, soc, dt_h=dt_h)
    calibrated = {"model": calibrated_bess(nominal, params),
                  "rmse_soc_final_pct": params["rmse_soc_final_pct"],
                  "rmse_soc_inicial_pct": params["rmse_soc_inicial_pct"],
                  "meta": {"sensor_id": sensor_id, "type": "bess",
                           "n_muestras": len(power)}}
    return {"calibrated": calibrated, "rmse_soc_inicial_pct": params["rmse_soc_inicial_pct"],
            "rmse_soc_final_pct": params["rmse_soc_final_pct"],
            "n_muestras": len(power), "params": {k: v for k, v in params.items()
                                                 if k in ("charge_efficiency",
                                                          "discharge_efficiency",
                                                          "capacity_kwh")}}


def _fit_wind(cfg: dict, sensor_id: str, df: pd.DataFrame) -> dict:
    from optimization.calibration.wind import calibrate_wind
    from optimization.physics.wind import WindTurbine

    df = hourly_resample(df)
    s = cfg["site"]
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    start = (df.index.min() - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    end = (df.index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    climate = client.fetch_archive(start, end)
    p_meas = df["power_kw"].reindex(climate.index).dropna()
    climate = climate.loc[p_meas.index]
    if len(p_meas) < 24:
        raise ValueError(f"Wind: datos insuficientes ({len(p_meas)})")

    wcfg = cfg["wind"]
    nominal = WindTurbine(hub_height_m=wcfg["hub_height_m"],
                          reference_height_m=wcfg["reference_height_m"],
                          surface_roughness_m=wcfg["z0"],
                          capacity_kw=wcfg["capacity_kw"])
    # senal nula: si la potencia medida nunca supera ~2% de la capacidad
    # (Pasto: viento ~0), el ajuste es degenerado -> modelo nulo honesto.
    if float(p_meas.max()) < 0.02 * wcfg["capacity_kw"]:
        logger.warning("Wind %s sin señal medida (max %.3f kW); modelo nulo",
                       sensor_id, float(p_meas.max()))
        zero = {"type": "wind", "zero": True,
                "meta": {"sensor_id": sensor_id, "type": "wind",
                         "reason": "sin señal eolica en el periodo"}}
        return {"calibrated": zero, "rmse_nominal_kw": float("nan"),
                "rmse_hibrido_kw": float("nan"), "k": 0.0, "n_horas": len(p_meas)}
    try:
        res = calibrate_wind(nominal, climate, p_meas, seed=7)
        k = res["k"]
        if not (0.3 < k < 2.0):
            raise ValueError(f"K degenerado ({k:.2f}): sin señal eolica real")
        return {"calibrated": res["calibrated"], "rmse_nominal_kw": res["rmse_nominal"],
                "rmse_hibrido_kw": res["rmse_hibrido"], "k": k,
                "n_horas": len(p_meas)}
    except ValueError as exc:
        # senal ~0 (Pasto): modelo degenerado -> prediccion 0 (honesto)
        logger.warning("Wind %s degenerado (%s); modelo nulo", sensor_id, exc)
        zero = {"type": "wind", "zero": True,
                "meta": {"sensor_id": sensor_id, "type": "wind",
                         "reason": "sin señal eolica en el periodo"}}
        return {"calibrated": zero, "rmse_nominal_kw": float("nan"),
                "rmse_hibrido_kw": float("nan"), "k": 0.0, "n_horas": len(p_meas)}


def _fit_load(cfg: dict, sensor_id: str, df: pd.DataFrame) -> dict:
    """Perfil horario calibrado: media por hora + cuantiles de residuo."""
    df = hourly_resample(df)
    p = df["power_kw"].dropna()
    if len(p) < 24:
        raise ValueError(f"Load: datos insuficientes ({len(p)})")
    profile = p.groupby(p.index.hour).mean()
    resid = p - profile.loc[p.index.hour].values
    r10, r90 = np.quantile(resid.values, [0.10, 0.90])
    model = {"type": "load", "sensor_id": sensor_id,
             "profile_kw": profile.to_dict(), "q10": float(r10), "q90": float(r90),
             "n_muestras": len(p)}
    return {"calibrated": model, "n_muestras": len(p)}


# --------------------------------------------------------------------------- #
FITTERS = {"solar": _fit_solar, "bess": _fit_bess, "wind": _fit_wind,
           "load": _fit_load}

SENSOR_VALUE_COLS = {"solar": ["power_kw"], "bess": ["battery_power_kw", "soc_pct"],
                     "wind": ["power_kw"], "load": ["power_kw"]}


def artifact_path(sensor_id: str) -> str:
    return os.path.join(ARTIFACT_DIR, f"{sensor_id}.pkl")


def is_calibrated(sensor_id: str) -> bool:
    return os.path.exists(artifact_path(sensor_id))


def load_calibrated(sensor_id: str) -> Any:
    path = artifact_path(sensor_id)
    if not os.path.exists(path):
        raise FileNotFoundError(f"No hay modelo calibrado para {sensor_id}")
    with open(path, "rb") as fh:
        return pickle.load(fh)


def fit_from_sensor(site_id: str, sensor_id: str, activo_type: str,
                    force: bool = False, motivo: str = None) -> dict:
    """Ajusta el modelo del activo con los datos medidos del sensor (bucle).

    - Si ya existe artefacto y force=False -> devuelve el resumen existente.
    - force=True (boton "Recalibrar") -> reajusta y sobrescribe.
    - Cambio 09: cada recalibracion real se registra append-only en
      history/<sensor_id>.jsonl con su motivo (drift|age|manual|missing).
    """
    path = artifact_path(sensor_id)
    habia = os.path.exists(path)
    if os.path.exists(path) and not force:
        with open(path, "rb") as fh:
            model = pickle.load(fh)
        summary = _summary_of(model)
        # materializa el resumen JSON si el artefacto es anterior a esta feature
        json_path = os.path.join(ARTIFACT_DIR, f"{sensor_id}.json")
        if not os.path.exists(json_path):
            with open(json_path, "w") as fh:
                json.dump({"sensor_id": sensor_id, "type": activo_type, **summary},
                          fh, default=str, indent=1)
        return {"status": "ok", "cached": True, "sensor_id": sensor_id,
                "type": activo_type, "artifact": path, "summary": summary}

    if activo_type not in FITTERS:
        raise ValueError(f"Tipo de activo no soportado: {activo_type}")
    if activo_type not in SENSOR_VALUE_COLS:
        raise ValueError(f"Sin columnas de sensor para {activo_type}")

    cfg = load_site(site_id)
    df = read_sensor_series(sensor_id, SENSOR_VALUE_COLS[activo_type])
    if df.empty:
        raise ValueError(f"Sensor {sensor_id} sin datos; ejecuta el backfill")

    # Cambio 09 (auditoria item 4): rmse previo ANTES de sobrescribir.
    # Causas de null (distintas, documentadas): (a) sin artefacto previo,
    # (b) artefacto previo sin baseline (anteriores al cambio 09).
    rmse_antes, rmse_antes_causa = None, None
    if habia:
        try:
            prev_json = os.path.join(ARTIFACT_DIR, f"{sensor_id}.json")
            if os.path.exists(prev_json):
                with open(prev_json) as fh:
                    rmse_antes = json.load(fh).get("rmse_calibrado_kw")
            if rmse_antes is None:
                rmse_antes_causa = "artefacto_previo_sin_baseline"
        except (OSError, ValueError):
            rmse_antes_causa = "artefacto_previo_sin_baseline"
    else:
        rmse_antes_causa = "sin_artefacto_previo"

    fit = FITTERS[activo_type](cfg, sensor_id, df)
    model = fit.pop("calibrated")

    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    with open(path, "wb") as fh:
        pickle.dump(model, fh)
    # resumen JSON (para el endpoint Node /optimization/calibration)
    summary = _summary_of(model)
    summary.update(fit)
    with open(os.path.join(ARTIFACT_DIR, f"{sensor_id}.json"), "w") as fh:
        json.dump({"sensor_id": sensor_id, "type": activo_type, **summary},
                  fh, default=str, indent=1)
    logger.info("Modelo calibrado %s -> %s (%s)", sensor_id, activo_type, path)

    # Cambio 09: registro append-only del evento (nunca se sobrescribe).
    motivo_ev = motivo or ("manual" if (force and habia) else "missing")
    try:
        from optimization.monitoring.calibration_lifecycle import registrar_evento
        registrar_evento(sensor_id, motivo_ev,
                         rmse_antes=rmse_antes,
                         rmse_antes_causa=rmse_antes_causa,
                         rmse_despues=summary.get("rmse_calibrado_kw"),
                         n_horas=summary.get("n_horas"), artifact_path=path)
    except Exception as exc:
        logger.warning("No se pudo registrar recalibracion %s: %s", sensor_id, exc)

    return {"status": "ok", "cached": False, "sensor_id": sensor_id,
            "type": activo_type, "artifact": path, "summary": summary}


def _summary_of(model: Any) -> dict:
    if isinstance(model, dict) and "model" in model and "meta" in model:
        # wrapper BESS
        return {"rmse_soc_final_pct": model.get("rmse_soc_final_pct"),
                "meta": model.get("meta", {})}
    meta = getattr(model, "meta", {}) or {}
    if hasattr(model, "params") and isinstance(getattr(model, "params", None), dict):
        # Cambio 09: antiguedad + stale (regla 3: ultima version con aviso).
        calibrated_at = getattr(model, "calibrated_at", None)
        age_days, stale = None, None
        if calibrated_at:
            try:
                max_age = float(os.environ.get("CALIBRATION_MAX_AGE_DAYS", "30"))
                age_days = ((pd.Timestamp.now(tz="UTC")
                             - pd.Timestamp(calibrated_at)).total_seconds() / 86400.0)
                stale = bool(age_days > max_age)
            except (ValueError, TypeError):
                pass
        return {"k": getattr(model, "k", None),
                "params": getattr(model, "params", None),
                "conformal_radius_kw": getattr(model, "conformal_radius_kw", None),
                "band_q": getattr(model, "band_q", None),
                "calibrated_at": calibrated_at,
                "age_days": age_days,
                "stale": stale,
                "baseline_rmse_kw": getattr(model, "baseline_rmse_kw", None),
                "n_horas": getattr(model, "n_horas", None),
                "source_window": getattr(model, "source_window", None),
                "provider": "physics+ML"}
    if isinstance(model, dict) and model.get("type") == "load":
        return {"profile": "calibrado", "q10": model.get("q10"),
                "q90": model.get("q90")}
    return {"provider": "calibrado", **meta}
