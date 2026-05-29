from .predictor_interface import PredictorInterface


class TFTPredictor(PredictorInterface):
    """Stub para futuro TFT (Temporal Fusion Transformer).
    Reemplaza MatlabPredictor cuando el modelo este entrenado."""

    def __init__(self, model_path: str = ""):
        self._model_path = model_path

    @property
    def source_name(self) -> str:
        return "tft"

    def predict_solar(self, hours: int) -> list[float]:
        return [0.0] * hours

    def predict_load(self, hours: int) -> list[dict]:
        return [{"PL1": 0.0, "PL2": 0.0, "PL3": 0.0}] * hours
