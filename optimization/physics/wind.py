# -*- coding: utf-8 -*-
"""Modelo fisico eolico — velocidad de viento -> potencia AC (Pasto/Guajira).

Port de HO#1 (seccion 7.2, VALIDADO) y HO#2 (curva IEC):
  1) perfil logaritimico 100m -> hub:  v_hub = v_ref * ln(z_hub/z0)/ln(z_ref/z0)
  2) correccion por densidad del aire:  v_eff = v_hub * (rho/rho_ref)^(1/3)
  3) curva de potencia IEC III:  P=0 (<cut_in o >cut_out); sube con v^3 a rated.

En Pasto el viento es casi nulo -> la senal eolica es ~0 (realista).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

logger = logging.getLogger("optimization.physics.wind")


@dataclass
class WindTurbine:
    hub_height_m: float = 40.0
    reference_height_m: float = 100.0   # viento medido a 100m
    surface_roughness_m: float = 0.1    # z0 (terreno)
    capacity_kw: float = 100.0
    cut_in_ms: float = 3.0
    rated_ms: float = 11.0
    cut_out_ms: float = 25.0
    air_density_ref: float = 1.225

    def hub_profile(self, wind_ref: pd.Series) -> pd.Series:
        """Viento a altura de buj via perfil logaritmico (HO#1)."""
        z0 = self.surface_roughness_m
        ratio = (np.log(self.hub_height_m / z0)
                 / np.log(self.reference_height_m / z0))
        return wind_ref * ratio

    def air_density(self, pressure_hpa: pd.Series, temp_c: pd.Series) -> pd.Series:
        """rho = P / (R_esp * T_k). pressure en Pa; R_esp aire ~287.05 [J/kg/K]."""
        rho = (pressure_hpa * 100.0) / (287.05 * (temp_c + 273.15))
        return rho.clip(lower=0.0)

    def power_curve(self, wind_ms: pd.Series, rho: pd.Series | None = None) -> pd.Series:
        """Potencia [W] desde velocidad a hub; opcional densidad del aire."""
        v = wind_ms
        if rho is not None:
            v = v * (rho / self.air_density_ref) ** (1.0 / 3.0)
        v = np.asarray(v.values, dtype=float)
        p = np.zeros_like(v, dtype=float)
        mask = (v >= self.cut_in_ms) & (v <= self.cut_out_ms)
        s = np.clip(v[mask], self.cut_in_ms, self.rated_ms)
        p[mask] = self.capacity_kw * 1000.0 * \
            ((s - self.cut_in_ms) / (self.rated_ms - self.cut_in_ms)) ** 3
        # satura a nominal (evita >rated por redondeos)
        p[mask] = np.minimum(p[mask], self.capacity_kw * 1000.0)
        return pd.Series(p, index=wind_ms.index)

    def ac_power(self, climate: pd.DataFrame,
                 wind_col: str = "wind_speed_100m") -> pd.Series:
        """End-to-end: viento_100m -> hub -> densidad -> curva -> [W]."""
        if wind_col not in climate:
            raise ValueError(f"climate sin columna {wind_col}")
        v_hub = self.hub_profile(climate[wind_col])
        rho = None
        if "surface_pressure" in climate and "temperature_2m" in climate:
            rho = self.air_density(climate["surface_pressure"],
                                   climate["temperature_2m"])
        return self.power_curve(v_hub, rho)