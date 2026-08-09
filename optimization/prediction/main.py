"""FastAPI — Servicio de Prediccion para la Microrred.
Ejecutar: uvicorn optimization.prediction.main:app --port 8000
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from optimization.prediction.predictor_interface import PredictorInterface
from optimization.prediction.matlab_predictor import MatlabPredictor
from optimization.prediction.tft_predictor import TFTPredictor

app = FastAPI(title="SIGE Prediction API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PREDICTOR: PredictorInterface = None


def get_predictor() -> PredictorInterface:
    global PREDICTOR
    if PREDICTOR is None:
        active = os.environ.get("PREDICTOR", "matlab")
        if active == "matlab":
            PREDICTOR = MatlabPredictor()
        elif active == "tft":
            PREDICTOR = TFTPredictor()
        else:
            PREDICTOR = MatlabPredictor()
    return PREDICTOR


@app.get("/predict/health")
def health():
    predictor = get_predictor()
    name = predictor.source_name
    try:
        hours = predictor.total_hours if hasattr(predictor, "total_hours") else 24
    except Exception:
        hours = 24
    return {"status": "ok", "predictor": name, "available_hours": hours}


@app.get("/predict/solar")
def predict_solar(hours: int = Query(default=24, ge=1, le=168)):
    predictor = get_predictor()
    values = predictor.predict_solar(hours)
    return {"values": values, "unit": "normalized_irradiance", "source": predictor.source_name}


@app.get("/predict/load")
def predict_load(hours: int = Query(default=24, ge=1, le=168)):
    predictor = get_predictor()
    values = predictor.predict_load(hours)
    return {"values": values, "unit": "kW", "source": predictor.source_name}


@app.get("/predict/power")
def predict_power(hours: int = Query(default=24, ge=1, le=168),
                  site_id: str = Query(default="pasto_narino")):
    """Nuevo (Fase 2): pronostico de POTENCIA solar CALIBRADO.

    Cadena clima (NWP/TimesFM/PatchTST) -> PvPlant calibrado (N1+N2)
    -> banda P10/P50/P90 [kW]. No rompe /predict/solar (sigue siendo el
    predictor de serie pura).
    """
    from optimization.prediction.power_forecast import solar_power_forecast
    return solar_power_forecast(hours=hours, site_id=site_id)


@app.post("/predict/calibrate")
def predict_calibrate(payload: dict):
    """Bucle (Opcion A): ajusta el modelo del activo con datos del sensor.

    Body: {site_id, sensor_id, type, force?}. type in solar|bess|wind|load.
    """
    from optimization.calibration.service import fit_from_sensor
    site_id = payload.get("site_id", "pasto_narino")
    sensor_id = payload.get("sensor_id")
    activo_type = payload.get("type")
    force = bool(payload.get("force", False))
    if not sensor_id or not activo_type:
        return {"status": "error", "error": "Faltan sensor_id/type"}
    try:
        return fit_from_sensor(site_id, sensor_id, activo_type, force=force)
    except Exception as exc:
        return {"status": "error", "sensor_id": sensor_id,
                "type": activo_type, "error": str(exc)}


@app.get("/predict/calibrated")
def predict_calibrated(sensor_id: str = Query(...)):
    """Estado del modelo calibrado del sensor (exists + resumen)."""
    from optimization.calibration.service import is_calibrated, artifact_path
    if not is_calibrated(sensor_id):
        return {"sensor_id": sensor_id, "exists": False}
    try:
        from optimization.calibration.service import _summary_of, load_calibrated
        return {"sensor_id": sensor_id, "exists": True,
                "artifact": artifact_path(sensor_id),
                "summary": _summary_of(load_calibrated(sensor_id))}
    except Exception as exc:
        return {"sensor_id": sensor_id, "exists": True, "error": str(exc)}


@app.get("/predict/sensor")
def predict_sensor_endpoint(sensor_id: str = Query(...),
                            type: str = Query(default="solar"),
                            hours: int = Query(default=24, ge=1, le=168),
                            site_id: str = Query(default="pasto_narino"),
                            provider: str = Query(default=None)):
    """Bucle (Opcion A): prediccion P10/P50/P90 del sensor con su modelo.

    Self-healing: si el sensor no tiene modelo calibrado, lo CALIBRA primero
    (asi al ligar un sensor en el diagrama la grafica sale sin pasos extra).
    provider: openmeteo|timesfm|patchtst (None = env FORECASTER).
    """
    from optimization.calibration.service import (is_calibrated, fit_from_sensor)
    calibrated_now = False
    if not is_calibrated(sensor_id):
        try:
            fit_from_sensor(site_id, sensor_id, type)
            calibrated_now = True
        except Exception as exc:
            return {"status": "error", "sensor_id": sensor_id, "type": type,
                    "error": f"Calibracion automatica fallo: {exc}"}

    from optimization.prediction.sensor_predictor import predict_sensor
    out = predict_sensor(site_id, sensor_id, type, hours=hours, provider=provider)
    out["calibrated_now"] = calibrated_now
    return out


@app.get("/predict/weather")
def predict_weather(hours: int = Query(default=48, ge=1, le=168),
                    site_id: str = Query(default="pasto_narino"),
                    provider: str = Query(default=None)):
    """Pronostico de CLIMA horario (10 vars contratadas) + proveedor.

    Es lo que alimenta los modelos calibrados; visible en el Dashboard.
    provider: openmeteo|timesfm|patchtst (None = env FORECASTER).
    """
    import pandas as pd
    from optimization.config.loader import load_site as _ls
    from optimization.prediction.forecaster import get_climate_provider

    cfg = _ls(site_id)
    prov = get_climate_provider(cfg["site"], name=provider)
    try:
        fc = prov.forecast(days=max(1.0, hours / 24.0))
    except NotImplementedError as exc:
        return {"status": "error", "provider": prov.provider_name,
                "error": str(exc)}
    except RuntimeError as exc:
        return {"status": "error", "provider": prov.provider_name,
                "error": str(exc)}
    data = fc.data.iloc[:hours]
    return {
        "provider": fc.provider,
        "horizon_h": len(data),
        "unit": "mixed",
        "variables": list(data.columns),
        "values": [
            {"time": ts.isoformat(),
             **{k: (None if pd.isna(v) else float(v)) for k, v in row.items()}}
            for ts, row in data.iterrows()
        ],
    }
