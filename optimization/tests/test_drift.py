# -*- coding: utf-8 -*-
"""Tests del detector de drift (Fase 6) — hermet, sin red."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.monitoring.drift import detect_drift, rolling_rmse, simulated_monitoring


def _positive_series(days: int = 45) -> pd.Series:
    idx = pd.date_range("2026-01-01", periods=days * 24, freq="h", tz="America/Bogota")
    x = np.arange(days * 24)
    return pd.Series(10 + 7.5 * (1 + np.sin(x / 24 * 2 * np.pi)), index=idx)


def test_rolling_rmse_forma():
    pred = _positive_series(10)
    rng = np.random.default_rng(0)
    meas = pred + rng.normal(0, 0.5, len(pred))
    rm = rolling_rmse(pred, meas, window_h=48)
    assert len(rm) == len(pred)
    assert 0.4 < rm.iloc[-1] < 0.7


def test_detect_drift_sin_deriva():
    pred = _positive_series()
    rng = np.random.default_rng(1)
    meas = pred + rng.normal(0, 0.5, len(pred))
    st = detect_drift(pred, meas, baseline_rmse_kw=0.6)
    assert st.drift is False
    assert st.ratio < 1.0


def test_detect_drift_con_deriva():
    pred = _positive_series()
    st = simulated_monitoring(pred, drift_after_h=24 * 5, noise=0.5,
                              drift_scale=3.0, baseline_rmse_kw=0.6)
    assert st.drift is True
    assert st.ratio > 2.0
    assert st.history  # serie de RMSE para graficar


def test_insuficientes_muestras():
    idx = pd.date_range("2026-01-01", periods=23, freq="h", tz="America/Bogota")
    pred = pd.Series(np.full(23, 10.0), index=idx)
    meas = pred + 0.1
    st = detect_drift(pred, meas, baseline_rmse_kw=0.6)
    assert st.drift is False
    assert st.n_samples < 24
