# -*- coding: utf-8 -*-
"""Proveedores de pronostico de CLIMA (10 vars) — Fase 2.

Contrato de salida: DataFrame horario con las 10 variables climaticas
contratadas (config/sites/*.yaml). Cualquier proveedor (NWP Open-Meteo,
TimesFM 2.5, PatchTST) debe devolver el MISMO contrato para que la fisica
(PvPlant) y la calibracion (Fase 4) sean agnosticas al origin ML/NWP.

Jerarquia actual:
  - OpenMeteoClimateForecaster  : operativo (NWP, sin GPU). El de produccion.
  - TimesFMClimateForecaster    : TimesFM 2.5 (cargado lazy; requiere
                                  'timesfm' + torch). Se intenta primero si
                                  TIMESFM_MODEL_PATH esta seteado.
  - PatchTSTClimateForecaster   : stub con la misma interfaz (desarrollo).

Seleccion via factory: FORECASTER=openmeteo|timesfm|patchtst (default openmeteo).
"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List

import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient, WEATHER_VARIABLES

logger = logging.getLogger("optimization.prediction.forecaster")

DEFAULT_SITE = "pasto_narino"


# --------------------------------------------------------------------------- #
@dataclass
class ClimateForecast:
    """Pronostico de clima horario (+ metadatos de origen)."""
    data: pd.DataFrame            # index timestamp (tz-aware), 10 vars
    horizon_h: int
    provider: str

    @property
    def variables(self) -> list:
        return list(self.data.columns)


class ClimateForecaster(ABC):
    """Interfaz del proveedor de pronostico de clima horario."""

    provider_name: str = "abstract"

    def name(self) -> str:
        return self.provider_name

    @abstractmethod
    def forecast(self, days: float = 1.0) -> ClimateForecast:
        """Devuelve clima horario pronosticado para 'days' dias (>=1)."""
        ...


# --------------------------------------------------------------------------- #
class OpenMeteoClimateForecaster(ClimateForecaster):
    """Operativo: pronostico NWP de Open-Meteo (las 10 vars contratadas)."""
    provider_name = "openmeteo_nwp"

    def __init__(self, site_cfg: dict):
        self._client = OpenMeteoClient(
            latitude=site_cfg["latitude"], longitude=site_cfg["longitude"],
            timezone=site_cfg.get("timezone", "America/Bogota"))

    def forecast(self, days: float = 1.0) -> ClimateForecast:
        hours = max(1, int(days * 24))
        # Open-Meteo arranca en 00:00 local; con past_days=1 + corte desde
        # 'ahora' la serie queda anclada a la HORA ACTUAL (no a medianoche).
        df = self._client.fetch_forecast(
            past_days=1,
            forecast_days=hours // 24 + 1,
            start_from_now=True,
        )
        df = df.iloc[:hours]
        return ClimateForecast(data=df, horizon_h=len(df), provider=self.provider_name)


class TimesFMClimateForecaster(ClimateForecaster):
    """TimesFM 2.5 — forecast de clima de corto plazo (requiere import lazy).

    NO carga en import (pesado); se importa en el primer .forecast().
    Contrato: devuelve las 10 vars climaticas del sitio (config/sites/*.yaml)
    en DataFrame horario tz-aware, con horizonte 'days'.

    Metodologia (HO2, validada en CPU/GPU): univariante por variable — para
    cada una de las 10 variables se pronostica con el contexto reciente de la
    serie (ultimas <=CONTEXT_H horas del historico ERA5). TimesFM 2.5 se
    ejecuta en CPU (HO2: VRAM limitada) o CUDA si hay GPU.

    Requisitos (en la maquina destino, no en CI):
        pip install "timesfm[all]"   # + torch o jax segun backend
    Este entorno (CI) no instala la pila ML por espacio; la logica de mapeo
    esta cubierta por tests con mock.
    """

    provider_name = "timesfm"
    MODEL_NAME = "timesfm-2.5-200m"
    CONTEXT_H = 512            # contexto minimo recomendado por TimesFM
    MAX_CONTEXT_H = 1024

    def __init__(self, site_cfg: dict = None, model_path: str | None = None,
                 backend: str = "cpu"):
        self.site_cfg = site_cfg or load_site(DEFAULT_SITE)["site"]
        self.model_path = model_path
        self.backend = backend
        self._model = None

    def _load_lazy(self):
        if self._model is not None:
            return
        try:
            from timesfm import TimesFm, TFM20params  # TimesFM 2.5 API
        except ImportError as exc:
            raise RuntimeError(
                "TimesFM 2.5 no instalado en esta maquina. "
                "Instala con: pip install \"timesfm[all]\" "
                "(requiere ~2GB de disco; en este entorno no es posible). "
                "Usa FORECASTER=openmeteo mientras tanto.") from exc
        self._model = TimesFm(TFM20params.get_params_for_model(self.MODEL_NAME))

    @property
    def variables(self) -> list:
        return list(WEATHER_VARIABLES)

    def _context_series(self) -> pd.DataFrame:
        """Contexto reciente (historico ERA5) para alimentar el modelo."""
        client = OpenMeteoClient(latitude=self.site_cfg["latitude"],
                                 longitude=self.site_cfg["longitude"],
                                 timezone=self.site_cfg.get("timezone", "America/Bogota"))
        hours = min(self.MAX_CONTEXT_H, self.CONTEXT_H)
        end = pd.Timestamp.now(tz=self.site_cfg.get("timezone", "America/Bogota")) \
            .floor("D") - pd.Timedelta(days=7)  # latencia ERA5
        start = end - pd.Timedelta(hours=hours + 24)
        return client.fetch_archive(start.date().isoformat(), end.date().isoformat())

    def forecast(self, days: float = 1.0) -> ClimateForecast:
        self._load_lazy()
        horizon = max(1, int(days * 24))
        ctx = self._context_series()
        if len(ctx) < self.CONTEXT_H:
            raise RuntimeError(
                f"Contexto insuficiente: {len(ctx)}h < {self.CONTEXT_H}h ERA5")

        # 1) pronostico univariante por variable (HO2 metodologia)
        # TimesFM espera (n_series, context_len): una fila por variable
        inputs = ctx[self.variables].iloc[-self.CONTEXT_H:]
        fc = self._model.forecast(inputs.values.T, freq="h", horizon=horizon)
        # fc: ndarray (n_series, horizon)

        # 2) ensambla el contrato de 10 vars con index horario futuro
        idx = pd.date_range(ctx.index[-1] + pd.Timedelta(hours=1),
                            periods=horizon, freq="h")
        df = pd.DataFrame(fc.T, index=idx, columns=self.variables)
        for col in ["shortwave_radiation", "direct_normal_irradiance",
                    "diffuse_radiation"]:
            df[col] = df[col].clip(lower=0.0)
        return ClimateForecast(data=df, horizon_h=horizon, provider=self.provider_name)


class PatchTSTClimateForecaster(ClimateForecaster):
    """PatchTST — stub con la MISMA interfaz (desarrollo en PC con GPU)."""
    provider_name = "patchtst"

    def __init__(self, site_cfg: dict = None):
        self.site_cfg = site_cfg

    def forecast(self, days: float = 1.0) -> ClimateForecast:
        raise NotImplementedError(
            "PatchTST en desarrollo (entrenamiento fuera de este entorno). "
            "La interfaz ya es equivalente a TimesFM.")


# --------------------------------------------------------------------------- #
_PROVIDERS = {
    "openmeteo": OpenMeteoClimateForecaster,
    "timesfm": TimesFMClimateForecaster,
    "patchtst": PatchTSTClimateForecaster,
}


def get_climate_provider(site_cfg: dict = None,
                         name: str | None = None) -> ClimateForecaster:
    """Factory: nombre o env FORECASTER (default openmeteo)."""
    name = (name or os.environ.get("FORECASTER") or "openmeteo").lower()
    if name not in _PROVIDERS:
        logger.warning("FORECASTER=%s desconocido; usa openmeteo", name)
        name = "openmeteo"
    if site_cfg is None:
        site_cfg = load_site(DEFAULT_SITE)["site"]
    return _PROVIDERS[name](site_cfg)