# -*- coding: utf-8 -*-
"""Parametros "ocultos" de la planta y efectos no-fisicos (KEY respuestas).

Metodologia HO#3 (HANDOFF_TECNICO_3, seccion 2 y 5): nosotros fijamos la
verdad de una planta ficticia; el calibrador (Fase 4) debe recuperarla a
partir solo de las mediciones. Seeds fijas para reproducibilidad.

- seed 7  = planta LIMPIA (solo parametros distintos + ruido).  [Exp.1]
- seed 42 = planta REALISTA (suciedad progresiva + sombra 6-10h + ruido). [Exp.2]
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Verdades por seed (parametros "reales" que la recircula de calibracion debe
# recuperar). HO#3 Tabla 2.1 bounds del calibrador:
#   losses_pct in [0, 30], eta_inv in [0.85, 1.0], gamma in [-0.6, -0.1]
# ---------------------------------------------------------------------------
HIDDEN = {
    # experimento "limpio" (HO#3 Exp.1): la planta real difiere del catalogo
    # (losses 21 vs 14, eta 0.93 vs 0.96, gamma -0.42 vs -0.38).
    7: {"losses_pct": 21.0, "inverter_eta": 0.93, "temp_coeff_pct_per_c": -0.42,
        "soiling": False, "shade": False, "noise_sigma_kw": 0.5},
    # experimento "realista" (HO#3 Exp.2): la PLANTA es la misma (verdad de 7),
    # pero se inyectan soiling (1.0->0.85/150d) + sombra mañana (6-10h).
    # NOTA: los valores [28/0.86/-0.10] a los que calibra en HO#3 son el
    # RESULTADO 'contaminado' del calibrador, NO la verdad (ver HO#3 sec 5.2).
    42: {"losses_pct": 21.0, "inverter_eta": 0.93, "temp_coeff_pct_per_c": -0.42,
         "soiling": True, "shade": True, "noise_sigma_kw": 0.5},
}

# ruido por defecto (independiente por muestra), usado si no esta en HIDDEN
DEFAULT_NOISE_SIGMA_KW = 0.5


def hidden_params(seed: int, **overrides) -> dict:
    """Retorna la verdad oculta del+ seed, con overrides opcionales."""
    params = dict(HIDDEN.get(seed, HIDDEN[7]))
    params.update(overrides)
    return params


# ---------------------------------------------------------------------------
# Efectos no-fisicos (HO#3 seccion 5.1)
# ---------------------------------------------------------------------------
def soiling_factor(t_days: pd.Series, fraction: float = 0.15,
                   over_days: float = 150.0) -> pd.Series:
    """Eficiencia por suciedad progresiva: 1.0 -> (1 - fraction) en over_days."""
    return np.clip(1.0 - fraction * (t_days / over_days), 1.0 - fraction, 1.0)


def shade_factor(index: pd.DatetimeIndex, start_h: int = 6, end_h: int = 10,
                 factor: float = 0.6) -> pd.Series:
    """Sombra matutina: reduce la potencia 40% (factor 0.6) entre start-end h."""
    hour = index.hour
    return pd.Series(
        np.where((hour >= start_h) & (hour < end_h), factor, 1.0),
        index=index)


def measured_cleaning(p_truth_kw: pd.Series, seed: int,
                      noise_sigma_kw: float | None = None,
                      rng=None, t_days: pd.Series | None = None,
                      index_hour: pd.Series | None = None) -> pd.Series:
    """Aplica efectos (soiling/shade) + ruido a la potencia 'verdadera'.

    Replica HO#3:
       p_meas = clip(p_truth * soiling * shade + N(0, sigma), 0, None)
    """
    h = HIDDEN.get(seed, HIDDEN[7])
    sigma = noise_sigma_kw if noise_sigma_kw is not None else h.get("noise_sigma_kw", 0.5)
    if rng is None:
        rng = np.random.default_rng(seed)
    out = p_truth_kw.copy()
    if h.get("soiling", False):
        out = out * soiling_factor(t_days)
    if h.get("shade", False):
        out = out * shade_factor(p_truth_kw.index)
    out = out + rng.normal(0.0, sigma, len(out))
    return out.clip(lower=0.0)