# -*- coding: utf-8 -*-
"""Nivel 2 — Correccion de residuos con GradientBoostingRegressor (HO#3 sec 3.2).

El ML aprende el residuo r(t) = P_real(t) - P_fisico_calibrado(t) a partir de
features observables. El residuo se entrena SIEMPRE contra la base CALIBRADA
(regla de oro, HO#3 sec 3.2): nunca contra el modelo nominal, o los errores se
suman (RMSE 1.68 vs 0.44 en el Exp.2).

Features (HO#3 sec 3.2):
    hour_sin / hour_cos -> patrones horarios (sombra matutina, perfil del dia)
    doy_sin / doy_cos   -> estacionalidad anual
    elapsed_days        -> suciedad/degradacion progresiva
    ghi                 -> dependencia de la intensidad solar
    temp                -> dependencia termica
    precip_cum          -> (mejora de diseno) lluvia acum. desde la ultima
                           limpieza natural: captura que la lluvia reinicia
                           la suciedad (HO#3 sec 9)

Hiperparametros fijos Reproducibles:
  n_estimators=200, learning_rate=0.05, max_depth=3, random_state=42
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

GBR_PARAMS = dict(n_estimators=200, learning_rate=0.05, max_depth=3, random_state=42)


# --------------------------------------------------------------------------- #
def residual_features(climate: pd.DataFrame, t0: pd.Timestamp,
                      with_precip_cum: bool = True) -> pd.DataFrame:
    """Matriz de features de residuo, index igual al clima.

    Args:
        climate: clima con las 10 vars contratadas (index tz-aware).
        t0: inicio de la serie temporal (para costruir elapsed_days).
        with_precip_cum: agrega 'precip_cum' (acumulada desde ultima lluvia).
    """
    idx = climate.index
    hour = idx.hour.to_numpy()
    doy = idx.dayofyear.to_numpy()
    t_days = ((idx - t0).total_seconds().to_numpy() / 86400.0)

    feats = {
        "hour_sin": np.sin(2 * np.pi * hour / 24.0),
        "hour_cos": np.cos(2 * np.pi * hour / 24.0),
        "doy_sin": np.sin(2 * np.pi * doy / 365.25),
        "doy_cos": np.cos(2 * np.pi * doy / 365.25),
        "elapsed_days": t_days,
        "ghi": climate["shortwave_radiation"].to_numpy().astype(float),
        "temp": climate["temperature_2m"].to_numpy().astype(float),
    }
    if with_precip_cum and "precipitation" in climate.columns:
        feat = precip_accum(climate["precipitation"].to_numpy().astype(float))
        feats["precip_cum"] = feat
    return pd.DataFrame(feats, index=idx)


def precip_accum(mm: np.ndarray, threshold: float = 1.0) -> np.ndarray:
    """'Dias/horas desde la ultima lluvia fuerte' que limpia los paneles.

    Feature que captura el ciclo soiling (HO#3 sec 9): la suciedad se acumula
    por dias y la LLuvia la reinicia. Cuenta pasos desde el ultimo evento con
    mm >= threshold (resetea a 0; de lo contrario avanza 1 por paso).

    >>> precip_accum(np.array([0,0,5,0,0,2,0]))
    array([1., 2., 0., 1., 2., 0., 1.])
    """
    out = np.zeros(len(np.asarray(mm)), dtype=float)
    cnt = 0.0
    for i, v in enumerate(np.asarray(mm, dtype=float)):
        if v >= threshold:
            cnt = 0.0
        else:
            cnt += 1.0
        out[i] = cnt
    return out


# --------------------------------------------------------------------------- #
def fit_residual_gbr(features: pd.DataFrame, residual: pd.Series,
                     sample_weight: pd.Series | None = None) -> GradientBoostingRegressor:
    """Entrena el GBR de residuos. ALINEA por index (features x residual)."""
    X = features.loc[residual.index].fillna(0.0)
    model = GradientBoostingRegressor(**GBR_PARAMS)
    if sample_weight is not None:
        model.fit(X, residual.values, sample_weight=sample_weight.loc[residual.index].values)
    else:
        model.fit(X, residual.to_numpy())
    return model


def residual_predict(model: GradientBoostingRegressor,
                     features: pd.DataFrame) -> pd.Series:
    return pd.Series(model.predict(features.fillna(0.0)), index=features.index)


def feature_importance(model: GradientBoostingRegressor,
                       features: pd.DataFrame) -> pd.DataFrame:
    """'feature -> importancia' para diagnosticar que aprendio el ML (HO#3)."""
    return (pd.DataFrame({"feature": features.columns,
                          "importance": model.feature_importances_})
            .sort_values("importance", ascending=False))