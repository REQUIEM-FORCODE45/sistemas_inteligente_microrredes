# -*- coding: utf-8 -*-
"""Calibracion BESS (Fase 4) — eficiencias reales desde la serie de SOC.

Bess nominal usa charge_efficiency=0.95 y discharge_efficiency=0.95. Una
bateria real tiene eficiencias distintas y capacidad efectiva degradada.
Se identifican (charge_eff, discharge_eff, capacity_kwh) minimizando el RMSE
del SOC simulado contra el SOC medido (con ruido de sensor), via least_squares.

    theta* = argmin RMSE( Bess(theta).simulate(power_kw).soc_pct
                          vs soc_medido_pct )
    bounds: charge_eff/discharge_eff in [0.80, 1.00], capacity in [0.5,1.0]*nominal

El esquema N2 (GBR de residuos) es menos central en BESS (el SOC ya es la
integral de la energia); se deja como extension documentada.
"""
from __future__ import annotations

import logging
from dataclasses import replace

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from optimization.physics.bess import Bess

logger = logging.getLogger("optimization.calibration.bess")

BOUNDS = ((0.80, 1.00), (0.80, 1.00), (0.5, 1.0))   # ch_eff, dis_eff, cap_frac


def simulate_soc(bess: Bess, power_kw: pd.Series, dt_h: float = 1.0) -> pd.Series:
    return bess.simulate(power_kw, dt_h=dt_h)["soc_pct"]


def calibrate_bess(bess: Bess, power_kw: pd.Series, soc_meas_pct: pd.Series,
                   dt_h: float = 1.0, x0=None) -> dict:
    """Identifica eficiencias y capacidad desde el SOC medido.

    Args:
        bess: Bess nominal (catalogo).
        power_kw: potencia neta (positivo carga / negativo descarga).
        soc_meas_pct: SOC medido [%] (con ruido de sensor).
        dt_h: paso temporal en horas.

    Returns: dict {charge_efficiency, discharge_efficiency, capacity_kwh,
                   rmse_inicial, rmse_final}.
    """
    if x0 is None:
        x0 = np.array([bess.charge_efficiency, bess.discharge_efficiency, 1.0])
    lo = np.array([b[0] for b in BOUNDS])
    hi = np.array([b[1] for b in BOUNDS])
    x0 = np.clip(x0, lo, hi)
    soc = soc_meas_pct.reindex(power_kw.index).astype(float).values

    def _soc(x: np.ndarray) -> np.ndarray:
        b = replace(bess, charge_efficiency=float(x[0]),
                    discharge_efficiency=float(x[1]),
                    capacity_kwh=float(bess.capacity_kwh * x[2]))
        return simulate_soc(b, power_kw, dt_h=dt_h).values

    def resid(x: np.ndarray) -> np.ndarray:
        return _soc(x) - soc

    rmse0 = float(np.sqrt(np.mean(resid(x0) ** 2)))
    sol = least_squares(resid, x0, bounds=(lo, hi), max_nfev=120)
    rmse1 = float(np.sqrt(np.mean(resid(sol.x) ** 2)))
    return {
        "charge_efficiency": float(sol.x[0]),
        "discharge_efficiency": float(sol.x[1]),
        "capacity_kwh": float(bess.capacity_kwh * sol.x[2]),
        "rmse_soc_inicial_pct": rmse0,
        "rmse_soc_final_pct": rmse1,
    }


def calibrated_bess(bess: Bess, params: dict) -> Bess:
    """Bess con los parametros calibrados."""
    return replace(bess, charge_efficiency=params["charge_efficiency"],
                   discharge_efficiency=params["discharge_efficiency"],
                   capacity_kwh=params["capacity_kwh"])
