# -*- coding: utf-8 -*-
"""Loader de configuracion de sitios (YAML) — Patron de HO#1.

`load_site(site_id)` devuelve un dict normalizado con las secciones:
  site, weather_variables, pv, wind, bess, load, synthetic.
El id del sitio DEBE coincidir con el nombre del archivo YAML (pitfall HO#1).
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Dict

import yaml

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
SITES_DIR = os.path.join(CONFIG_DIR, "sites")

# campos opcionales con defaults (para tolerar YAML que falten secciones)
_DEFAULTS = {
    "pv": {"capacity_kwp": 50.0, "surface_tilt_deg": 2.0,
           "surface_azimuth_deg": 180.0, "losses_pct": 14.0,
           "inverter_eta": 0.96, "temp_coeff_pct_per_c": -0.38,
           "sapm_cell_a": -3.56, "sapm_cell_b": -0.075, "sapm_cell_deltaT": 3.0,
           "annual_kwh": 18000.0},
    "wind": {"hub_height_m": 40.0, "reference_height_m": 100.0, "z0": 0.1,
             "capacity_kw": 100.0, "cut_in_ms": 3.0, "rated_ms": 11.0,
             "cut_out_ms": 25.0, "air_density_ref": 1.225},
    "bess": {"capacity_kwh": 200.0, "power_kw": 50.0, "soc_min": 0.10,
             "soc_max": 0.95, "init_soc": 0.30,
             "charge_efficiency": 0.95, "discharge_efficiency": 0.95},
    "load": {"annual_kwh": 18000.0, "morning_peak_h": 7, "evening_peak_h": 19},
}


@lru_cache(maxsize=8)
def load_site(site_id: str) -> Dict:
    path = os.path.join(SITES_DIR, f"{site_id}.yaml")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Site YAML no encontrado: {path}. El id debe coincidir con el "
            "nombre del archivo (HO#1 pitfall de la API).")
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    cfg = {"site": raw.get("site", {}),
           "weather_variables": raw.get("weather_variables", []),
           "synthetic": raw.get("synthetic", {})}
    # defaults aplicados a cada seccion (no reemplaza lo presente)
    for section, default in _DEFAULTS.items():
        merged = dict(default)
        merged.update(raw.get(section, {}) or {})
        cfg[section] = merged
    return cfg


def site_ids() -> list:
    if not os.path.isdir(SITES_DIR):
        return []
    return [f[:-5] for f in sorted(os.listdir(SITES_DIR)) if f.endswith(".yaml")]