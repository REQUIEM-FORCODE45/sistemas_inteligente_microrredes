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

app = FastAPI(title="SIGEMM Prediction API", version="0.1.0")

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
