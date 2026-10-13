# -*- coding: utf-8 -*-
"""Proveedores de pronostico de CLIMA (10 vars) — Fase 2.

Contrato de salida: DataFrame horario con las 10 variables climaticas
contratadas (config/sites/*.yaml). Cualquier proveedor (NWP Open-Meteo,
PatchTST) debe devolver el MISMO contrato para que la fisica
(PvPlant) y la calibracion (Fase 4) sean agnosticas al origin ML/NWP.

Jerarquia actual:
  - OpenMeteoClimateForecaster  : operativo (NWP, sin GPU). El de produccion.
  - PatchTSTClimateForecaster   : modelo multivariado 72h (Pasto, Narino).

Seleccion via factory: FORECASTER=openmeteo|patchtst|mos (default openmeteo).

"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient, WEATHER_VARIABLES

logger = logging.getLogger("optimization.prediction.forecaster")

DEFAULT_SITE = "pasto_narino"


# --------------------------------------------------------------------------- #
@dataclass
class ClimateForecast:
    """Pronostico de clima horario (+ metadatos de origen)."""
    data: pd.DataFrame            # index timestamp (tz-aware), 10 vars
    horizon_h: int
    provider: str

    @property
    def variables(self) -> list:
        return list(self.data.columns)


class ClimateForecaster(ABC):
    """Interfaz del proveedor de pronostico de clima horario."""

    provider_name: str = "abstract"

    def name(self) -> str:
        return self.provider_name

    @abstractmethod
    def forecast(self, days: float = 1.0) -> ClimateForecast:
        """Devuelve clima horario pronosticado para 'days' dias (>=1)."""
        ...


# --------------------------------------------------------------------------- #
class OpenMeteoClimateForecaster(ClimateForecaster):
    """Operativo: pronostico NWP de Open-Meteo (las 10 vars contratadas)."""
    provider_name = "openmeteo_nwp"

    def __init__(self, site_cfg: dict):
        self._client = OpenMeteoClient(
            latitude=site_cfg["latitude"], longitude=site_cfg["longitude"],
            timezone=site_cfg.get("timezone", "America/Bogota"))

    def forecast(self, days: float = 1.0) -> ClimateForecast:
        hours = max(1, int(days * 24))
        # Open-Meteo arranca en 00:00 local; con past_days=1 + corte desde
        # 'ahora' la serie queda anclada a la HORA ACTUAL (no a medianoche).
        df = self._client.fetch_forecast(
            past_days=1,
            forecast_days=hours // 24 + 1,
            start_from_now=True,
        )
        df = df.iloc[:hours]
        return ClimateForecast(data=df, horizon_h=len(df), provider=self.provider_name)


class PatchTSTClimateForecaster(ClimateForecaster):
    """PatchTST — modelo multivariado 72h (Pasto, Nariño) con cuantiles.

    Entrenado con 6 años de ERA5 (2020-2025). Predice las 10 variables
    climáticas contratadas para las próximas 72 h con P10/P50/P90 usando el
    truco kt/anomalía (target_specs.json) y normalización del train
    (norm_stats.csv). El paquete vive en prediction/patchtst/ (patchtst.py,
    targets.py, checkpoint .pt, specs, stats y el script predict_72h.py).

    El contexto (hasta la HORA ACTUAL) sale del forecast de Open-Meteo con
    past_days: NO usamos ERA5 archive (7 días de latencia)
    para que el pronóstico arranque en 'now' y no en días atrás. El modelo se
    carga lazy: solo torch en la primera llamada.

    Max horizonte: 72 h (el modelo predice 72 h de una sola vez (B,H,C,Q)).
    """
    provider_name = "patchtst"
    MAX_HORIZON_H = 72
    CONTEXT_LENGTH = 512     # context_length del modelo (patchtst.yaml)
    # variables de contexto: las 10 contratadas + wind_direction_100m
    # (feature_cols del modelo la requiere para wind_u/v_100m)
    CONTEXT_VARS = list(WEATHER_VARIABLES) + ["wind_direction_100m"]

    def __init__(self, site_cfg: dict = None):
        self.site_cfg = site_cfg or load_site(DEFAULT_SITE)["site"]
        self._model = None
        self._specs = None
        self._stats = None
        self._ctx_raw = None

    # ------------------------------------------------------------------ #
    def _load_lazy(self):
        """Carga el checkpoint + specs + stats una sola vez (import lazy)."""
        if self._model is not None:
            return
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError(
                "PatchTST requiere torch en esta maquina. "
                "Instala: pip install torch --index-url "
                "https://download.pytorch.org/whl/cpu  (o usa FORECASTER=openmeteo)."
            ) from exc
        from pathlib import Path
        from json import loads as _loads
        import os as _os

        pkg = Path(__file__).resolve().parent / "patchtst"
        ckpt_path = pkg / "patchtst_best.pt"
        specs_path = pkg / "target_specs.json"
        stats_path = pkg / "norm_stats.csv"
        if not ckpt_path.exists():
            raise RuntimeError(
                f"Falta el checkpoint PatchTST: {ckpt_path} "
                "(descomprimir modelo_patchtst_pasto.zip en "
                "optimization/prediction/patchtst/)"
            )
        from optimization.prediction.patchtst.patchtst import PatchTST  # NOQA
        from optimization.prediction.patchtst.predict_72h import (
            add_features, apply_transforms, decode,  # NOQA: reutilizamos la logica
        )

        torch.set_num_threads(max(4, _os.cpu_count() or 4))
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        fc = ckpt["config"]["forecast"]
        mc = ckpt["config"]["patchtst"]
        model = PatchTST(
            context_length=fc["context_length"], horizon=fc["horizon"],
            n_channels=len(ckpt["feature_cols"]), quantiles=fc["quantiles"],
            patch_len=mc["patch_len"], stride=mc["stride"],
            d_model=mc["d_model"], n_heads=mc["n_heads"],
            e_layers=mc["e_layers"], d_ff=mc["d_ff"], dropout=mc["dropout"],
            target_idx=ckpt["target_idx"],
        )
        model.load_state_dict(ckpt["model_state"])
        model.eval()

        stats = pd.read_csv(stats_path, index_col=0)
        specs = _loads(specs_path.read_text(encoding="utf-8"))
        # deja las climatologías como arrays para evitar re-casts
        for _s in specs.values():
            if "climatology" in _s:
                _s["climatology"] = list(_s["climatology"])

        self._ckpt = ckpt
        self._stats = stats
        self._specs = specs
        self._model = (model, add_features, apply_transforms, decode)

    @property
    def variables(self) -> list:
        return list(WEATHER_VARIABLES)

    # ------------------------------------------------------------------ #
    def _context_df(self, anchor: pd.Timestamp | None = None) -> pd.DataFrame:
        """Contexto observado hasta la HORA ACTUAL (Open-Meteo forecast).

        fetch_forecast(past_days=..., forecast_days=1) y
        recorte en la hora actual -> la ventana del modelo termina en now-1h
        y el pronóstico arranca exactamente en 'now' (no 00:00 ni días atrás).

        Con `anchor` (Timestamp tz-aware) el contexto termina en anchor-1h:
        permite emitir el pronóstico "como si fuera" una fecha pasada
        (uso en backtest en lazo cerrado del Experimento A).
        """
        client = OpenMeteoClient(
            latitude=self.site_cfg["latitude"],
            longitude=self.site_cfg["longitude"],
            timezone=self.site_cfg.get("timezone", "America/Bogota"),
            variables=self.CONTEXT_VARS,
        )
        if anchor is None:
            now_hour = pd.Timestamp.now(tz=client.timezone).floor("h")
        else:
            if anchor.tz is None:
                anchor = anchor.tz_localize(client.timezone)
            now_hour = anchor.floor("h")
            # Opción B (PASO 2): contexto del archive ERA5 para anchors
            # pasados (el forecast API solo llega ~70 días atrás). La ruta
            # en vivo NO se toca. Corte anti-fuga conservado.
            start = (now_hour - pd.Timedelta(
                hours=self.CONTEXT_LENGTH + 24 * 13)).strftime("%Y-%m-%d")
            df = client.fetch_archive(
                start, (now_hour - pd.Timedelta(hours=1)).strftime("%Y-%m-%d"))
            if df.empty:
                raise RuntimeError(
                    "Contexto PatchTST vacío (archive sin datos)")
            df = df.loc[df.index < now_hour]
            if len(df) < self.CONTEXT_LENGTH:
                raise RuntimeError(
                    f"Contexto insuficiente: {len(df)}h < "
                    f"{self.CONTEXT_LENGTH}h (anchor={now_hour}, archive)")
            return df.reset_index().rename(columns={"time": "timestamp"})
        # el fetch de Open-Meteo es relativo a HOY: para que la ventana cubra
        # 512h antes de 'anchor' se piden past_days extra. Se cachea por
        # instancia (el backtest reutiliza el mismo contexto en cada hora).
        need_from = now_hour - pd.Timedelta(hours=self.CONTEXT_LENGTH + 24)
        base_days = self.CONTEXT_LENGTH // 24 + 1
        extra_days = max(0, int((pd.Timestamp.now(tz=client.timezone)
                                 - need_from).total_seconds() // 86400))
        past_days = min(base_days + extra_days, 92)
        if (self._ctx_raw is None
                or self._ctx_raw[1].index.min() > need_from):
            self._ctx_raw = (past_days, client.fetch_forecast(
                past_days=past_days, forecast_days=1))
        df = self._ctx_raw[1]
        if df.empty:
            raise RuntimeError("Contexto PatchTST vacío (Open-Meteo sin datos)")
        df = df.loc[df.index < now_hour]
        if len(df) < self.CONTEXT_LENGTH:
            raise RuntimeError(
                f"Contexto insuficiente: {len(df)}h < {self.CONTEXT_LENGTH}h "
                f"(anchor={now_hour}, past_days={past_days})")
        # el feature engineering del paquete espera una columna 'timestamp'
        return df.reset_index().rename(columns={"time": "timestamp"})

    def forecast(self, days: float = 1.0,
                 anchor: pd.Timestamp | None = None) -> ClimateForecast:
        horizon = max(1, int(days * 24))
        if horizon > self.MAX_HORIZON_H:
            raise RuntimeError(
                f"PatchTST: horizonte máx {self.MAX_HORIZON_H}h (se pidió {horizon})")
        self._load_lazy()

        model, add_features, apply_transforms, decode = self._model
        ckpt, stats, specs = self._ckpt, self._stats, self._specs
        tz = self.site_cfg.get("timezone", "America/Bogota")
        lat = float(self.site_cfg["latitude"])

        df = self._context_df(anchor=anchor)
        df = add_features(df, lat)
        df = apply_transforms(df, specs)

        feature_cols = ckpt["feature_cols"]
        target_cols = ckpt.get("target_cols", [f"{t}__tr" for t in ckpt["target_names"]])
        target_names = ckpt["target_names"]
        quantiles = ckpt["config"]["forecast"]["quantiles"]
        H = ckpt["config"]["forecast"]["horizon"]

        ctx = df[feature_cols].iloc[-self.CONTEXT_LENGTH:].to_numpy(dtype="float32")
        mean = stats.loc[feature_cols, "mean"].to_numpy()
        std = stats.loc[feature_cols, "std"].to_numpy() + 1e-8
        x = ((ctx - mean) / std).astype("float32")

        import torch
        with torch.no_grad():
            pred_z = model(torch.from_numpy(x).unsqueeze(0)).numpy()[0]  # (H,C,Q)

        tmean = stats.loc[target_cols, "mean"].to_numpy()
        tstd = stats.loc[target_cols, "std"].to_numpy() + 1e-8
        pred = pred_z * tstd[None, :, None] + tmean[None, :, None]  # (H,C,Q)

        # geometría solar del horizonte (denominadores deterministas) + horas
        last_ts = pd.Timestamp(df["timestamp"].iloc[-1])
        fc_times = pd.date_range(last_ts + pd.Timedelta(hours=1),
                                 periods=H, freq="h", tz=tz)
        geo_df = add_features(
            pd.DataFrame({"timestamp": fc_times,
                          **{v: 0.0 for v in self.CONTEXT_VARS}}),
            lat)
        hours_fc = fc_times.hour.values

        for c, name in enumerate(target_names):
            spec = specs.get(name)
            if not spec:
                continue
            if spec["type"] == "divide":
                d = geo_df[spec["denom"]].to_numpy()[:H]
                pred[:, c, :] = decode(pred[:, c, :], spec, denom=d)
            elif spec["type"] == "anomaly":
                pred[:, c, :] = decode(pred[:, c, :], spec, hours=hours_fc)

        for c, name in enumerate(target_names):
            if name in ("shortwave_radiation", "direct_normal_irradiance",
                        "diffuse_radiation", "wind_speed_100m",
                        "wind_speed_10m", "precipitation"):
                pred[:, c, :] = np.clip(pred[:, c, :], 0, None)

        # serie central (P50) con el contrato de WEATHER_VARIABLES
        q_mid = quantiles.index(0.5)
        central = {name: pred[:, c, q_mid]
                   for c, name in enumerate(target_names)}
        out = pd.DataFrame(central, index=fc_times)[self.variables]
        out = out.iloc[:horizon]
        return ClimateForecast(data=out, horizon_h=len(out), provider=self.provider_name)


# NOTA (Cambio 02): "mos" NO se importa a nivel de módulo para evitar el
# import circular mos_forecaster <-> forecaster (el import directo de
# mos_forecaster fallaba). Se resuelve perezosamente en get_climate_provider.
# NOTA (2026-10-12): "timesfm" RETIRADO (no viable por ahora). Quien pida
# FORECASTER=timesfm cae a openmeteo con warning (ver get_climate_provider);
# el historial de la clase vive en git. No re-agregar sin dato de viabilidad.
_PROVIDERS = {
    "openmeteo": OpenMeteoClimateForecaster,
    "patchtst": PatchTSTClimateForecaster,
}


def get_climate_provider(site_cfg: dict = None,
                         name: str | None = None) -> ClimateForecaster:
    """Factory: nombre o env FORECASTER (default openmeteo)."""
    name = (name or os.environ.get("FORECASTER") or "openmeteo").lower()
    if name == "mos":
        from optimization.prediction.mos_forecaster import (
            MOSClimateForecaster,  # import perezoso: evita ciclo con forecaster
        )
        if site_cfg is None:
            site_cfg = load_site(DEFAULT_SITE)["site"]
        return MOSClimateForecaster(site_cfg)
    if name not in _PROVIDERS:
        logger.warning("FORECASTER=%s desconocido; usa openmeteo", name)
        name = "openmeteo"
    if site_cfg is None:
        site_cfg = load_site(DEFAULT_SITE)["site"]
    return _PROVIDERS[name](site_cfg)