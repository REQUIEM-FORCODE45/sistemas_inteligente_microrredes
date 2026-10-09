# -*- coding: utf-8 -*-
"""Tests de calibracion conformal (Fase 3) — hermet, sin red."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.calibration.conformal import (conformal_radius, conformal_band,
                                                coverage, split_conformal_residual,
                                                conformal_quantiles)


def test_radius_absolute_es_cuantil():
    rng = np.random.default_rng(0)
    resid = pd.Series(rng.normal(0, 1.0, 5000))
    r = conformal_radius(resid, alpha=0.2)
    # cuantil 0.8 de |N(0,1)| = 1.2816
    assert abs(r - 1.2816) < 0.05


def test_radius_squared_mayor_que_absolute():
    rng = np.random.default_rng(1)
    resid = pd.Series(rng.normal(0, 1.0, 5000))
    assert conformal_radius(resid, method="squared") > conformal_radius(resid)


def test_coverage_cumple_nominal():
    """Con residuos gaussianos, la banda conformal cubre ~1-alpha."""
    rng = np.random.default_rng(2)
    p50 = pd.Series(rng.uniform(5, 30, 2000))
    resid = pd.Series(rng.normal(0, 1.0, 2000))
    actual = (p50 + resid).clip(lower=0.0)
    r = split_conformal_residual(pd.Series(rng.normal(0, 1.0, 2000)), alpha=0.2)
    band = conformal_band(p50, r)
    cov = coverage(actual, band)
    assert 0.75 <= cov <= 0.85  # nominal 80% (conforme a garantia split)


def test_band_estructura_y_clip():
    p50 = pd.Series([1.0, 5.0, 30.0])
    band = conformal_band(p50, radius=2.0)
    assert list(band.columns) == ["P10", "P50", "P90"]
    assert (band >= 0).all().all()
    assert band["P10"][0] == 0.0  # 1.0 - 2.0 -> clip 0


def test_quantiles_asimetricos_forma():
    rng = np.random.default_rng(3)
    resid = pd.Series(rng.normal(0.5, 1.0, 1000))
    bq = conformal_quantiles(resid, alphas=(0.1, 0.9))
    assert set(bq) == {"q10", "q90", "n_cal"}
    assert bq["n_cal"] == 1000
    assert bq["q10"] < bq["q90"]
    assert abs(bq["q10"] - (-0.78)) < 0.15  # q10 de N(0.5,1)
    assert abs(bq["q90"] - 1.78) < 0.15


def test_banda_asimetrica_cubre_heterocedastico():
    """Cambio 06: con error heterocedastico, los cuantiles del tramo de
    calibracion cubren el nominal en holdout (la simetrica falla aqui)."""
    rng = np.random.default_rng(4)
    n = 4000
    sigma = 0.5 + 0.1 * np.arange(n)  # varianza creciente
    resid = pd.Series(rng.normal(0, sigma))
    idx = rng.permutation(n)  # misma distribucion en cal y holdout
    cal, hold = resid.iloc[idx[:2000]], resid.iloc[idx[2000:]]
    bq = conformal_quantiles(cal, alphas=(0.1, 0.9))
    p50 = pd.Series(np.zeros(len(hold)), index=hold.index)
    band = pd.DataFrame({"P10": p50 + bq["q10"], "P50": p50,
                         "P90": p50 + bq["q90"]})
    cov = coverage(hold, band)
    assert cov >= 0.70  # nominal 0.80; la asimetrica lo sostiene
