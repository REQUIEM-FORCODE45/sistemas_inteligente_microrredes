# -*- coding: utf-8 -*-
"""Datos del Experimento A — lazo cerrado.

Fuentes (documentadas en el paper):
  - Demanda REALIZADA: coleccion Mongo `pasto_load` (sensores publicados por
    el sistema, 5 min) agregada a horario.
  - PV REALIZADO: mediciones del sensor `pasto_solar_pv` (Mongo), con
    fallback a la planta calibrada sobre ERA5.
  - Clima REALIZADO: reanalisis ERA5 del sitio (Open-Meteo archive).
  - Forecast: PatchTST (capa ML) con contexto Open-Meteo past_days que
    termina ANTES de la hora de decision + ajuste de datos (plantas
    calibradas PV/load).
"""
from __future__ import annotations

import logging
from functools import lru_cache

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.calibration.service import (read_sensor_series,
                                              hourly_resample, parse_env_file)
from optimization.calibration.calibrated_plant import CalibratedPvPlant
from optimization.weather.openmeteo import OpenMeteoClient
from optimization.experiments.config import SITE_ID, TZ

logger = logging.getLogger("optimization.experiments.data_loader")


# --------------------------------------------------------------------------- #
# Realizados
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def _site_cfg() -> dict:
    return load_site(SITE_ID)["site"]


