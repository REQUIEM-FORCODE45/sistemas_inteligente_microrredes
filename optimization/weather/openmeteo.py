# -*- coding: utf-8 -*-
"""Cliente de clima OPEN-METEO (Pasto).

Descarga HISTORICO (ERA5 archive) y FORECAST (NWP) con las **10 variables
climaticas contratadas** (ver config/sites/*.yaml). El clima es SIEMPRE
"real" (proveedor de datos); lo sintetico es solo la planta/sensores.

Integra con el resto del sistema (Fase 1a):
  - El backend Node/MPC (abajo) y la prediccion (TimesFM) usan esta fuente.
  - No requiere API key (gratuita, sin registro).
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import List, Optional

import pandas as pd
import requests as _requests

logger = logging.getLogger("optimization.weather")

# Variables contratadas (10). VERIFICADO en vivo (2026-08): tanto FORECAST
# como ARCHIVE devuelven wind_speed_100m. (HO#2 decia que 80m/120m devuelven
# None en archive; con 100m la API actual SI lo entrega, consistente con HO#1.)
WEATHER_VARIABLES: List[str] = [
    "shortwave_radiation",       # GHI [W/m2]
    "direct_normal_irradiance",  # DNI [W/m2]
    "diffuse_radiation",         # DHI [W/m2]
    "temperature_2m",            # [C]
    "relative_humidity_2m",      # [%]
    "cloud_cover",               # [%]
    "wind_speed_100m",           # [m/s]  (forecast; ausente en archive)
    "wind_speed_10m",            # [m/s]
    "surface_pressure",          # [hPa]
    "precipitation",             # [mm]
]

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DEFAULT_TZ = "America/Bogota"
MAX_RETRIES = 5
RETRY_BASE_S = 2


@dataclass
class OpenMeteoClient:
    """Cliente robusto con reintento exponencial y manejo de None."""

    latitude: float = 1.2136
    longitude: float = -77.2811
    timezone: str = DEFAULT_TZ
    variables: List[str] = field(default_factory=lambda: list(WEATHER_VARIABLES))
    session: _requests.Session = field(default_factory=_requests.Session)

    # ------------------------------------------------------------------ #
    def _get_with_retry(self, url: str, params: dict, timeout: int = 60) -> dict:
        """"GET con reintento exponencial (2^attempt s) para robustez a timeouts (HO#2)."""
        last_exc: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = self.session.get(url, params=params, timeout=timeout)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:
                last_exc = exc
                wait = RETRY_BASE_S ** attempt
                logger.warning(
                    "Open-Meteo intento %d/%d fallo (%s); reintento en %ds",
                    attempt, MAX_RETRIES, exc, wait,
                )
                time.sleep(wait)
        raise RuntimeError(
            f"Open-Meteo no responde tras {MAX_RETRIES} intentos: {last_exc}"
        )

    def _base_params(self) -> dict:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "hourly": ",".join(self.variables),
            "timezone": self.timezone,
        }

    # -- ARCHIVE (historico ERA5, para entrenar/calibrar/backfill) ------ #
    def fetch_archive(self, start_date: str, end_date: str) -> pd.DataFrame:
        """Historico ERA5. (Verificado: incluye wind_speed_100m.)"""
        params = {**self._base_params(),
                  "start_date": start_date, "end_date": end_date}
        data = self._get_with_retry(ARCHIVE_URL, params)
        return self._to_dataframe(data)

    # -- FORECAST (operativo; tiene las 10 vars) ------------------------ #
    def fetch_forecast(self, past_days: int = 0, forecast_days: int = 5,
                       start_from_now: bool = False) -> pd.DataFrame:
        """Forecast NWP; con past_days>0 trae el historico observado reciente.

        Con start_from_now=True corta la serie en la HORA ACTUAL del sitio
        (el forecast de Open-Meteo arranca en 00:00 local, no en 'ahora'),
        devolviendo solo horas futuras >= now.
        """
        params = {**self._base_params(),
                  "past_days": past_days, "forecast_days": forecast_days}
        data = self._get_with_retry(FORECAST_URL, params)
        df = self._to_dataframe(data)
        if start_from_now:
            now_hour = pd.Timestamp.now(tz=self.timezone).floor("h")
            df = df.loc[df.index >= now_hour]
        return df

    # ------------------------------------------------------------------ #
    def _to_dataframe(self, data: dict) -> pd.DataFrame:
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        if not times:
            logger.warning("Open-Meteo response sin serie 'time'")
            return pd.DataFrame()
        df = pd.DataFrame({"time": pd.to_datetime(times)})
        for var in self.variables:
            values = hourly.get(var)
            if values is None:
                logger.warning("Variable %s ausente; columna NaN", var)
                df[var] = float("nan")
                continue
            # Convierte None a NaN manteniendo alineacion temporal (HO#2)
            df[var] = pd.to_numeric(values, errors="coerce")
        df = df.set_index("time")
        # timestamps naive local de Open-Meteo: localizar a la TZ del sitio
        # (critico para pvlib, HO#1 pitfall de timezone)
        if df.index.tz is None:
            df.index = df.index.tz_localize(self.timezone)
        return df


def default_client() -> OpenMeteoClient:
    """Cliente por defecto; coords sobreescribibles por env (util en tests)."""
    lat = float(os.environ.get("SITE_LAT", "1.2136"))
    lon = float(os.environ.get("SITE_LON", "-77.2811"))
    tz = os.environ.get("SITE_TZ", DEFAULT_TZ)
    return OpenMeteoClient(latitude=lat, longitude=lon, timezone=tz)