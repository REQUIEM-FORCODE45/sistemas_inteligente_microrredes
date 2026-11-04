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
    _V2_FEATS,
    _check_booster,
    _resolve_boosters,
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
def test_mos_boosters_cargan_y_declaran_sus_features():
    """Cada booster declara su lista (8, salvo wind v2 real con 3)."""
    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    prov._load_lazy()
    assert set(prov._lgbm) == set(_MOS_TARGETS) and len(prov._lgbm) == 10
    for var, booster in prov._lgbm.items():
        ver = prov._booster_ver[var]
        esperado = (list(_V2_FEATS[var]) if ver == "v2"
                    else list(_FEAT_NAMES))
        assert booster.num_feature() == len(esperado), (var, ver)
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


# --------------------------------------------------------------------- #
# Sprint-1 5.7: nubes fuera del pass-through + viento v2 sin NWP.


def _tiny_booster(path, columns, rule):
    """Booster LightGBM mínimo con nombres de features (rápido, real)."""
    import lightgbm as lgb
    import pandas as pd

    rng = np.random.default_rng(3)
    n = 200
    df = pd.DataFrame({c: rng.uniform(0, 10, n) for c in columns})
    if "hora" in df:
        df["hora"] = rng.integers(0, 24, n).astype(float)
    y = rule(df)
    d = lgb.Dataset(df, label=y.values)
    b = lgb.train({"objective": "regression", "num_leaves": 7,
                   "verbose": -1}, d, num_boost_round=10)
    b.save_model(str(path))
    return str(path)


def test_resolve_prefiere_v2_donde_existe():
    """Con los _v2 reales: cloud+wind van a v2, el resto a v1."""
    from pathlib import Path
    models_dir = (Path(mos_mod.__file__).resolve().parent / "mos" / "models")
    plan = _resolve_boosters(models_dir)
    assert set(plan) == set(_MOS_TARGETS)
    for var, (path, ver, feats) in plan.items():
        if var in ("cloud_cover", "wind_speed_100m"):
            assert ver == "v2", var
            assert feats == list(_V2_FEATS[var]), var
        else:
            assert ver == "v1", var
            assert feats == list(_FEAT_NAMES), var


def test_resolve_prefiere_v2_y_guarda_lista(tmp_path):
    """Con _v2 presente rige su lista; _v2 sin lista declarada falla."""
    import shutil
    cloud = _tiny_booster(tmp_path / "c.txt", list(_V2_FEATS["cloud_cover"]),
                           lambda df: df["v1"])
    shutil.copy(cloud, tmp_path / "lgbm_mos_cloud_cover_v2.txt")
    plan = _resolve_boosters(tmp_path)
    assert plan["cloud_cover"][1] == "v2"
    assert plan["cloud_cover"][2] == list(_V2_FEATS["cloud_cover"])
    assert plan["wind_speed_100m"][1] == "v1"  # sin _v2: legado
    (tmp_path / "lgbm_mos_shortwave_radiation_v2.txt").write_text("x")
    with pytest.raises(RuntimeError, match="_V2_FEATS"):
        _resolve_boosters(tmp_path)


def test_check_booster_falla_con_otro_n(tmp_path):
    """Mutante 5.7: un _v2 con 5 features no pasa la guarda de 8."""
    p = _tiny_booster(tmp_path / "m.txt",
                       ["a", "b", "c", "d", "e"], lambda df: df["a"])
    with pytest.raises(RuntimeError, match="esperaba 8 features"):
        _check_booster("cloud_cover", p, "v2", list(_FEAT_NAMES))


def _mos_con_wind_v2(monkeypatch, anchor, rule, proxy_viento=6.0):
    """Hermético con booster wind v2 sintético (3 features con nombre)."""
    from pathlib import Path
    prov = _mos_hermetico(monkeypatch, anchor)
    prov._load_lazy()
    tmp = Path("/tmp/s57_wind2")
    tmp.mkdir(exist_ok=True)
    mp = _tiny_booster(tmp / "w2.txt", list(_V2_FEATS["wind_speed_100m"]),
                        rule)
    import lightgbm as lgb
    prov._lgbm["wind_speed_100m"] = lgb.Booster(model_file=mp)
    prov._booster_ver["wind_speed_100m"] = "v2"
    prov._booster_feats["wind_speed_100m"] = list(
        _V2_FEATS["wind_speed_100m"])
    prov._proxy_df = lambda start, hours, live: _proxy_sintetico(
        start, hours).assign(viento=proxy_viento)
    return prov


