# -*- coding: utf-8 -*-
"""Tests de baselines de forecast (Fase 2b) — hermet, sin red."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.prediction.baselines import (persistence_forecast,
                                               climatology_forecast,
                                               arima_forecast, baseline_mae)


def make_climate(days: int = 40, tz="America/Bogota") -> pd.DataFrame:
    idx = pd.date_range("2026-01-01", periods=days * 24, freq="h", tz=tz)
    hour = idx.hour.to_numpy()
    df = pd.DataFrame(index=idx)
    df["shortwave_radiation"] = np.maximum(0, np.sin(hour / 24 * 2 * np.pi)) * 800
    df["temperature_2m"] = 18 + 6 * np.sin(hour / 24 * 2 * np.pi)
    df["relative_humidity_2m"] = 70.0
    df["wind_speed_10m"] = 1.0 + 0.3 * np.sin(hour / 24 * 2 * np.pi)
    return df


def test_persistence_perfecta_en_serie_periodica():
    """Con ciclo diario puro, la persistencia lag=24 debe acertar ~exacto."""
    df = make_climate(10)
    fc = persistence_forecast(df.iloc[:-24], 24, lag_h=24)
    assert len(fc) == 24
    mae = (fc - df.iloc[-24:]).abs().mean().mean()
    assert mae < 1e-6


def test_persistence_estructura():
    df = make_climate(5)
    fc = persistence_forecast(df, 12, lag_h=24)
    assert len(fc) == 12
    assert set(fc.columns) == set(df.columns)
    assert fc.index[0] == df.index[-1] + pd.Timedelta(hours=1)


def test_climatology_cerca_en_ciclo_diario():
    df = make_climate(40)
    train, actual = df.iloc[:-24], df.iloc[-24:]
    fc = climatology_forecast(train, 24)
    assert len(fc) == 24
    mae_ghi = (fc["shortwave_radiation"] - actual["shortwave_radiation"]).abs().mean()
    assert mae_ghi < 40.0  # la media por hora+doy captura el ciclo


def test_arima_estructura():
    df = make_climate(40)
    fc = arima_forecast(df.iloc[:-24], 24, order=(1, 0, 0))
    assert len(fc) == 24
    assert set(fc.columns) == set(df.columns)
    assert fc["temperature_2m"].notna().all()


def test_baseline_mae_formato():
    df = make_climate(40)
    mae = baseline_mae("climatology", df.iloc[:-24], df.iloc[-24:])
    assert mae.shape[0] == 1
    assert mae.index[0] == "climatology"
    assert "shortwave_radiation" in mae.columns
    assert (mae >= 0).all().all()
