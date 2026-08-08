# -*- coding: utf-8 -*-
"""Deteccion de drift (Fase 6) — gatillo de recalibracion (HO#3 sec 9.5).

Conecta los pilares: si el RMSE rodante del modelo calibrado contra las
MEDICIONES recientes supera un umbral (x2 del RMSE de referencia esperado),
el sistema dispara recalibracion. Es el ciclo de vida completo del ajuste.

Uso:
  from optimization.monitoring.drift import detect_drift
  state = detect_drift(predicted_kw, measured_kw, baseline_rmse_kw=0.6)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

logger = logging.getLogger("optimization.monitoring.drift")


@dataclass
class DriftState:
    rmse_kw: float
    baseline_rmse_kw: float
    ratio: float
    drift: bool
    n_samples: int
    last_timestamp: pd.Timestamp | None = None
    history: list = field(default_factory=list)   # (ts, rmse) para series


def rolling_rmse(predicted_kw: pd.Series, measured_kw: pd.Series,
                 window_h: int = 168) -> pd.Series:
    """RMSE rodante (ventana deslizante) por paso, alineado por index."""
    df = pd.DataFrame({"pred": predicted_kw, "meas": measured_kw}).dropna()
    sq = (df["pred"] - df["meas"]) ** 2
    return sq.rolling(window_h, min_periods=24).mean().apply(np.sqrt)


def detect_drift(predicted_kw: pd.Series, measured_kw: pd.Series,
                 baseline_rmse_kw: float, window_h: int = 168,
                 threshold_mult: float = 2.0) -> DriftState:
    """Compara el RMSE rodante contra el de referencia (calibracion).

    drift = RMSE_reciente > threshold_mult * baseline_rmse_kw
    """
    df = pd.DataFrame({"pred": predicted_kw, "meas": measured_kw}).dropna()
    if len(df) < 24:
        logger.warning("Muestras insuficientes para drift (%d)", len(df))
        return DriftState(rmse_kw=float("nan"), baseline_rmse_kw=baseline_rmse_kw,
                          ratio=float("nan"), drift=False, n_samples=len(df))

    sq = (df["pred"] - df["meas"]) ** 2
    rmse_rolling = sq.rolling(window_h, min_periods=24).mean().apply(np.sqrt)
    rmse_recent = float(rmse_rolling.iloc[-1])
    ratio = rmse_recent / baseline_rmse_kw if baseline_rmse_kw > 0 else float("inf")
    drift = bool(ratio > threshold_mult)

    history = [(ts.to_pydatetime(), float(r))
               for ts, r in rmse_rolling.dropna().items()]
    logger.info("Drift: RMSE=%.3f kW (base=%.3f) ratio=%.2f -> %s",
                rmse_recent, baseline_rmse_kw, ratio,
                "RECALIBRAR" if drift else "ok")
    return DriftState(rmse_kw=rmse_recent, baseline_rmse_kw=baseline_rmse_kw,
                      ratio=ratio, drift=drift, n_samples=len(df),
                      last_timestamp=df.index[-1], history=history)


def simulated_monitoring(calibrated_pred: pd.Series, seed: int = 7,
                         drift_after_h: int = 30 * 24,
                         noise: float = 0.5, drift_scale: float = 2.0,
                         baseline_rmse_kw: float = 0.6) -> DriftState:
    """Demo reproducible: el error crece tras drift_after_h (suciedad real).

    Util para tests y para la tesis (ilustra el gatillo).
    """
    rng = np.random.default_rng(seed)
    err = rng.normal(0, noise, len(calibrated_pred))
    t = np.arange(len(calibrated_pred))
    err[t >= drift_after_h] += drift_scale * (t[t >= drift_after_h] - drift_after_h) / 24.0
    measured = (calibrated_pred + err).clip(lower=0.0)
    return detect_drift(calibrated_pred, measured, baseline_rmse_kw=baseline_rmse_kw)
