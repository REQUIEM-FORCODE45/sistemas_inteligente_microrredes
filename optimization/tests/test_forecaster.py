# -*- coding: utf-8 -*-
"""Tests del forecaster modular (Fase 2b) — hermet, sin red ni torch."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.prediction.forecaster import (get_climate_provider,
                                                TimesFMClimateForecaster,
                                                PatchTSTClimateForecaster,
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
    """API TimesFM 2.5: forecast(horizon, inputs) -> (point, quantiles)."""
    class FakeModel:
        def forecast(self, horizon, inputs):
            n = len(inputs)  # n_series = 10
            point = np.zeros((n, horizon)) + 1.0
            quants = np.zeros((n, horizon, 10))
            return point, quants

    def fake_load(self):
        self._model = FakeModel()

    monkeypatch.setattr(TimesFMClimateForecaster, "_load_lazy", fake_load)
    tz = "America/Bogota"
    ctx_idx = pd.date_range("2026-01-01", periods=600, freq="h", tz=tz)
    ctx = pd.DataFrame(np.random.default_rng(0).normal(10, 3, (600, 10)),
                       index=ctx_idx, columns=WEATHER_VARIABLES)

    class FakeClient:
        def __init__(self, *a, **k):
            self.timezone = tz

        def fetch_forecast(self, past_days, forecast_days):
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


def test_openmeteo_forecast_pide_corte_desde_ahora(monkeypatch):
    """El forecaster openmeteo debe solicitar start_from_now + past_days."""
    tz = "America/Bogota"
    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        def fetch_forecast(self, **kwargs):
            captured.update(kwargs)
            now = pd.Timestamp.now(tz=tz).floor("h")
            idx = pd.date_range(now - pd.Timedelta(hours=24),
                                periods=24 + 48, freq="h", tz=tz)
            df = pd.DataFrame(1.0, index=idx, columns=WEATHER_VARIABLES)
            # replica el corte real de openmeteo.py con start_from_now
            if kwargs.get("start_from_now"):
                df = df.loc[df.index >= now]
            return df

    monkeypatch.setattr("optimization.prediction.forecaster.OpenMeteoClient",
                        FakeClient)
    prov = get_climate_provider(name="openmeteo")
    # inyecta el cliente falso reemplazando la instancia
    prov._client = FakeClient()
    fc = prov.forecast(days=1.0)
    assert captured.get("start_from_now") is True
    assert captured.get("past_days") >= 1
    assert fc.horizon_h == 24
    now = pd.Timestamp.now(tz=tz).floor("h")
    assert fc.data.index[0] == now


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


def test_patchtst_forecast_mapea_contrato(monkeypatch):
    """PatchTST: forecast(1.0) -> ClimateForecast con las 10 vars contratadas.

    Hermético: NO carga el modelo real; inyecta un FakeModel cuyo forward
    devuelve (B, H, C_tgt=10, Q=3) constantes y decoradores identidad. Eso
    valida el ensamblaje del contrato (columns/index/horizonte) sin torch ni red.
    """
    tz = "America/Bogota"
    ctx_n = PatchTSTClimateForecaster.CONTEXT_LENGTH
    ctx_idx = pd.date_range(pd.Timestamp.now(tz=tz).floor("h")
                            - pd.Timedelta(hours=ctx_n),
                            periods=ctx_n, freq="h", tz=tz)

    class FakeTensor:
        """Wrapper numpy con .numpy() para imitar la salida tensorial del modelo."""

        def __init__(self, arr):
            self._arr = arr

        def numpy(self):
            return self._arr

    class FakeModel:
        H = 72
        n_tgt, n_q = 10, 3

        def __call__(self, x):  # (B, L, C) -> (B, H, C_tgt, Q)
            B = x.shape[0]
            arr = np.full((B, self.H, self.n_tgt, self.n_q), 0.5,
                          dtype=np.float32)
            return FakeTensor(arr)

    # contexto: las CONTEXT_VARS (10 + wind_direction_100m)
    ctx_df = pd.DataFrame(
        np.random.default_rng(0).normal(10, 3,
                                        (ctx_n, len(PatchTSTClimateForecaster.CONTEXT_VARS))),
        index=ctx_idx, columns=PatchTSTClimateForecaster.CONTEXT_VARS)
    # columna 'timestamp' como lo consume add_features/apply_transforms
    ctx_df["timestamp"] = ctx_df.index

    def fake_context(self, anchor=None):
        return ctx_df

    def fake_load(self):
        # desnormaliza constantes + identidad en decode -> P50 = 0.5
        target_cols = [f"{v}__tr" for v in WEATHER_VARIABLES]
        feature_cols = list(PatchTSTClimateForecaster.CONTEXT_VARS) + target_cols
        stats = pd.DataFrame(
            {"mean": 0.0, "std": 1.0},
            index=pd.Index(feature_cols).drop_duplicates())
        model = FakeModel()

        def _add_features(df, lat):
            return df

        def _apply_transforms(df, specs):
            df = df.copy()
            for v in WEATHER_VARIABLES:
                df[f"{v}__tr"] = 0.0
            return df

        def _decode(pred_tr, spec, denom=None, hours=None):
            return pred_tr

        self._ckpt = {
            "feature_cols": feature_cols,
            "target_cols": target_cols,
            "target_names": list(WEATHER_VARIABLES),
            "config": {"forecast": {"quantiles": [0.1, 0.5, 0.9], "horizon": 72}},
        }
        self._stats = stats
        self._specs = {v: {"type": "none"} for v in WEATHER_VARIABLES}
        self._model = (model, _add_features, _apply_transforms, _decode)

    monkeypatch.setattr(PatchTSTClimateForecaster, "_load_lazy", fake_load)
    monkeypatch.setattr(PatchTSTClimateForecaster, "_context_df", fake_context)

    prov = PatchTSTClimateForecaster(site_cfg={"latitude": 1.21,
                                               "longitude": -77.28,
                                               "timezone": tz})
    fc = prov.forecast(days=1.0)
    assert fc.provider == "patchtst"
    assert fc.horizon_h == 24
    assert list(fc.data.columns) == WEATHER_VARIABLES
    assert fc.data.index.tz is not None
    # arranca en la hora actual (contexto termina en now-1h)
    now_h = pd.Timestamp.now(tz=tz).floor("h")
    assert fc.data.index[0] == now_h
    assert (fc.data[["shortwave_radiation", "direct_normal_irradiance",
                     "diffuse_radiation"]] >= 0).all().all()


def test_patchtst_max_horizonte_72h(monkeypatch):
    """PatchTST: pedir mas de 72h -> RuntimeError claro (como TimesFM 48h)."""
    def fake_load(self):
        self._model = None
        raise AssertionError("no debe llegar a cargar modelo")

    def fake_context(self):
        raise AssertionError("no debe pedir contexto")

    monkeypatch.setattr(PatchTSTClimateForecaster, "_load_lazy", fake_load)
    monkeypatch.setattr(PatchTSTClimateForecaster, "_context_df", fake_context)
    prov = PatchTSTClimateForecaster()
    with pytest.raises(RuntimeError, match="72"):
        prov.forecast(days=4.0)


def test_patchtst_checkpoint_faltante_mensaje_claro(monkeypatch, tmp_path):
    """Si falta el .pt, el error menciona donde descomprimir el zip."""
    import builtins as _b

    def fake_exists(self):
        return False

    monkeypatch.setattr("pathlib.Path.exists", fake_exists)
    prov = PatchTSTClimateForecaster()
    with pytest.raises(RuntimeError, match="patchtst_best.pt"):
        prov.forecast(days=1.0)


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