def test_wind_v2_sin_escala_x13(monkeypatch):
    """El v2 NO aplica el x1.3: con viento10=6 el booster identidad da ~6."""
    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _mos_con_wind_v2(monkeypatch, anchor,
                             lambda df: df["wind10_ecmwf"], proxy_viento=6.0)
    fc = prov.forecast(days=3.0, anchor=anchor)
    w = fc.data["wind_speed_100m"].values
    assert np.isfinite(w).all()
    # Identidad sobre 6.0: con x1.3 daria ~7.8 (fuera de la banda).
    assert ((w > 5.0) & (w < 7.0)).all(), w.mean()


def test_wind_v2_orden_por_nombre(monkeypatch):
    """El v2 ordena por feature_name(): y=hora sigue la hora futura."""
    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _mos_con_wind_v2(monkeypatch, anchor,
                             lambda df: df["hora"], proxy_viento=2.0)
    fc = prov.forecast(days=3.0, anchor=anchor)
    w = fc.data["wind_speed_100m"].values
    hrs = fc.data.index.hour.values.astype(float)
    corr = np.corrcoef(w, hrs)[0, 1]
    assert corr > 0.9, corr  # la columna hora cae en su sitio


def test_cloud_ya_no_es_passthrough_y_mide(monkeypatch):
    """cloud_cover sale del booster (no del NWP) y queda en [0,100]."""
    from optimization.prediction import mos_forecaster as m
    assert "cloud_cover" not in m._PASS_THROUGH
    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _mos_hermetico(monkeypatch, anchor)
    prov._load_lazy()
    assert prov._booster_ver["cloud_cover"] == "v2"  # _v2 real en repo
    fc = prov.forecast(days=3.0, anchor=anchor)
    c = fc.data["cloud_cover"].values
    assert np.isfinite(c).all()
    assert ((c >= 0) & (c <= 100)).all()


# --------------------------------------------------------------------- #
# Sprint-1 5.8: unidades m/s, proxy en km/h, pers_h24 causal.


def test_openmeteo_client_wind_speed_unit_ms_por_defecto():
    """OpenMeteoClient pide m/s por defecto; kmh solo si se pide."""
    from optimization.weather.openmeteo import OpenMeteoClient
    assert OpenMeteoClient()._base_params()["wind_speed_unit"] == "ms"
    assert OpenMeteoClient(
        wind_speed_unit="kmh")._base_params()["wind_speed_unit"] == "kmh"


def test_mos_context_usa_ms_y_proxy_mantiene_kmh(monkeypatch):
    """_context_df usa ms (vivo y anchor); _proxy_df backtest mantiene kmh."""
    import optimization.prediction.mos_forecaster as m

    calls = []
    tz = "America/Bogota"

    class FakeClient:
        def __init__(self, **kw):
            calls.append(kw)
            self._kw = kw
            self.timezone = kw.get("timezone", tz)

        def _df(self, idx):
            return pd.DataFrame(1.0, index=idx,
                                columns=self._kw["variables"])

        def fetch_forecast(self, **kw):
            now = pd.Timestamp.now(tz=self.timezone).floor("h")
            return self._df(pd.date_range(now - pd.Timedelta(hours=600),
                                          periods=600, freq="h",
                                          tz=self.timezone))

        def fetch_archive(self, start, end):
            return self._df(pd.date_range(
                pd.Timestamp(start, tz=self.timezone),
                pd.Timestamp(end, tz=self.timezone) + pd.Timedelta(hours=23),
                freq="h", tz=self.timezone))

    monkeypatch.setattr(m, "OpenMeteoClient", FakeClient)
    prov = MOSClimateForecaster(site_cfg=dict(SITE))
    calls.clear()
    prov._context_df(None)
    assert calls and calls[-1].get("wind_speed_unit", "ms") == "ms"
    calls.clear()
    anchor = pd.Timestamp("2025-07-15 12:00", tz=tz)
    prov._context_df(anchor)
    assert calls and calls[-1].get("wind_speed_unit", "ms") == "ms"
    calls.clear()
    # backtest: end < cut -> solo rama archive, sin _ecmwf_frame (sin red).
    prov._proxy_df(anchor, 2, live=False)
    assert calls and calls[-1].get("wind_speed_unit") == "kmh"


