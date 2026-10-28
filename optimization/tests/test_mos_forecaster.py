# -*- coding: utf-8 -*-
"""Tests del MOS + iTransformer (sprint 1, paso 5.6 / paquete A.0).

Herméticos (sin red): usan los artefactos reales versionados
(`prediction/mos/...`) con contexto/proxy sintéticos. Requieren
torch+lightgbm (dependencias de producción del MOS), pero ninguna
llamada de red.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import optimization.prediction.mos_forecaster as mos_mod
from optimization.prediction.mos_forecaster import (
    MOSClimateForecaster,
    _FEAT_NAMES,
    _MOS_TARGETS,
    clip_itransformer_phys,
)
from optimization.prediction.forecaster import WEATHER_VARIABLES

SITE = {"latitude": 1.2136, "longitude": -77.2811, "timezone": "America/Bogota"}
TZ = "America/Bogota"


def _ctx_sintetico(anchor: pd.Timestamp, n: int = 512) -> pd.DataFrame:
    """Contexto sintético físicamente plausible (512 h hasta anchor-1h)."""
    rng = np.random.default_rng(7)
    idx = pd.date_range(anchor - pd.Timedelta(hours=n), periods=n, freq="h",
                        tz=TZ)
    hour = idx.hour.values + idx.minute.values / 60.0
    ghi = np.maximum(0, np.sin((hour - 6) / 12 * np.pi)) * 800 \
        + rng.normal(0, 20, n)
    ghi = np.clip(ghi, 0, None)
    df = pd.DataFrame(index=idx)
    df["shortwave_radiation"] = ghi
    df["direct_normal_irradiance"] = ghi * 0.7
    df["diffuse_radiation"] = ghi * 0.3
    df["temperature_2m"] = 14 + 3 * np.sin((hour - 9) / 24 * 2 * np.pi)
    df["relative_humidity_2m"] = np.clip(75 - 0.02 * ghi, 30, 100)
    df["cloud_cover"] = np.clip(rng.uniform(0, 100, n), 0, 100)
    df["wind_speed_100m"] = np.clip(rng.normal(3, 1, n), 0.1, None)
    df["wind_speed_10m"] = np.clip(rng.normal(1.5, 0.5, n), 0.1, None)
    df["wind_direction_100m"] = rng.uniform(0, 360, n)
    df["surface_pressure"] = 758 + rng.normal(0, 1, n)
    df["precipitation"] = 0.0
    return df


def _proxy_sintetico(now_hour: pd.Timestamp, hours: int) -> pd.DataFrame:
    """Proxy ECMWF sintético con las 7 tags que pide _ECMWF_COLS."""
    idx = pd.date_range(now_hour, periods=hours, freq="h", tz=TZ)
    hour = idx.hour.values
    ghi = np.maximum(0, np.sin((hour - 6) / 12 * np.pi)) * 800
    return pd.DataFrame({
        "ghi": ghi, "nubes": 50.0, "temp": 15.0, "viento": 2.0,
        "rh": 70.0, "pres": 758.0, "precip": 0.0,
    }, index=idx)


def _mos_hermetico(monkeypatch, anchor: pd.Timestamp) -> MOSClimateForecaster:
    """MOS con red simulada: contexto y proxy sintéticos, modelos reales."""
    ctx = _ctx_sintetico(anchor)
    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    monkeypatch.setattr(prov, "_context_df", lambda anchor=None: ctx)
    monkeypatch.setattr(
        prov, "_proxy_df",
        lambda start, hours, live: _proxy_sintetico(start, hours))
    return prov


# --------------------------------------------------------------------- #
def test_mos_boosters_cargan_y_declaran_8_features():
    """Los 10 boosters cargan y declaran las 8 features de _FEAT_NAMES."""
    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    prov._load_lazy()
    assert set(prov._lgbm) == set(_MOS_TARGETS) and len(prov._lgbm) == 10
    for var, booster in prov._lgbm.items():
        assert booster.num_feature() == len(_FEAT_NAMES) == 8, var
    assert prov._imodel is not None  # checkpoint 42/42 (strict=True)


def test_guarda_features_falla_si_se_rompe_la_lista(monkeypatch):
    """Mutante: con _FEAT_NAMES rota la carga debe fallar con ruido.

    Si este test no fallara, la guarda de coherencia booster-vs-lista
    sería decorativa. Se rompe la lista en una copia (monkeypatch la
    revierte solo) y se exige RuntimeError.
    """
    monkeypatch.setattr(mos_mod, "_FEAT_NAMES",
                        list(_FEAT_NAMES) + ["feature_fantasma"])
    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    with pytest.raises(RuntimeError, match="features"):
        prov._load_lazy()


def test_itransformer_sort_monotonia():
    """El forward del iTransformer cumple P10 <= P50 <= P90 sin excepciones.

    B=16 pases sobre entradas estandarizadas (la distribución que ve el
    modelo en producción): 11520 tripletas. Pre-A.1 se midieron 5 cruces
    en 2160 comparaciones reales; sin el sort este test falla con
    probabilidad ~1 (esperados ~27 cruces en 11520).
    """
    import torch

    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    prov._load_lazy()
    rng = np.random.default_rng(11)
    x = torch.tensor(rng.normal(0, 1, (16, 512, 33)).astype(np.float32))
    with torch.no_grad():
        y = prov._imodel(x).cpu().numpy()
    assert y.shape == (16, 72, 10, 3)
    assert np.isfinite(y).all()
    assert (y[..., 0] <= y[..., 1]).all(), "cruce P10 > P50"
    assert (y[..., 1] <= y[..., 2]).all(), "cruce P50 > P90"


def test_clip_itransformer_fisico_con_conteo():
    """Recorte a rango físico con conteo exacto; el resto no se toca."""
    h = 72
    out = {
        "relative_humidity_2m": np.full(h, 105.0),   # 72 recortes
        "cloud_cover": np.concatenate([np.full(62, 120.0),
                                       np.full(10, 40.0)]),  # 62
        "precipitation": np.concatenate([np.full(43, -0.5),
                                         np.zeros(29)]),  # 43
        "shortwave_radiation": np.concatenate([np.full(5, -3.0),
                                               np.full(67, 500.0)]),  # 5
        "temperature_2m": np.full(h, -50.0),          # sin cota: intacta
        "wind_speed_100m": np.full(h, -3.0),          # sin cota: intacta
    }
    clipped, counts = clip_itransformer_phys(out)
    assert counts == {"relative_humidity_2m": 72, "cloud_cover": 62,
                      "precipitation": 43, "shortwave_radiation": 5}
    assert (clipped["relative_humidity_2m"] == 100.0).all()
    assert (clipped["cloud_cover"][:62] == 100.0).all()
    assert (clipped["precipitation"][:43] == 0.0).all()
    assert (clipped["shortwave_radiation"][:5] == 0.0).all()
    assert (clipped["temperature_2m"] == -50.0).all()  # declarada, no tocada
    assert (clipped["wind_speed_100m"] == -3.0).all()


def test_mos_contrato_hermetico_72x10(monkeypatch):
    """Contrato: 72 filas x 10 columnas exactas, índice tz-aware, sin NaN."""
    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _mos_hermetico(monkeypatch, anchor)
    fc = prov.forecast(days=3.0, anchor=anchor)
    assert fc.provider == "mos"
    assert fc.horizon_h == 72
    assert list(fc.data.columns) == list(WEATHER_VARIABLES)
    assert len(fc.data) == 72
    assert fc.data.index.tz is not None
    assert fc.data.index[0] == anchor.floor("h")
    assert not bool(fc.data.isna().any().any())
    for col in ("shortwave_radiation", "direct_normal_irradiance",
                "diffuse_radiation", "wind_speed_100m", "wind_speed_10m",
                "precipitation"):
        assert (fc.data[col].values >= 0).all(), col


def test_mos_horizonte_mayor_72h_falla(monkeypatch):
    """Pedir más de 72 h falla antes de tocar la red."""
    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    with pytest.raises(RuntimeError, match="72"):
        prov.forecast(days=4.0)


# --------------------------------------------------------------------- #
# Provider itransformer (A.3): compone el MOS, expone solo el P50 sano.


def _itr_hermetico(monkeypatch, anchor: pd.Timestamp):
    """itransformer con red simulada (reutiliza el andamiaje del MOS)."""
    from optimization.prediction.itransformer_forecaster import (
        ITransformerClimateForecaster,
    )
    ctx = _ctx_sintetico(anchor)
    prov = ITransformerClimateForecaster(site_cfg=dict(SITE))
    monkeypatch.setattr(prov._mos, "_context_df", lambda anchor=None: ctx)
    return prov


def test_factory_itransformer_registrado():
    """get_climate_provider(name='itransformer') devuelve el provider solo."""
    from optimization.prediction.forecaster import get_climate_provider
    from optimization.prediction.itransformer_forecaster import (
        ITransformerClimateForecaster,
    )
    prov = get_climate_provider(name="itransformer")
    assert isinstance(prov, ITransformerClimateForecaster)
    assert prov.provider_name == "itransformer"
    assert list(prov.variables) == list(WEATHER_VARIABLES)


def test_itransformer_contrato_y_rango_fisico(monkeypatch, caplog):
    """72x10 tz-aware sin NaN + recortes físicos contados (no silenciosos)."""
    import logging

    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _itr_hermetico(monkeypatch, anchor)
    with caplog.at_level(logging.INFO):
        fc = prov.forecast(days=3.0, anchor=anchor)
    assert fc.provider == "itransformer"
    assert fc.horizon_h == 72
    assert list(fc.data.columns) == list(WEATHER_VARIABLES)
    assert fc.data.index.tz is not None
    assert fc.data.index[0] == anchor.floor("h")
    assert not bool(fc.data.isna().any().any())
    # Rango físico: humedad/nubes en [0,100], radiación/precip >= 0.
    assert ((fc.data["relative_humidity_2m"] >= 0)
            & (fc.data["relative_humidity_2m"] <= 100)).all()
    assert ((fc.data["cloud_cover"] >= 0)
            & (fc.data["cloud_cover"] <= 100)).all()
    for col in ("shortwave_radiation", "direct_normal_irradiance",
                "diffuse_radiation", "precipitation"):
        assert (fc.data[col].values >= 0).all(), col
    # El recorte se declara (log con conteo), no se esconde.
    assert "recortes" in caplog.text


def test_itransformer_horizonte_mayor_72h_falla():
    """Pedir más de 72 h falla antes de cargar el checkpoint."""
    from optimization.prediction.itransformer_forecaster import (
        ITransformerClimateForecaster,
    )
    prov = ITransformerClimateForecaster(site_cfg=dict(SITE))
    with pytest.raises(RuntimeError, match="72"):
        prov.forecast(days=4.0)
