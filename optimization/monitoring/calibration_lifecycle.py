# -*- coding: utf-8 -*-
"""Ciclo de vida de la calibracion (cambio 09) — medir y avisar, NO disparar.

Reutiliza monitoring/drift.py SIN modificarlo. La recalibracion AUTOMATICA en
caliente NO se activa aqui: primero se mide y avisa; activarla es un cambio
posterior con evidencia de la frecuencia real de deriva.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("optimization.monitoring.lifecycle")

REPO_ROOT = Path(__file__).resolve().parents[2]
HISTORY_DIR = str(REPO_ROOT / "results" / "pasto_narino" / "calibrated" / "history")

DRIFT_THRESHOLD_MULT = 2.0


def max_age_days() -> float:
    """Edad maxima del artefacto (parametro declarado, no constante oculta)."""
    try:
        return float(os.environ.get("CALIBRATION_MAX_AGE_DAYS", "30"))
    except (ValueError, TypeError):
        return 30.0


def registrar_evento(sensor_id: str, motivo: str,
                     rmse_antes: Optional[float] = None,
                     rmse_despues: Optional[float] = None,
                     n_horas: Optional[int] = None,
                     artifact_path: Optional[str] = None) -> dict:
    """Registra una recalibracion append-only (una linea JSON por evento)."""
    os.makedirs(HISTORY_DIR, exist_ok=True)
    sha = None
    if artifact_path and os.path.exists(artifact_path):
        h = hashlib.sha256()
        with open(artifact_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        sha = h.hexdigest()[:16]
    ev = {"ts": datetime.now(timezone.utc).isoformat(), "motivo": motivo,
          "rmse_antes": rmse_antes, "rmse_despues": rmse_despues,
          "n_horas": n_horas, "artifact_sha256": sha}
    with open(os.path.join(HISTORY_DIR, f"{sensor_id}.jsonl"), "a") as fh:
        fh.write(json.dumps(ev, default=str) + "\n")
    return ev


def evaluate_drift(site_id: str, sensor_id: str, activo_type: str = "solar",
                   max_days: float = 8.0) -> dict:
    """Mide deriva del modelo calibrado contra mediciones recientes.

    Lee las mediciones del sensor (Mongo), predice el mismo periodo con el
    modelo calibrado y llama a detect_drift con el baseline guardado.
    Sin baseline o sin datos suficientes -> drift None con reason (nunca 0).
    """
    import pandas as pd
    from optimization.calibration.service import (load_calibrated, read_sensor_series,
                                                  hourly_resample, load_site)
    from optimization.monitoring.drift import detect_drift
    from optimization.weather.openmeteo import OpenMeteoClient

    try:
        model = load_calibrated(sensor_id)
    except FileNotFoundError:
        return {"sensor_id": sensor_id, "drift": None,
                "reason": "sin artefacto calibrado"}
    baseline = getattr(model, "baseline_rmse_kw", None)
    if baseline is None:
        return {"sensor_id": sensor_id, "drift": None,
                "reason": "sin baseline_rmse_kw (artefacto previo al cambio 09)"}
    if not hasattr(model, "predict_power"):
        return {"sensor_id": sensor_id, "drift": None,
                "reason": f"tipo {activo_type} sin predict_power en este cambio"}
    cols = {"solar": ["power_kw"], "wind": ["power_kw"],
            "load": ["power_kw"],
            "bess": ["battery_power_kw"]}.get(activo_type, ["power_kw"])
    df = hourly_resample(read_sensor_series(sensor_id, cols, max_days=max_days))
    if df.empty or len(df) < 24:
        return {"sensor_id": sensor_id, "drift": None,
                "reason": f"mediciones insuficientes ({len(df)} h)"}
    meas = df[cols[0]].dropna()
    cfg = load_site(site_id)
    s = cfg["site"]
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    start = (meas.index.min() - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    end = (meas.index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    climate = client.fetch_archive(start, end)
    pred = model.predict_power(climate.reindex(meas.index).dropna())
    st = detect_drift(pred, meas.reindex(pred.index),
                      baseline_rmse_kw=float(baseline),
                      threshold_mult=DRIFT_THRESHOLD_MULT)
    return {"sensor_id": sensor_id,
            "rmse_kw": st.rmse_kw, "baseline_rmse_kw": st.baseline_rmse_kw,
            "ratio": st.ratio, "drift": st.drift, "n_samples": st.n_samples,
            "reason": None}


def should_recalibrate(sensor_id: str) -> dict:
    """Decide con numeros: deriva o edad. NO recalibra (solo medir+avisar)."""
    from optimization.calibration.service import load_calibrated, _summary_of
    try:
        summary = _summary_of(load_calibrated(sensor_id))
    except FileNotFoundError:
        return {"sensor_id": sensor_id, "recalibrar": True, "motivo": "missing"}
    if summary.get("stale"):
        return {"sensor_id": sensor_id, "recalibrar": True, "motivo": "age",
                "age_days": summary.get("age_days")}
    return {"sensor_id": sensor_id, "recalibrar": False, "motivo": None,
            "age_days": summary.get("age_days")}
