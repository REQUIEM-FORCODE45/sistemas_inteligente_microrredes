import os
import scipy.io as sio
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

from .predictor_interface import PredictorInterface

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

DEFAULT_IRRADIANCIA = os.path.join(DATA_DIR, "Irradiancia.mat")
DEFAULT_CONSUMO = os.path.join(DATA_DIR, "Consumo.mat")
DEFAULT_TZ = "America/Bogota"


class MatlabPredictor(PredictorInterface):
    """Predictor que lee predicciones desde archivos .mat.
    Espera:
      - Irradiancia.mat con key 'Rad' → array 1D normalizado [0..1]
      - Consumo.mat con keys 'PL1', 'PL2', 'PL3' → arrays 1D en kW

    Los perfiles se entregan DESDE LA HORA ACTUAL del sitio: el array se
    desplaza ciclicamente para que la hora 0 del horizonte coincida con la
    hora de 'ahora' (no con 00:00). La TZ se lee de SITE_TZ (igual que el
    cliente de Open-Meteo).
    """

    def __init__(self,
                 irradiancia_path: str = DEFAULT_IRRADIANCIA,
                 consumo_path: str = DEFAULT_CONSUMO):
        self._irradiancia_path = irradiancia_path
        self._consumo_path = consumo_path
        self._irradiancia = None
        self._pl1 = None
        self._pl2 = None
        self._pl3 = None
        self._loaded = False

    @staticmethod
    def _current_hour() -> int:
        tz = os.environ.get("SITE_TZ", DEFAULT_TZ)
        try:
            return datetime.now(ZoneInfo(tz)).hour
        except Exception:
            return 0

    @classmethod
    def _shift_to_now(cls, values: np.ndarray) -> np.ndarray:
        """Desplaza el perfil para que arranque en la hora actual (ciclico)."""
        if values is None or len(values) == 0:
            return values
        return np.roll(values, -int(cls._current_hour()))

    def _ensure_loaded(self):
        if self._loaded:
            return
        if not os.path.exists(self._irradiancia_path):
            raise FileNotFoundError(
                f"No se encuentra {self._irradiancia_path}. "
                f"Coloca Irradiancia.mat en {DATA_DIR}"
            )
        if not os.path.exists(self._consumo_path):
            raise FileNotFoundError(
                f"No se encuentra {self._consumo_path}. "
                f"Coloca Consumo.mat en {DATA_DIR}"
            )
        irr = sio.loadmat(self._irradiancia_path)
        con = sio.loadmat(self._consumo_path)
        self._irradiancia = irr['Rad'].flatten()
        self._pl1 = con['PL1'].flatten()
        self._pl2 = con['PL2'].flatten()
        self._pl3 = con['PL3'].flatten()
        self._loaded = True

    @property
    def total_hours(self) -> int:
        self._ensure_loaded()
        return len(self._irradiancia)

    @property
    def source_name(self) -> str:
        return "matlab"

    def predict_solar(self, hours: int | None = None) -> list[float]:
        self._ensure_loaded()
        n = hours or self.total_hours
        shifted = self._shift_to_now(self._irradiancia)
        result = shifted[:n].tolist()
        if len(result) < n:
            result.extend([0.0] * (n - len(result)))
        return result

    def predict_load(self, hours: int | None = None) -> list[dict]:
        self._ensure_loaded()
        n = hours or self.total_hours
        pl1 = self._shift_to_now(self._pl1)
        pl2 = self._shift_to_now(self._pl2)
        pl3 = self._shift_to_now(self._pl3)
        result = []
        for i in range(n):
            v1 = float(pl1[i]) if i < len(pl1) else 0.0
            v2 = float(pl2[i]) if i < len(pl2) else 0.0
            v3 = float(pl3[i]) if i < len(pl3) else 0.0
            result.append({"PL1": v1, "PL2": v2, "PL3": v3})
        return result
