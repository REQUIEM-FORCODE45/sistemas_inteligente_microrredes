# -*- coding: utf-8 -*-
"""Nivel 1b — Calibracion parametrica (least_squares) del modelo fisico PV.

Ajusta simultaneamente losses_pct, inverter_eta y gamma_pdc (temp_coeff) de
PvPlant minimizando el RMSE contra la medicion real, SOLO en horas de sol
(GHI > 50 W/m2). Reproduce HO#3 seccion 3.1b:

    bounds = {losses (0,30), eta_inv (0.85,1.0), gamma_pdc (-0.6,-0.1)}
    x0     = [losses_nominal, 0.96, gamma_nominal]
    sol    = least_squares(resid, x0, bounds, max_nfev=200)

Nota de identificabilidad (HO#3 sec 10.5): a baja irradiancia los parametros
son colineales; los bounds acotan el problema.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Optional, Tuple

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from optimization.physics.pv import PvPlant

# bounds de HO#3 (Tabla 2.1): [losses_pct %, eta_inv 0-1, gamma_pdc %/C]
BOUNDS: Tuple[Tuple[float, float], ...] = ((0.0, 30.0), (0.85, 1.0), (-0.6, -0.1))
PARAM_NAMES = ("losses_pct", "inverter_eta", "temp_coeff_pct_per_c")
GHI_THRESHOLD_W_M2 = 50.0


def calibrate_params(plant: PvPlant, climate: pd.DataFrame, p_real_kw: pd.Series,
                     x0: Optional[np.ndarray] = None,
                     max_nfev: int = 200) -> dict:
    """Retorna los parametros calibrados {name: value} a partir de mediciones.

    Args:
        plant: planta con parametros de catalogo (se usan como x0).
        climate: clima con columnas de pv.REQUIRED (GHI>50 filtra noche).
        p_real_kw: medicion real [kW], alineada al index de climate.
    """
    ghi = climate["shortwave_radiation"]
    mask = ghi > GHI_THRESHOLD_W_M2
    if mask.sum() < 20:
        raise ValueError(f"Muy pocas horas con GHI>{GHI_THRESHOLD_W_M2}: {mask.sum()}")

    if x0 is None:
        x0 = np.array([plant.losses_pct, 0.96, plant.temp_coeff_pct_per_c])

    lo = np.array([b[0] for b in BOUNDS])
    hi = np.array([b[1] for b in BOUNDS])
    if np.any(x0 < lo) or np.any(x0 > hi):
        x0 = np.clip(x0, lo, hi)

    p_real = p_real_kw.reindex(climate.index).astype(float).values

    def _power(params: np.ndarray) -> np.ndarray:
        plant_p = replace(
            plant,
            losses_pct=float(params[0]),
            inverter_eta=float(params[1]),
            temp_coeff_pct_per_c=float(params[2]),
        )
        return (plant_p.ac_power(climate) / 1000.0).values

    def resid(params: np.ndarray) -> np.ndarray:
        # residuo SOLO en horas de sol (HO#3)
        return _power(params)[mask] - p_real[mask]

    sol = least_squares(resid, x0, bounds=(lo, hi), max_nfev=max_nfev)
    return dict(zip(PARAM_NAMES, (float(v) for v in sol.x)))


def build_plant(plant: PvPlant, params: dict) -> PvPlant:
    """Planta con los parametros calibrados (demas campos iguales)."""
    return replace(
        plant,
        losses_pct=float(params["losses_pct"]),
        inverter_eta=float(params["inverter_eta"]),
        temp_coeff_pct_per_c=float(params["temp_coeff_pct_per_c"]),
    )