def load_realized_demand(start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Demanda horaria realizada [kW] desde Mongo (sensor pasto_load)."""
    df = read_sensor_series("pasto_load", ["power_kw"], max_days=60)
    if df.empty:
        raise RuntimeError("Sin datos de demanda en Mongo (pasto_load)")
    df = df[["power_kw"]].loc[start:end]
    if df.empty:
        raise RuntimeError(f"Demanda Mongo vacia en [{start}, {end}]")
    s = hourly_resample(df)["power_kw"]
    # reindexa a horas exactas (completa huecos por interpolacion lineal)
    idx = pd.date_range(s.index.floor("h").min(), s.index.floor("h").max(),
                        freq="h", tz=TZ)
    return s.reindex(idx).interpolate(limit=3).ffill()


def load_realized_pv(start: pd.Timestamp, end: pd.Timestamp,
                     fallback: bool = True) -> pd.Series:
    """PV realizado [kW] desde el sensor Mongo (fallback: planta calibrada)."""
    df = read_sensor_series("pasto_solar_pv", ["power_kw"], max_days=60)
    if not df.empty:
        df = df[["power_kw"]].loc[start:end]
        if not df.empty:
            s = hourly_resample(df)["power_kw"]
            idx = pd.date_range(s.index.floor("h").min(),
                                s.index.floor("h").max(), freq="h", tz=TZ)
            s = s.reindex(idx).interpolate(limit=3).ffill()
            return s.clip(lower=0.0)
    if not fallback:
        raise RuntimeError(f"Sin datos PV en Mongo para [{start}, {end}]")
    logger.warning("PV Mongo vacio; usando planta calibrada sobre ERA5")
    climate = _era5(start, end)
    plant = load_pv_plant()
    return plant.predict_band(climate)["P50"].clip(lower=0.0)


def _era5(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    site = _site_cfg()
    client = OpenMeteoClient(latitude=site["latitude"],
                             longitude=site["longitude"],
                             timezone=site.get("timezone", TZ))
    df = client.fetch_archive(start.strftime("%Y-%m-%d"),
                              end.strftime("%Y-%m-%d"))
    if df.empty:
        raise RuntimeError(f"ERA5 vacio en [{start}, {end}]")
    return df.loc[start:end]


def load_realized_climate(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Clima realizado [ERA5] para el periodo de prueba (para el oraculo)."""
    return _era5(start, end)


# --------------------------------------------------------------------------- #
# Ajuste de datos (modelos calibrados)
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def load_pv_plant() -> CalibratedPvPlant:
    from optimization.calibration.service import load_calibrated
    plant = load_calibrated("pasto_solar_pv")
    if not isinstance(plant, CalibratedPvPlant):
        raise RuntimeError("Artefacto PV calibrado invalido")
    return plant


@lru_cache(maxsize=1)
def load_load_profile() -> dict:
    from optimization.calibration.service import load_calibrated
    m = load_calibrated("pasto_load")
    if not isinstance(m, dict) or "profile_kw" not in m:
        raise RuntimeError("Artefacto load calibrado invalido")
    return m


def load_initial_soc() -> float:
    """SOC inicial real: ultima medicion del sensor bess (fallback 0.65)."""
    try:
        df = read_sensor_series("pasto_bess", ["soc_pct"], max_days=10)
        if not df.empty and len(df) >= 5:
            return float(df["soc_pct"].iloc[-1]) / 100.0
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudo leer SOC inicial: %s", exc)
    return 0.65


# --------------------------------------------------------------------------- #
# Forecast en lazo cerrado (PatchTST + ajuste de datos)
# --------------------------------------------------------------------------- #
class ClosedLoopForecastProvider:
    """Forecast 'como si fuera' la hora de decision (anchor).

    - Clima: PatchTST.forecast(anchor=anchor) — contexto Open-Meteo
      past_days que termina en anchor-1h (capa ML).
    - PV: banda P10/P50/P90 de la planta calibrada sobre el clima
      pronosticado (ajuste de datos).
    - Carga: perfil horario calibrado (ajuste de datos).

    Devuelve (band_pv_48h, load_48h) con horizonte 48 h para que el MPC de
    cada hora del dia tenga 24 h de lookahead.
    """

    def __init__(self, forecaster=None):
        self.site = _site_cfg()
        self.plant = load_pv_plant()
        self.load_model = load_load_profile()
        if forecaster is None:
            from optimization.prediction.forecaster import get_climate_provider
            forecaster = get_climate_provider(self.site, name="patchtst")
        self.forecaster = forecaster
        self._cache: dict = {}

    def forecast(self, anchor: pd.Timestamp, hours: int = 48) -> tuple:
        """(pv_band_df, load_series) desde 'anchor' (24h de lookahead).

        Cache por hora de decision: S-MPC y D-MPC comparten el mismo
        forecast de la cadena de produccion."""
        if anchor.tz is None:
            anchor = anchor.tz_localize(TZ)
        anchor = anchor.floor("h")
        if anchor in self._cache:
            return self._cache[anchor]
        fc = self.forecaster.forecast(days=hours / 24.0, anchor=anchor)
        climate = fc.data
        band = self.plant.predict_band(climate)
        night = climate["shortwave_radiation"] < 5.0
        band.loc[night, ["P10", "P50", "P90"]] = 0.0
        profile = self.load_model.get("profile_kw", {})
        load = pd.Series(
            [float(profile.get(int(h), 0.0)) for h in climate.index.hour],
            index=climate.index)
        self._cache[anchor] = (band, load)
        return band, load


class OracleForecastProvider:
    """Forecast perfecto: usa el clima realizado (ERA5) como pronostico."""

    def __init__(self):
        self.site = _site_cfg()
        self.plant = load_pv_plant()
        self.load_model = load_load_profile()

    def forecast(self, anchor: pd.Timestamp, hours: int = 48) -> tuple:
        if anchor.tz is None:
            anchor = anchor.tz_localize(TZ)
        climate = _era5(anchor, anchor + pd.Timedelta(hours=hours - 1))
        band = self.plant.predict_band(climate)
        night = climate["shortwave_radiation"] < 5.0
        band.loc[night, ["P10", "P50", "P90"]] = 0.0
        profile = self.load_model.get("profile_kw", {})
        load = pd.Series(
            [float(profile.get(int(h), 0.0)) for h in climate.index.hour],
            index=climate.index)
        return band, load


def test_period_days() -> pd.DatetimeIndex:
    """14 dias de prueba: del 2026-07-18 al 2026-07-31 (hora local)."""
    return pd.date_range("2026-07-18", periods=14, freq="D", tz=TZ)
