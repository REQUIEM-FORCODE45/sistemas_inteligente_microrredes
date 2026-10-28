# -*- coding: utf-8 -*-
"""Provider FORECASTER=itransformer: iTransformer v1 SOLO (sprint 1, paso 5.3).

Sin el corrector LightGBM del MOS: solo el P50 decodificado a física +
recorte a rango con conteo (A.2). La banda la sigue poniendo el conformal
del cambio 06 (igual que el MOS expone solo la central).

No duplica el modelo: COMPONE un MOSClimateForecaster y reutiliza
_load_lazy (checkpoint), _context_df y _v1_phys. Si mañana cambia el
checkpoint, los dos providers lo ven.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from optimization.prediction.forecaster import (
    ClimateForecaster,
    ClimateForecast,
)
from optimization.prediction.mos_forecaster import clip_itransformer_phys

logger = logging.getLogger(__name__)


class ITransformerClimateForecaster(ClimateForecaster):
    """iTransformer v1 SOLO (sin el corrector LightGBM del MOS)."""

    provider_name = "itransformer"
    MAX_HORIZON_H = 72

    def __init__(self, site_cfg=None):
        from optimization.prediction.mos_forecaster import (
            MOSClimateForecaster,  # import perezoso: mismo estilo que "mos"
        )
        self._mos = MOSClimateForecaster(site_cfg)

    @property
    def variables(self) -> list:
        return self._mos.variables

    def forecast(self, days: float = 1.0,
                 anchor: pd.Timestamp | None = None) -> ClimateForecast:
        horizon = max(1, int(days * 24))
        if horizon > self.MAX_HORIZON_H:
            raise RuntimeError(
                f"itransformer: horizonte máx 72h (se pidió {horizon})")
        self._mos._load_lazy()
        tz = self._mos.site_cfg.get("timezone", "America/Bogota")
        if anchor is None:
            now_hour = pd.Timestamp.now(tz=tz).floor("h")
        else:
            now_hour = anchor.tz_localize(tz) if anchor.tz is None \
                else anchor.tz_convert(tz)
            now_hour = now_hour.floor("h")
        ctx = self._mos._context_df(anchor)
        ctx = ctx.loc[ctx.index < now_hour].iloc[
            -self._mos.CONTEXT_LENGTH:]
        fut_idx = pd.date_range(now_hour, periods=self._mos._cfg["H"],
                                freq="h", tz=tz)
        v1 = self._mos._v1_phys(ctx, fut_idx)
        raw = {var: np.asarray(v1[var], dtype=float)[:horizon]
               for var in self.variables}
        clipped, counts = clip_itransformer_phys(raw)
        if counts:
            logger.info("itransformer recortes físicos %s "
                        "(horizonte %dh)", counts, horizon)
        out = pd.DataFrame(clipped, index=fut_idx[:horizon])[self.variables]
        out = out.astype("float64")
        if bool(out.isna().any().any()):
            raise RuntimeError("itransformer: NaN en la salida")
        return ClimateForecast(data=out, horizon_h=len(out),
                               provider=self.provider_name)
