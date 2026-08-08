# -*- coding: utf-8 -*-
"""Forecast de POTENCIA solar calibrado (Fase 2): clima -> P10/P50/P90.

Cadena cerrada (pendiente de HO#3):
   climate forecast (NWP Open-Meteo | TimesFM 2.5 | PatchTST)
        -> PvPlant CALIBRADO (N1 K+params + N2 GBR residuos)
        -> potencia [kW] con banda de cuantiles P10/P50/P90

La planta calibrada se carga de results (run_experiments.py). Si no existe,
cae al modelo nominal explicito (sin calibracion).
"""
from __future__ import annotations

import logging
import os
import pickle
from pathlib import Path
from typing import Optional

import pandas as pd

from optimization.config.loader import load_site
from optimization.physics.pv import PvPlant
from optimization.calibration.calibrated_plant import CalibratedPvPlant
from optimization.calibration.experiments import build_nominal_plant

logger = logging.getLogger("optimization.prediction.power")

# ruta ANCLADA al repo (no al cwd) — ver bug de rutas relativas en service.py
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLK = str(REPO_ROOT / "results" / "pasto_narino" / "calibration"
                  / "planta_calibrada_default.pkl")
DEFAULT_SITE = "pasto_narino"


def default_calibration_path(site_id: str = DEFAULT_SITE) -> str:
    cfg = load_site(site_id)
    return cfg.get("paths", {}).get("calibration_pkl", DEFAULT_PLK)


def load_calibrated_plant(path: Optional[str] = None) -> Optional[CalibratedPvPlant]:
    """Carga la planta calibrada serializada; None si no existe."""
    path = path or default_calibration_path()
    if not os.path.exists(path):
        logger.warning("No existe planta calibrada en %s; se usara nominal", path)
        return None
    with open(path, "rb") as fh:
        plant = pickle.load(fh)
    logger.info("Planta calibrada cargada: K=%.4f based=%s", plant.k, plant.source)
    return plant


def power_forecast_from_climate(climate: pd.DataFrame,
                                plant: CalibratedPvPlant | PvPlant,
                                use_residual: bool = True) -> pd.DataFrame:
    """Banda P10/P50/P90 [kW] para un DataFrame de clima horario.

    Para CalibratedPvPlant usa predict_band (cuantiles empiricos del residuo).
    Para PvPlant nominal devuelve P50 = P_fisica (sin banda).
    """
    if isinstance(plant, CalibratedPvPlant):
        out = plant.predict_band(climate)
    else:
        p = plant.ac_power(climate) / 1000.0
        out = pd.DataFrame({"P10": p, "P50": p, "P90": p})
    return out.clip(lower=0.0)


def solar_power_forecast(hours: int = 24,
                         site_id: str = DEFAULT_SITE,
                         use_residual: bool = True) -> dict:
    """Oraculo end-to-end: forecast clima -> power band (para la API)."""
    from optimization.config.loader import load_site as _ls
    from optimization.prediction.forecaster import get_climate_provider

    cfg = _ls(site_id)
    provider = get_climate_provider(cfg["site"])
    fc = provider.forecast(days=max(1.0, hours / 24.0))
    plant = load_calibrated_plant()
    if plant is None:
        plant = build_nominal_plant(cfg)

    band = power_forecast_from_climate(fc.data, plant, use_residual=use_residual)
    band = band.iloc[:max(1, int(hours))]
    return {
        "provider": fc.provider,
        "horizon_h": len(band),
        "unit": "kW",
        "plant": plant.source if hasattr(plant, "source") else "nominal",
        "values": [
            {"P10": round(float(r.P10), 3), "P50": round(float(r.P50), 3),
             "P90": round(float(r.P90), 3)}
            for r in band.itertuples()],
    }