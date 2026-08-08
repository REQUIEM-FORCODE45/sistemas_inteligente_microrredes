# -*- coding: utf-8 -*-
"""PvPlant CALIBRADO — objeto de produccion que une N1 (params+K) + N2 (residuo).

P_final(t) = K * P_fisico(θ_calibrado, clima(t)) + residuo_ML(features(t))

Expone predict_power (punto) y predict_band (P10/P50/P90) para el forecast
(es el objeto que consume /forecast/power con banda de cuantiles).
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from optimization.physics.pv import PvPlant
from optimization.calibration.params import build_plant
from optimization.calibration.derating import apply_derating
from optimization.calibration.residual import residual_features, residual_predict

logger = logging.getLogger("optimization.calibration")

QUANTILES = (0.10, 0.50, 0.90)


class CalibratedPvPlant:
    """Planta calibrada (params + derating + opcional residuo GBR)."""

    def __init__(self, plant: PvPlant, params: dict, k: float,
                 residual_model: Optional[GradientBoostingRegressor] = None,
                 residual_q: Optional[np.ndarray] = None,
                 conformal_radius_kw: Optional[float] = None,
                 alpha: float = 0.2,
                 t0: Optional[pd.Timestamp] = None,
                 meta: Optional[dict] = None):
        self.plant_calib = build_plant(plant, params)
        self.params = params
        self.k = k
        self.residual_model = residual_model
        self.residual_q = residual_q          # cuantiles empiricos del residuo train
        self.conformal_radius_kw = conformal_radius_kw  # banda conformal (Fase 3)
        self.alpha = alpha
        self.t0 = t0
        self.meta = meta or {}

    # ------------------------------------------------------------------ #
    def _base_kw(self, climate: pd.DataFrame) -> pd.Series:
        """P_fisico(θ_calibrado) * K  [kW]."""
        return apply_derating(self.plant_calib.ac_power(climate) / 1000.0, self.k)

    def predict_power(self, climate: pd.DataFrame, use_residual: bool = True) -> pd.Series:
        """Punto de pronostico [kW]. Si no hay modelo de residuo, base calibrada."""
        out = self._base_kw(climate)
        if use_residual and self.residual_model is not None and self.t0 is not None:
            feats = residual_features(climate, self.t0)
            out = out + residual_predict(self.residual_model, feats)
        return out.clip(lower=0.0)

    # ------------------------------------------------------------------ #
    def predict_band(self, climate: pd.DataFrame,
                     quantiles=QUANTILES) -> pd.DataFrame:
        """Franja P10/P50/P90 [kW].

        Prioridad de banda:
          1) split-conformal (Fase 3): radio calibrado con garantia de
             cobertura ~1-alpha sobre el holdout.
          2) cuantiles empiricos del residuo train (fallback, HO#3).
        """
        p50 = self.predict_power(climate, use_residual=self.residual_model is not None)
        out = pd.DataFrame({"P50": p50})
        if self.conformal_radius_kw is not None:
            from optimization.calibration.conformal import conformal_band
            band = conformal_band(p50, self.conformal_radius_kw)
            out["P10"] = band["P10"]
            out["P90"] = band["P90"]
        elif self.residual_q is not None:
            out["P10"] = p50 + self.residual_q[0]
            out["P90"] = p50 + self.residual_q[2]
        else:
            out["P10"] = p50
            out["P90"] = p50
        return out.clip(lower=0.0)

    # ------------------------------------------------------------------ #
    @property
    def source(self) -> str:
        return f"physics+ML(seed={self.meta.get('seed')})"

    def summary(self) -> str:
        rq = ("" if self.residual_q is None
              else f" | q10/q90=({self.residual_q[0]:.3f},{self.residual_q[2]:.3f})")
        return (f"K={self.k:.4f} losses={self.params['losses_pct']:.1f} "
                f"eta={self.params['inverter_eta']:.3f} "
                f"gamma={self.params['temp_coeff_pct_per_c']:.3f}{rq}")