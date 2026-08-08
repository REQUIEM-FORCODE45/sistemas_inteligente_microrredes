# -*- coding: utf-8 -*-
"""Calibracion de modelos dinamicos (Fase 4, HO#3).

Grey-box de dos niveles en cascada para PV (y aplicable a wind/BESS):
    N1a  derating K           -> quita el sesgo promedio
    N1b  least_squares        -> identifica (losses/eta/gamma) fisicos
    N2   GBR de residuos      -> aprende efectos no-fisicos (suciedad/sombra)

Uso tipico:
    from optimization.calibration.experiments import run_experiment, print_result
    res = run_experiment(cfg, climate_hourly, seed=42)
    print_result(res)
"""
from optimization.calibration.derating import estimate_derating, apply_derating
from optimization.calibration.params import calibrate_params, build_plant, BOUNDS
from optimization.calibration.residual import (residual_features, fit_residual_gbr,
                                               residual_predict, feature_importance)
from optimization.calibration.calibrated_plant import CalibratedPvPlant
from optimization.calibration.experiments import run_experiment, print_result

__all__ = [
    "estimate_derating", "apply_derating",
    "calibrate_params", "build_plant", "BOUNDS",
    "residual_features", "fit_residual_gbr", "residual_predict", "feature_importance",
    "CalibratedPvPlant",
    "run_experiment", "print_result",
]