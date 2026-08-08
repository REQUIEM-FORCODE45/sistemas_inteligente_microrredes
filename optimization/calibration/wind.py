# -*- coding: utf-8 -*-
"""Calibracion eolica (Fase 4) — mismo esquema N1/N2 que PV (HO#3 sec 12).

WindTurbine tiene parametros de catalogo; una turbina real difiere (curva
real, perdidas de suciedad en palas, degradacion). N1a: derating K en horas
con viento util (v_hub >= cut_in). N2: GBR de residuos con las mismas
features que PV.

LIMITACION DECLARADA (Pasto): viento ~1-3 m/s a 100m < cut_in (3 m/s) casi
siempre -> senal eolica ~0 y la calibracion es degenerada (K indeterminado).
El modulo queda VALIDADO en sintetico con viento artificial de alta velocidad
(test) y se documenta que en Pasto el PV domina.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from optimization.physics.wind import WindTurbine
from optimization.calibration.derating import estimate_derating, apply_derating
from optimization.calibration.experiments import rmse
from optimization.calibration.residual import (residual_features, fit_residual_gbr,
                                               residual_predict)
from optimization.calibration.conformal import conformal_radius, conformal_band

logger = logging.getLogger("optimization.calibration.wind")


def estimate_wind_derating(turbine: WindTurbine, climate: pd.DataFrame,
                           p_real_kw: pd.Series) -> float:
    """K sobre horas con viento util (P_fisica > 1% capacidad)."""
    p_f = turbine.ac_power(climate) / 1000.0
    return estimate_derating(p_f, p_real_kw, turbine.capacity_kw, min_frac=0.01)


class CalibratedWindTurbine:
    """Turbina calibrada: K (+ opcional GBR de residuos)."""

    def __init__(self, turbine: WindTurbine, k: float,
                 residual_model: Optional[GradientBoostingRegressor] = None,
                 residual_q: Optional[np.ndarray] = None,
                 conformal_radius_kw: Optional[float] = None,
                 t0: Optional[pd.Timestamp] = None,
                 meta: Optional[dict] = None):
        self.turbine = turbine
        self.k = k
        self.residual_model = residual_model
        self.residual_q = residual_q
        self.conformal_radius_kw = conformal_radius_kw
        self.t0 = t0
        self.meta = meta or {}

    def _base_kw(self, climate: pd.DataFrame) -> pd.Series:
        return apply_derating(self.turbine.ac_power(climate) / 1000.0, self.k)

    def predict_power(self, climate: pd.DataFrame,
                      use_residual: bool = True) -> pd.Series:
        out = self._base_kw(climate)
        if use_residual and self.residual_model is not None and self.t0 is not None:
            feats = residual_features(climate, self.t0)
            out = out + residual_predict(self.residual_model, feats)
        return out.clip(lower=0.0)

    def predict_band(self, climate: pd.DataFrame) -> pd.DataFrame:
        p50 = self.predict_power(climate)
        if self.conformal_radius_kw is not None:
            return conformal_band(p50, self.conformal_radius_kw)
        if self.residual_q is not None:
            return pd.DataFrame({"P10": p50 + self.residual_q[0], "P50": p50,
                                 "P90": p50 + self.residual_q[2]}).clip(lower=0.0)
        return pd.DataFrame({"P10": p50, "P50": p50, "P90": p50})


def calibrate_wind(turbine: WindTurbine, climate: pd.DataFrame,
                   p_real_kw: pd.Series, train_pct: float = 0.7,
                   seed: int = 7) -> dict:
    """Cascada N1a+N2 completa para eolica. Retorna dict con artefactos."""
    n = len(climate)
    n_tr = int(n * train_pct)
    cli_tr, cli_va = climate.iloc[:n_tr], climate.iloc[n_tr:]
    p_tr, p_va = p_real_kw.iloc[:n_tr], p_real_kw.iloc[n_tr:]

    k = estimate_wind_derating(turbine, cli_tr, p_tr)
    p_base_tr = apply_derating(turbine.ac_power(cli_tr) / 1000.0, k)
    p_base_va = apply_derating(turbine.ac_power(cli_va) / 1000.0, k)

    n_fit = int(0.8 * n_tr)
    resid_fit = p_tr.iloc[:n_fit] - p_base_tr.iloc[:n_fit]
    gbr = fit_residual_gbr(residual_features(cli_tr.iloc[:n_fit], climate.index[0]),
                           resid_fit)
    cal_resid = resid_fit.iloc[-int(0.2 * n_fit):]
    radius = conformal_radius(cal_resid, alpha=0.2)

    pred_va = (p_base_va + residual_predict(
        gbr, residual_features(cli_va, climate.index[0]))).clip(lower=0.0)

    return {
        "k": k,
        "rmse_nominal": rmse(turbine.ac_power(cli_va) / 1000.0, p_va),
        "rmse_derating": rmse(p_base_va, p_va),
        "rmse_hibrido": rmse(pred_va, p_va),
        "calibrated": CalibratedWindTurbine(
            turbine=turbine, k=k, residual_model=gbr, residual_q=np.quantile(
                resid_fit.values, [0.10, 0.50, 0.90]),
            conformal_radius_kw=radius, t0=climate.index[0], meta={"seed": seed}),
    }