def test_train_mos_v2_pers_h24_causal_sin_fuga_futura():
    """Mutante anti-fuga: corromper el futuro no cambia pers_h24 (72h).

    Con la formula vieja (t_idx-24) hh>=24 leeria el futuro (>= i+L);
    con p_idx = i+L-24+(hh%24) las 72 horas son bit-identicas.
    """
    from optimization.prediction.mos.train_mos_v2 import _row_for, L
    n = L + 200
    idx = pd.date_range("2024-01-01", periods=n, freq="h")  # naive = era5
    era = pd.DataFrame(index=idx)
    era["ghi_toa"] = 300.0
    for c in ("cloud_cover", "wind_speed_100m"):
        era[c] = np.arange(n, dtype=float)
    ecw = pd.DataFrame({"viento": 2.0, "nubes": 50.0, "temp": 15.0},
                       index=idx)
    v1_all = {"cloud_cover": np.zeros(72), "wind_speed_100m": np.zeros(72)}
    i = 100
    for var in ("cloud_cover", "wind_speed_100m"):
        before = [_row_for(var, i, hh, era, ecw, v1_all)[0]["pers_h24"]
                  for hh in range(72)]
        mut = era.copy()
        # pandas>=3 (CoW siempre activo): la asignacion encadenada .iloc[]
        # NO escribe (ChainedAssignmentError silencioso); se usa .loc con
        # el indice para que la corrupcion del futuro ocurra de verdad.
        mut.loc[mut.index[i + L:i + L + 72], var] = 99999.0
        after = [_row_for(var, i, hh, mut, ecw, v1_all)[0]["pers_h24"]
                 for hh in range(72)]
        assert before == after  # ni un bit del futuro
        assert all(v != 99999.0 for v in before)
        # Sensibilidad del test: con t_idx-24 el futuro SI entraria.
        assert float(mut[var].values[i + L + 71 - 24]) == 99999.0


# --------------------------------------------------------------------- #
# Micro-cierre DNI/DHI reales (M1): sin falso proxy con _v2.


def test_v2_feats_dni_dhi_declaradas():
    """DNI/DHI v2 = crudo real + pers + hora (minimo con fundamento)."""
    from optimization.prediction.mos_forecaster import _V2_FEATS
    assert _V2_FEATS["direct_normal_irradiance"] == [
        "dni_ecmwf", "pers_h24", "hora"]
    assert _V2_FEATS["diffuse_radiation"] == [
        "dhi_ecmwf", "pers_h24", "hora"]


def test_resolve_dni_dhi_sin_v2_legado():
    """Sin _v2 de DNI/DHI: resuelven a v1 (falso proxy ghi, como se entreno)."""
    from pathlib import Path
    plan = _resolve_boosters(
        Path(mos_mod.__file__).resolve().parent / "mos" / "models")
    for var in ("direct_normal_irradiance", "diffuse_radiation"):
        assert plan[var][1] == "v1", var
        assert plan[var][2] == list(_FEAT_NAMES), var


def _mos_con_dni_dhi_v2(monkeypatch, anchor, rule, proxy_val=400.0):
    """Hermetico con boosters DNI/DHI v2 sinteticos (3 features con nombre)."""
    from pathlib import Path
    prov = _mos_hermetico(monkeypatch, anchor)
    prov._load_lazy()
    tmp = Path("/tmp/s57_dd2")
    tmp.mkdir(exist_ok=True)
    import lightgbm as lgb
    from optimization.prediction.mos_forecaster import _V2_FEATS as F
    for var in ("direct_normal_irradiance", "diffuse_radiation"):
        r = rule if var == "direct_normal_irradiance" else (
            lambda df: df["dhi_ecmwf"])
        mp = _tiny_booster(tmp / f"{var}.txt", list(F[var]), r)
        prov._lgbm[var] = lgb.Booster(model_file=mp)
        prov._booster_ver[var] = "v2"
        prov._booster_feats[var] = list(F[var])
    base = _proxy_sintetico(anchor.floor("h"), 72)
    base = base.assign(dni=proxy_val, dhi=proxy_val * 0.3)
    prov._proxy_df = lambda start, hours, live: base.iloc[:hours]
    return prov


def test_dni_dhi_v2_usan_crudo_real(monkeypatch):
    """El v2 predice sobre dni/dhi reales, no sobre el falso proxy ghi."""
    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _mos_con_dni_dhi_v2(
        monkeypatch, anchor,
        lambda df: df["dni_ecmwf"], proxy_val=6.0)
    fc = prov.forecast(days=3.0, anchor=anchor)
    dni = fc.data["direct_normal_irradiance"].values
    assert np.isfinite(dni).all()
    # Identidad sobre dni=6.0 constante: con falso proxy (ghi diurno
    # 0..800) la salida variaria con el dia en vez de ser constante ~6.
    assert abs(dni.mean() - 6.0) < 1.0, dni.mean()
    assert dni.std() < 0.5, dni.std()


def test_dni_dhi_en_rango_fisico(monkeypatch):
    """DNI/DHI no negativos (clip del MOS) en la ruta v1 legado."""
    anchor = pd.Timestamp("2025-07-15 12:00", tz=TZ)
    prov = _mos_hermetico(monkeypatch, anchor)
    fc = prov.forecast(days=3.0, anchor=anchor)
    assert (fc.data["direct_normal_irradiance"].values >= 0).all()
    assert (fc.data["diffuse_radiation"].values >= 0).all()
