# -*- coding: utf-8 -*-
"""Predictor de SENSORES a partir del clima pronosticado (bucle, Opcion A).

Paso 3 del bucle: clima (NWP/TimesFM) -> modelo AJUSTADO por sensor ->
serie P10/P50/P90 en las unidades del sensor (power_kw, soc_pct).

Tipos:
  solar/wind -> banda P10/P50/P90 del modelo calibrado [kW]
  load       -> perfil horario calibrado + cuantiles de residuo [kW]
  bess       -> SOC esperado: ultimo SOC medido (P50) + banda por RMSE de
                calibracion (el despacho optimo lo decide el solver)
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.calibration.service import load_calibrated, read_sensor_series
from optimization.prediction.forecaster import get_climate_provider

logger = logging.getLogger("optimization.prediction.sensor_predictor")


def _series(p50: pd.Series, lo: pd.Series, hi: pd.Series,
            unit: str) -> list:
    return [{"P10": round(float(a), 3), "P50": round(float(b), 3),
             "P90": round(float(c), 3)}
            for a, b, c in zip(lo.values, p50.values, hi.values)]


def predict_sensor(site_id: str, sensor_id: str, activo_type: str,
                   hours: int = 24, provider: str | None = None) -> dict:
    """Predice las proximas 'hours' horas del sensor con su modelo ajustado."""
    cfg = load_site(site_id)
    model = load_calibrated(sensor_id)

    provider_obj = get_climate_provider(cfg["site"], name=provider)
    fc = provider_obj.forecast(days=max(1.0, hours / 24.0))
    climate = fc.data
    tz = cfg["site"].get("timezone", "America/Bogota")

    if activo_type in ("solar", "wind"):
        if isinstance(model, dict) and model.get("zero"):
            # senal nula (viento ~0 en Pasto): prediccion honesta de 0
            zeros = pd.Series(0.0, index=climate.index)
            return {"sensor_id": sensor_id, "type": activo_type,
                    "provider": fc.provider, "unit": "kW",
                    "values": _series(zeros, zeros, zeros, "kW")}
        band = model.predict_band(climate)
        if "shortwave_radiation" in climate.columns:
            night = climate["shortwave_radiation"] < 5.0
            band.loc[night, ["P10", "P50", "P90"]] = 0.0
        return {"sensor_id": sensor_id, "type": activo_type,
                "provider": fc.provider, "unit": "kW",
                "values": _series(band["P50"], band["P10"], band["P90"], "kW")}

    if activo_type == "load":
        profile = model.get("profile_kw", {})
        q10, q90 = model.get("q10", 0.0), model.get("q90", 0.0)
        p50 = climate.index.hour.map(lambda h: float(profile.get(int(h), 0.0)))
        p50 = pd.Series(p50, index=climate.index)
        return {"sensor_id": sensor_id, "type": activo_type,
                "provider": fc.provider, "unit": "kW",
                "values": _series(p50, p50 + q10, p50 + q90, "kW")}

    if activo_type == "bess":
        # SOC esperado: se mantiene el ultimo medido; banda por RMSE de ajuste
        rmse_soc = float(model.get("rmse_soc_final_pct", 3.0))
        df = read_sensor_series(sensor_id, ["soc_pct"], max_days=3)
        last_soc = float(df["soc_pct"].iloc[-1]) if (not df.empty and len(df) >= 5) \
            else 50.0
        spread = 1.28 * rmse_soc
        soc = pd.Series(np.full(len(climate), last_soc), index=climate.index)
        return {"sensor_id": sensor_id, "type": activo_type,
                "provider": fc.provider, "unit": "soc_pct",
                "values": _series(soc, soc - spread, soc + spread, "soc_pct")}

    raise ValueError(f"Tipo de activo no soportado: {activo_type}")


def predict_mapped(site_id: str, mappings: Dict[str, Dict[str, str]],
                   hours: int = 24) -> Dict[str, dict]:
    """Predice todos los sensores mapeados: {sensor_id: resultado}.

    mappings: {sensor_id: {"type": "solar"|"load"|"bess"|"wind"}}
    """
    out = {}
    for sensor_id, info in mappings.items():
        try:
            out[sensor_id] = predict_sensor(site_id, sensor_id,
                                            info.get("type", "solar"), hours)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Prediccion de %s fallo: %s", sensor_id, exc)
    return out
