from abc import ABC, abstractmethod


class PredictorInterface(ABC):
    """Interfaz abstracta para predictores de series temporales.
    Hoy: MatlabPredictor lee .mat. Mañana: TFTPredictor usa un TFT."""

    @abstractmethod
    def predict_solar(self, hours: int) -> list[float]:
        """Devuelve irradiancia predicha [0..1] para cada hora."""
        ...

    @abstractmethod
    def predict_load(self, hours: int) -> list[dict]:
        """Devuelve demanda predicha por carga para cada hora.
        Formato: [{'PL1': x, 'PL2': y, 'PL3': z}, ...]"""
        ...

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Nombre identificador de la fuente de prediccion."""
        ...
