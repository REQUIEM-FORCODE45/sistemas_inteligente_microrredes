# -*- coding: utf-8 -*-
"""Modelo fisico PV (pvlib) — clima -> potencia AC (Pasto).

Port de HO#1 (HANDOFF_TECNICO_1, seccion 7.1, VALIDADO):
  1) poscion solar (Location.get_solarposition)
  2) irradiancia en plano POA (get_total_irradiance)
  3) temperatura de celda (sapm_cell con a, b, deltaT; NO fuentes())
  4) potencia DC (pvwatts_dc)
  5) potencia AC = DC * inverter_eta * (1 - losses_pct/100), clip>=0

PITFALL de timezone (HO#1): los timestamps de Open-Meteo son naive; hay que
localizarlos a la TZ del sitio o el pico solar se desa a la tarde.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
import pvlib

logger = logging.getLogger("optimization.physics.pv")

REQUIRED = ["shortwave_radiation", "direct_normal_irradiance",
            "diffuse_radiation", "temperature_2m", "wind_speed_10m"]


@dataclass
class PvPlant:
    """Planta fotovoltaica; params de catalogo (loset/eta/gamma calibrables)."""

    latitude: float = 1.2136           # Pasto
    longitude: float = -77.2811
    timezone: str = "America/Bogota"
    capacity_kwp: float = 50.0
    surface_tilt_deg: float = 2.0       # casi plano (HO#1)
    surface_azimuth_deg: float = 180.0  # sur (HO#1)
    losses_pct: float = 14.0            # Calibrable (HO#3)
    inverter_eta: float = 0.96          # Calibrable (HO#3)
    temp_coeff_pct_per_c: float = -0.38  # gamma_pdc [%/C] Calibrable (HO#3)
    sapm_a: float = -3.56
    sapm_b: float = -0.075
    sapm_deltaT: float = 3.0

    # --------------------------------------------------------------- #
    def _loc(self, tz: str):
        loc = pvlib.location.Location(
            latitude=self.latitude, longitude=self.longitude, tz=tz)
        return loc

    def _localize(self, climate: pd.DataFrame) -> pd.DataFrame:
        """Localiza index (si naive) y devuelve copia con TZ del sitio."""
        if climate.index.tz is None:
            climate = climate.copy()
            climate.index = climate.index.tz_localize(self.timezone)
        return climate

    def poa(self, climate: pd.DataFrame) -> pd.Series:
        """Irradiancia global en el plano del arreglo (POA [W/m2])."""
        missing = [c for c in REQUIRED if c not in climate.columns]
        if missing:
            raise ValueError("climate necesita columnas: " + ", ".join(missing))
        climate = self._localize(climate)
        idx = climate.index
        loc = self._loc(idx.tz)
        solar = loc.get_solarposition(idx)
        total = pvlib.irradiance.get_total_irradiance(
            surface_tilt=self.surface_tilt_deg,
            surface_azimuth=self.surface_azimuth_deg,
            solar_zenith=solar["apparent_zenith"],
            solar_azimuth=solar["azimuth"],
            dni=climate["direct_normal_irradiance"],
            ghi=climate["shortwave_radiation"],
            dhi=climate["diffuse_radiation"],
        )
        return total["poa_global"]

    def cell_temp(self, poa: pd.Series, climate: pd.DataFrame) -> pd.Series:
        """Temp de celda via sapm_cell (HO#1: viento fijo=1.0, a/b/deltaT)."""
        return pvlib.temperature.sapm_cell(
            poa, climate["temperature_2m"], wind_speed=1.0,
            a=self.sapm_a, b=self.sapm_b, deltaT=self.sapm_deltaT)

    def ac_power(self, climate: pd.DataFrame) -> pd.Series:
        """Potencia AC [W] por paso de tiempo (cadena pvlib completa)."""
        climate = self._localize(climate)
        poa = self.poa(climate)
        tcell = self.cell_temp(poa, climate)
        dc = pvlib.pvsystem.pvwatts_dc(
            poa, tcell, pdc0=self.capacity_kwp * 1000.0,
            gamma_pdc=self.temp_coeff_pct_per_c / 100.0)
        ac = dc * self.inverter_eta * (1.0 - self.losses_pct / 100.0)
        return ac.clip(lower=0.0)