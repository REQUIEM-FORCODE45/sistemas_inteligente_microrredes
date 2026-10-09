# -*- coding: utf-8 -*-
"""Calibracion probabilistica del forecast PV (Fase 3) — split-conformal.

HANDOFF_TECNICO.md sec 9.3: la banda P10-P90 empirica (cuantiles constantes
del residuo train) NO cumple cobertura nominal sobre datos nuevos (HO#1 6.6:
67% < 80%). Aqui se construye una banda con garantia de cobertura
split-conformal: con una fraccion 'cal' de la serie (nunca entrenada por el
GBR ni usada para los cuantiles empiricos) se mide el residuo absoluto del
modelo calibrado y se toma su cuantil (1 - alpha). Ese ancho se SUMA/PONE
simetrico alrededor del punto.

    P_band(t) = P_hat(t) ± q_cal * s(t)

donde q_cal = cuantil (1 - alpha) de los |residuo| en el split de calibracion.
Cobertura esperada ~ 1 - alpha en holdout (garantia conformal de cambio de
distribucion).

Mejora natural (documentada, no implementada): conformal CONDICIONAL (por
hora del dia o irradiancia) — se deja como trabajo futuro (conformal_score).
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("optimization.calibration.conformal")


def conformal_radius(residual: pd.Series, alpha: float = 0.2,
                     method: str = "absolute") -> float:
    """Ancho de la banda conformal a partir de residuos de calibracion.

    method:
      - 'absolute' : cuantil (1-alpha) de |residuo| (banda simetrica)
      - 'squared'  : cuantil (1-alpha) de residuo^2 (equivalente, mas cola)
    """
    if method not in ("absolute", "squared"):
        raise ValueError("method debe ser 'absolute' o 'squared'")
    r = np.abs(residual.to_numpy(dtype=float))
    if method == "squared":
        r = r ** 2
    r = r[np.isfinite(r)]
    if len(r) == 0:
        logger.warning("Residuos vacios para conformal; ancho 0")
        return 0.0
    q = float(np.quantile(r, 1.0 - alpha))
    return q if method == "absolute" else float(np.sqrt(q))


def conformal_band(p50: pd.Series, radius: float) -> pd.DataFrame:
    """Banda P10/P90 = P50 +/- radius (clip >= 0)."""
    return pd.DataFrame({
        "P10": (p50 - radius).clip(lower=0.0),
        "P50": p50,
        "P90": p50 + radius,
    })


def coverage(actual: pd.Series, band: pd.DataFrame) -> float:
    """Fraccion de puntos reales dentro de [P10, P90]."""
    inside = ((actual >= band["P10"]) & (actual <= band["P90"])).sum()
    return float(inside / max(1, len(actual)))


def split_conformal_residual(cal_residual: pd.Series, alpha: float = 0.2,
                             method: str = "absolute") -> float:
    """Wrapper de conformal_radius con nombre explicito (API publica)."""
    return conformal_radius(cal_residual, alpha=alpha, method=method)


def conformal_quantiles(residual: pd.Series,
                        alphas: tuple = (0.1, 0.9)) -> dict:
    """Cuantiles del residuo de calibracion (cambio 06, defecto 2/3).

    El residuo debe medirse contra el predictor FINAL (fisico + GBR) en un
    tramo DISJUNTO del ajuste. Devuelve {"q10": float, "q90": float,
    "n_cal": int} para la banda asimetrica P10 = P50 + q10, P90 = P50 + q90.
    """
    r = residual.to_numpy(dtype=float)
    r = r[np.isfinite(r)]
    if len(r) == 0:
        logger.warning("Residuos vacios para cuantiles; banda nula")
        return {"q10": 0.0, "q90": 0.0, "n_cal": 0}
    lo, hi = float(alphas[0]), float(alphas[1])
    return {"q10": float(np.quantile(r, lo)),
            "q90": float(np.quantile(r, hi)),
            "n_cal": int(len(r))}
