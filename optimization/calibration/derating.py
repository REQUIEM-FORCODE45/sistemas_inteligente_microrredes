# -*- coding: utf-8 -*-
"""Nivel 1a — Factor de derating K (correccion de sesgo lineal, HO#3 sec 3).

Estima un factor multiplicativo K que minimiza (en minimos cuadrados sin
intercepto) la potencia fisica contra la medicion real:

    K = sum(P_fisico * P_real) / sum(P_fisico^2)   (solo horas con sol)

y luego P_ajustada = K * P_fisico. Es la correccion mas barata y suele captar
~98% del sesgo (Exp.1) y ~47% (Exp.2) en HO#3.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def estimate_derating(p_fisico_kw: pd.Series, p_real_kw: pd.Series,
                      capacity_kwp: float, min_frac: float = 0.01) -> float:
    """K = argmin sum(P_f - K*P_real)^2 en horas con P_f > 1% de la capacidad.

    Args:
        p_fisico_kw: potencia fisica nominal [kW] (mismo index que p_real_kw).
        p_real_kw:   potencia medida [kW].
        capacity_kwp: capacidad pico de la planta [kW].
        min_frac:    fraccion de capacidad para filtrar la noche (HO#3: 1%).
    """
    p_f = np.asarray(p_fisico_kw, dtype=float)
    p_r = np.asarray(p_real_kw, dtype=float)
    mask = p_f > min_frac * capacity_kwp
    if mask.sum() < 10:
        raise ValueError(f"Demasiadas pocas horas con sol para derating ({mask.sum()})")
    p_f, p_r = p_f[mask], p_r[mask]
    k = float(np.dot(p_f, p_r) / np.dot(p_f, p_f))
    return k


def apply_derating(p_fisico_kw: pd.Series, k: float) -> pd.Series:
    return p_fisico_kw * k
