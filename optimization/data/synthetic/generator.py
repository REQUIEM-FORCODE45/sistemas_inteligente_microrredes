# -*- coding: utf-8 -*-
"""Generador de datos sinteticos de sensores de planta (Pasto).

Filosofia HO#3: el CLIMA es REAL (Open-Meteo/ERA5, nunca inventado); lo
sintetico es la MEDICION de la planta generada con parametros ocultos
(truth.py) + efectos (suciedad, sombra) + ruido. "Examen con clave".

Produce por sensor un DataFrame con la serie medida (granularidad config,
default 5 min), listo para el backfill Mongo o el streaming MQTT.
"""
from __future__ import annotations

import logging
from typing import Dict

import numpy as np
import pandas as pd

from optimization.physics.pv import PvPlant
from optimization.physics.wind import WindTurbine
from optimization.physics.bess import Bess
from optimization.data.synthetic.truth import HIDDEN, measured_cleaning

logger = logging.getLogger("optimization.synthetic.generator")


# --------------------------------------------------------------------------- #
def upsample_climate(climate: pd.DataFrame, step: str = "5min") -> pd.DataFrame:
    """Sube el clima horario (Open-Meteo) a la granularidad objetivo.

    El pronostico/archive es horario; para sensores de 5 min interpolamos en
    el tiempo (reindex a grilla nueva + interpolacion lineal).
    """
    idx_min = climate.index.min()
    idx_max = climate.index.max() + pd.Timedelta(step)
    new_idx = pd.date_range(idx_min, idx_max, freq=step, inclusive="left")
    df = climate.reindex(new_idx)
    df = df.interpolate(method="time").ffill().bfill()
    for col in ["shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation"]:
        df[col] = df[col].clip(lower=0.0).fillna(0.0)
    return df


# --------------------------------------------------------------------------- #
def load_profile(index: pd.DatetimeIndex, annual_kwh: float = 18000.0,
                 morning_peak_h: int = 7, evening_peak_h: int = 19) -> pd.Series:
    """Perfil residencial sintetico [W]: base + picos de manana y tarde."""
    base = annual_kwh / 8760.0 * 1000.0
    hour = index.hour
    shape = (np.exp(-((hour - morning_peak_h) ** 2) / 2.0) * 1.8 +
             np.exp(-((hour - evening_peak_h) ** 2) / 2.0) * 2.2 + 0.4)
    return pd.Series(base * (1.0 + shape), index=index, dtype=float)


# --------------------------------------------------------------------------- #
def generate_sensors(climate_hourly: pd.DataFrame, seed: int,
                     cfg: dict, step: str = "5min") -> Dict[str, pd.DataFrame]:
    """Genera las series medidas de cada sensor virtual de la planta.

    Args:
        climate_hourly: clima REAL de Open-Meteo (10 vars, horario).
        seed: semilla de la "verdad oculta" (7 limpio, 42 realista).
        cfg: dict normalizado de config.load_site(site_id).
        step: granularidad de las mediciones (ej "5min").

    Returns:
        {sensor_key: DataFrame} con keys = cfg['synthetic']['sensors'].
    """
    hidden = HIDDEN.get(seed, HIDDEN[7])
    pv_cfg = cfg["pv"]
    bess_cfg = cfg["bess"]
    wind_cfg = cfg["wind"]
    load_cfg = cfg["load"]
    tz = cfg["site"].get("timezone", "America/Bogota")

    # Normaliza la TZ del clima al inicio (todo el pipeline lo usa tz-aware)
    if climate_hourly.index.tz is None:
        climate_hourly = climate_hourly.copy()
        climate_hourly.index = climate_hourly.index.tz_localize(tz)

    # clima a la granularidad de paso
    climate = upsample_climate(climate_hourly, step)
    t_days = ((climate.index - climate.index[0]).total_seconds() / 86400.0)
    t_days = pd.Series(t_days, index=climate.index)

    # ---- 1) PV: planta con la "verdad oculta" -> potencia medida [kW] --
    pv = PvPlant(capacity_kwp=pv_cfg["capacity_kwp"],
                 timezone=tz,
                 surface_tilt_deg=pv_cfg["surface_tilt_deg"],
                 surface_azimuth_deg=pv_cfg["surface_azimuth_deg"],
                 losses_pct=hidden["losses_pct"],
                 inverter_eta=hidden["inverter_eta"],
                 temp_coeff_pct_per_c=hidden["temp_coeff_pct_per_c"])
    pv_truth_kw = (pv.ac_power(climate) / 1000.0)
    pv_meas_kw = measured_cleaning(pv_truth_kw, seed, t_days=t_days)

    # ---- 2) carga sintetica -------------------------------------------
    load_kw = load_profile(climate.index, load_cfg["annual_kwh"],
                           load_cfg["morning_peak_h"], load_cfg["evening_peak_h"]) / 1000.0

    # ---- 3) BESS: carga excedente / descarga deficit (sensor SOC) ------
    bess = Bess(capacity_kwh=bess_cfg["capacity_kwh"], power_kw=bess_cfg["power_kw"],
                soc_min=bess_cfg["soc_min"], soc_max=bess_cfg["soc_max"],
                init_soc=bess_cfg["init_soc"],
                charge_efficiency=bess_cfg["charge_efficiency"],
                discharge_efficiency=bess_cfg["discharge_efficiency"])
    net = (pv_meas_kw.values - load_kw.values)
    soc = bess.simulate(pd.Series(net, index=climate.index),
                        dt_h=dt_to_hours(step))

    # ---- 4) eolica: senal ~0 en Pasto (realista) ----------------------
    wt = WindTurbine(hub_height_m=wind_cfg["hub_height_m"],
                     reference_height_m=wind_cfg["reference_height_m"],
                     surface_roughness_m=wind_cfg["z0"],
                     capacity_kw=wind_cfg["capacity_kw"])
    wind_truth_kw = wt.ac_power(climate) / 1000.0
    rng = np.random.default_rng(seed)
    wind_meas_kw = (wind_truth_kw * 0.92 + rng.normal(0.0, 0.02, len(wind_truth_kw))).clip(lower=0.0)

    return {
        "weather": climate.copy(),
        "solar_pv": pd.DataFrame({
            "power_kw": pv_meas_kw, "power_truth_kw": pv_truth_kw,
            "irradiance_ghi": climate["shortwave_radiation"],
            "temperature": climate["temperature_2m"]}),
        "load": pd.DataFrame({"power_kw": load_kw}),
        "bess": pd.DataFrame({"soc_pct": soc["soc_pct"].values,
                              "battery_power_kw": soc["power_kw"].values,
                              "p_unmet_kw": soc["p_unmet_kw"].values},
                             index=climate.index),
        "wind": pd.DataFrame({"power_kw": wind_meas_kw,
                              "wind_speed_ms": climate["wind_speed_100m"]}),
    }


def dt_to_hours(step: str) -> float:
    """Convierte '5min'/'1h'... a horas."""
    return pd.Timedelta(step).total_seconds() / 3600.0