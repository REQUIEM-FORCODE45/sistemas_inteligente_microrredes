# -*- coding: utf-8 -*-
"""Tests del forecaster modular (Fase 2b) — hermet, sin red ni torch."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.prediction.forecaster import (get_climate_provider,
                                                TimesFMClimateForecaster,
                                                WEATHER_VARIABLES)
from optimization.prediction.power_forecast import power_forecast_from_climate
from optimization.physics.pv import PvPlant


def test_factory_openmeteo():
    prov = get_climate_provider(name="openmeteo")
    assert prov.provider_name == "openmeteo_nwp"


def test_factory_desconocido_cae_a_openmeteo():
    prov = get_climate_provider(name="narnia")
    assert prov.provider_name == "openmeteo_nwp"


def test_factory_env_override(monkeypatch):
    monkeypatch.setenv("FORECASTER", "patchtst")
    prov = get_climate_provider()
    assert prov.provider_name == "patchtst"


def test_timesfm_forecast_mapea_contrato(monkeypatch):
    """Sin timesfm instalado: el import lazy debe fallar con mensaje claro."""
    import sys

    class FakeModel:
        def forecast(self, inputs, freq, horizon):
            n = inputs.shape[0]  # n_series = 10
            return np.zeros((n, horizon)) + 1.0  # serie plana

    def fake_load(self):
        self._model = FakeModel()

    monkeypatch.setattr(TimesFMClimateForecaster, "_load_lazy", fake_load)
    tz = "America/Bogota"
    ctx_idx = pd.date_range("2026-01-01", periods=600, freq="h", tz=tz)
    ctx = pd.DataFrame(np.random.default_rng(0).normal(10, 3, (600, 10)),
                       index=ctx_idx, columns=WEATHER_VARIABLES)

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def fetch_archive(self, start, end):
            return ctx

    monkeypatch.setattr("optimization.prediction.forecaster.OpenMeteoClient",
                        FakeClient)
    prov = TimesFMClimateForecaster(site_cfg={"latitude": 1.21, "longitude": -77.28,
                                              "timezone": tz})
    fc = prov.forecast(days=1.0)
    assert fc.provider == "timesfm"
    assert fc.horizon_h == 24
    assert list(fc.data.columns) == WEATHER_VARIABLES
    assert fc.data.index[0] == ctx.index[-1] + pd.Timedelta(hours=1)
    assert fc.data.index.tz is not None
    assert (fc.data[["shortwave_radiation", "direct_normal_irradiance",
                     "diffuse_radiation"]] >= 0).all().all()


def test_timesfm_sin_lib_mensaje_claro():
    import builtins
    real_import = builtins.__import__

    def fake_import(name, *a, **k):
        if name == "timesfm":
            raise ImportError("No module named 'timesfm'")
        return real_import(name, *a, **k)

    with pytest.raises(RuntimeError, match="timesfm"):
        old = builtins.__import__
        builtins.__import__ = fake_import
        try:
            TimesFMClimateForecaster(site_cfg={"latitude": 1.2, "longitude": -77.3,
                                               "timezone": "America/Bogota"}).forecast(1.0)
        finally:
            builtins.__import__ = old


def test_power_band_desde_clima_sintetico():
    """power_forecast_from_climate con planta nominal devuelve P50 sin banda."""
    idx = pd.date_range("2026-06-01", periods=48, freq="h", tz="America/Bogota")
    day = np.arange(48) % 24
    c = pd.DataFrame(index=idx)
    ghi = np.maximum(0, np.sin(day / 24 * 2 * np.pi)) * 800
    c["shortwave_radiation"] = ghi
    c["direct_normal_irradiance"] = ghi * 0.75
    c["diffuse_radiation"] = ghi * 0.25
    c["temperature_2m"] = 18.0
    c["relative_humidity_2m"] = 70.0
    c["cloud_cover"] = 40.0
    c["wind_speed_100m"] = 2.0
    c["wind_speed_10m"] = 1.0
    c["surface_pressure"] = 757.0
    c["precipitation"] = 0.0
    band = power_forecast_from_climate(c, PvPlant(capacity_kwp=50.0))
    assert list(band.columns) == ["P10", "P50", "P90"]
    assert (band["P10"] == band["P50"]).all()  # nominal: sin banda
    assert band["P50"].max() > 10.0
