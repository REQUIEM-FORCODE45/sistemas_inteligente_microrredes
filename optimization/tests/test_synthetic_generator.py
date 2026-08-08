# -*- coding: utf-8 -*-
"""Tests del generador de sensores sinteticos (HO#3).

Verifican la cadena clima-real -> planta con "verdad oculta" -> medicion:
    - end-to-end en granularidad 5 min sin NaN
    - seed 7 (limpio) menos ruido que seed 42 (realista) para PV
    - senal eolica ~0 en Pasto (viento real escaso)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.config.loader import load_site
from optimization.data.synthetic.generator import generate_sensors, upsample_climate

SITE = "pasto_narino"


def _fake_climate(days: int = 2, tz="America/Bogota") -> pd.DataFrame:
    idx = pd.date_range("2026-06-01", periods=days * 24, freq="h", tz=tz)
    day = np.arange(days * 24) % 24
    c = pd.DataFrame(index=idx)
    ghi = np.maximum(0, np.sin(day / 24 * 2 * np.pi)) * 800
    c["shortwave_radiation"] = ghi
    c["direct_normal_irradiance"] = ghi * 0.75
    c["diffuse_radiation"] = ghi * 0.25
    c["temperature_2m"] = 18 + 6 * np.sin(day / 24 * 2 * np.pi)
    c["relative_humidity_2m"] = 70.0
    c["cloud_cover"] = 40.0
    c["wind_speed_100m"] = 2.0
    c["wind_speed_10m"] = 1.0
    c["surface_pressure"] = 757.0
    c["precipitation"] = 0.0
    return c


@pytest.fixture(scope="module")
def cfg():
    return load_site(SITE)


def test_upsample_climate_5min(cfg):
    c = _fake_climate()
    up = upsample_climate(c, "5min")
    expected = len(pd.date_range(c.index.min(), c.index.max() + pd.Timedelta("5min"),
                                 freq="5min", inclusive="left"))
    assert len(up) == expected
    assert not up["shortwave_radiation"].isna().any()
    assert (up["shortwave_radiation"] >= 0).all()


def test_generate_sensors_end_to_end(cfg):
    sensors = generate_sensors(_fake_climate(), seed=7, cfg=cfg, step="5min")
    expected = {"weather", "solar_pv", "load", "bess", "wind"}
    assert set(sensors) == expected
    n = len(sensors["weather"])
    for name, df in sensors.items():
        assert len(df) == n, name
        assert df.index.tz is not None, name
        assert not df.isna().all().any(), name


def test_seed_7_cleaner_than_42(cfg):
    c = _fake_climate()
    g7 = generate_sensors(c, seed=7, cfg=cfg)
    g42 = generate_sensors(c, seed=42, cfg=cfg)
    t7 = g7["solar_pv"].power_truth_kw
    m7 = g7["solar_pv"].power_kw
    m42 = g42["solar_pv"].power_kw
    assert m7.mean() > 0
    assert m42.mean() > 0
    # seed 42 introduce suciedad/ruido: la medicion se aleja mas de la verdad
    assert abs(m42 - t7).mean() > abs(m7 - t7).mean()


def test_wind_negligible_in_pasto(cfg):
    g = generate_sensors(_fake_climate(), seed=7, cfg=cfg)
    assert g["wind"].power_kw.mean() < 0.05
    assert (g["wind"].power_kw >= 0).all()
