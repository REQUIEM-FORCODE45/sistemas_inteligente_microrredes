# -*- coding: utf-8 -*-
"""Experimentos de calibracion sintetica (replican HO#3 sec 4 y 5).

Filosofia "examen con clave": nosotros fijamos la verdad oculta (HIDDEN) y
generamos las mediciones (clima REAL ERA5 + parametros ocultos + efectos +
ruido con semilla fija). El calibrador ve SOLO las mediciones (perfil de
produccion) y debe recuperar la verdad / minimizar el RMSE fuera de muestra.

Cascada de etapas (por ambas semillas):
  nominal   : PvPlant de catalogo (sin calibrar)
  derating  : N1a  K (minimos cuadrados sin intercepto)
  calibrado : N1b  least_squares (losses/eta/gamma)
  hibrido   : N2   base calibrada + GBR de residuos (regla de oro)

Los datos usados son observaciones horarias de Pasto (al menos ~6 meses ERA5)
para que el soiling (150 d) y la sombra tengan señal y el ML aprenda.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional

import numpy as np
import pandas as pd

from optimization.physics.pv import PvPlant
from optimization.data.synthetic.truth import HIDDEN, measured_cleaning
from optimization.calibration.derating import estimate_derating, apply_derating
from optimization.calibration.params import calibrate_params, build_plant
from optimization.calibration.residual import (residual_features, fit_residual_gbr,
                                               residual_predict, feature_importance)
from optimization.calibration.calibrated_plant import CalibratedPvPlant

logger = logging.getLogger("optimization.calibration.experiments")


@dataclass
class ExperimentResult:
    seed: int
    n_train: int
    n_val: int
    rmse: Dict[str, float]                  # etapa -> RMSE [kW]
    k: float
    params_recovered: Dict[str, float]
    params_hidden: Dict[str, float]
    residual_q: np.ndarray                  # q10/q50/q90 del residuo (train)
    conformal_radius_kw: float = 0.0
    coverage_holdout: float | None = None   # cobertura P10-P90 en validacion
    coverage_q90: float | None = None       # sensibilidad: radio al nivel q90
    coverage_q95: float | None = None       # sensibilidad: radio al nivel q95
    importance: Optional[pd.DataFrame] = None
    calibrated: Optional[CalibratedPvPlant] = None   # objeto listo para forecast

    def table(self) -> pd.DataFrame:
        df = pd.DataFrame({"RMSE_kW": self.rmse}).T
        df.index.name = "etapa"
        return df


def rmse(a: pd.Series, b: pd.Series) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


def build_nominal_plant(cfg: dict) -> PvPlant:
    pv_cfg = cfg["pv"]
    return PvPlant(
        capacity_kwp=pv_cfg["capacity_kwp"],
        surface_tilt_deg=pv_cfg["surface_tilt_deg"],
        surface_azimuth_deg=pv_cfg["surface_azimuth_deg"],
        losses_pct=pv_cfg["losses_pct"],
        inverter_eta=pv_cfg["inverter_eta"],
        temp_coeff_pct_per_c=pv_cfg["temp_coeff_pct_per_c"],
    )


def build_truth_plant(cfg: dict, hidden: dict) -> PvPlant:
    """Planta con la 'verdad oculta' (mismos parametros geometricos que nominal)."""
    pv_cfg = cfg["pv"]
    return PvPlant(
        capacity_kwp=pv_cfg["capacity_kwp"],
        surface_tilt_deg=pv_cfg["surface_tilt_deg"],
        surface_azimuth_deg=pv_cfg["surface_azimuth_deg"],
        losses_pct=hidden["losses_pct"],
        inverter_eta=hidden["inverter_eta"],
        temp_coeff_pct_per_c=hidden["temp_coeff_pct_per_c"],
    )


def generate_truth(cfg: dict, climate: pd.DataFrame, seed: int):
    """P_verdadera y P_medida [kW] con la semilla de la verdad oculta."""
    hidden = HIDDEN[seed]
    truth_plant = build_truth_plant(cfg, hidden)
    p_truth_kw = truth_plant.ac_power(climate) / 1000.0
    t_days = ((climate.index - climate.index[0]).total_seconds() / 86400.0)
    t_days = pd.Series(t_days, index=climate.index)
    p_meas_kw = measured_cleaning(p_truth_kw, seed, t_days=t_days)
    return p_truth_kw, p_meas_kw


def run_experiment(cfg: dict, climate: pd.DataFrame, seed: int,
                   train_pct: float = 0.70) -> ExperimentResult:
    """Corre la cascada completa Calibracion N1+N2 y reporta RMSE por etapa.

    El split es TEMPORAL (primeros train_pct% entrenan, el resto validan),
    HO#3 (train 4000/5500). La 'clave de respuestas' (hidden) solo se usa para
    interpretar, jamas entra como input al calibrador.
    """
    hidden = HIDDEN[seed]
    nominal = build_nominal_plant(cfg)
    p_truth, p_meas = generate_truth(cfg, climate, seed)

    n = len(climate)
    n_train = int(n * train_pct)
    cli_tr, cli_va = climate.iloc[:n_train], climate.iloc[n_train:]
    p_tr = p_meas.iloc[:n_train]
    p_va = p_meas.iloc[n_train:]

    # ---- mediciones de etapa: nominal (para N1a) -------------------------
    p_nom_tr = nominal.ac_power(cli_tr) / 1000.0
    p_nom_va = nominal.ac_power(cli_va) / 1000.0

    # N1a derating (K se estima en train, se aplica en val)
    k = estimate_derating(p_nom_tr, p_tr, nominal.capacity_kwp)
    p_der_va = apply_derating(p_nom_va, k)

    # N1b calibracion parametrica (leastsq en train, aplica en val)
    params = calibrate_params(nominal, cli_tr, p_tr)
    plant_calib = build_plant(nominal, params)
    p_calib_tr = plant_calib.ac_power(cli_tr) / 1000.0
    p_calib_va = plant_calib.ac_power(cli_va) / 1000.0

    # N2 residuo: SIEMPRE contra la base calibrada (regla de HO#3).
    # SPLIT-CONFORMAL limpio: el GBR se entrena con el 80% INICIAL del train;
    # el 20% FINAL queda disjunto como split de calibracion (HO#3 sec 6.6).
    n_fit = int(0.8 * n_train)
    feats_fit = residual_features(cli_tr.iloc[:n_fit], climate.index[0])
    resid_fit = (p_tr.iloc[:n_fit] - p_calib_tr.iloc[:n_fit])
    gbr = fit_residual_gbr(feats_fit, resid_fit)

    feats_va = residual_features(cli_va, climate.index[0])
    p_hib_va = (p_calib_va + residual_predict(gbr, feats_va)).clip(lower=0.0)

    # cuantiles del residuo solo OUT-OF-SAMPLE (banda P10-P90 honesta)
    q = np.quantile(resid_fit.values, [0.10, 0.50, 0.90])

    # Fase 3 — split-conformal: split disjunto = ultimo 20% del train.
    from optimization.calibration.conformal import (conformal_radius, coverage,
                                                   conformal_band)
    cal_resid = resid_fit.iloc[-int(0.2 * n_fit):]
    radius = conformal_radius(cal_resid, alpha=0.2, method="absolute")

    calibrated = CalibratedPvPlant(
        plant=nominal, params=params, k=k,
        residual_model=gbr, residual_q=q,
        conformal_radius_kw=radius, alpha=0.2,
        t0=climate.index[0], meta={"seed": seed})

    # cobertura de la banda conformal sobre el HOLD-OUT (nunca visto)
    band_va = calibrated.predict_band(cli_va)
    cov = coverage(p_va, band_va)
    # sensibilidad: cobertura si el radio fuera q90/q95 (deriva temporal)
    r90 = conformal_radius(cal_resid, alpha=0.1, method="absolute")
    r95 = conformal_radius(cal_resid, alpha=0.05, method="absolute")
    cov90 = coverage(p_va, conformal_band(p_hib_va, r90))
    cov95 = coverage(p_va, conformal_band(p_hib_va, r95))

    return ExperimentResult(
        seed=seed,
        n_train=n_train,
        n_val=n - n_train,
        rmse={
            "nominal": rmse(p_nom_va, p_va),
            "derating": rmse(p_der_va, p_va),
            "calibrado": rmse(p_calib_va, p_va),
            "hibrido": rmse(p_hib_va, p_va),
        },
        k=k,
        params_recovered=params,
        params_hidden=hidden,
        residual_q=q,
        conformal_radius_kw=radius,
        coverage_holdout=cov,
        coverage_q90=cov90,
        coverage_q95=cov95,
        importance=feature_importance(gbr, feats_fit),
        calibrated=calibrated,
    )


def print_result(res: ExperimentResult) -> None:
    print(f"\n=== Experimento seed={res.seed}  (train={res.n_train}, val={res.n_val} h) ===")
    for stage, r in res.rmse.items():
        print(f"  {stage:10s} RMSE = {r:6.3f} kW")
    print(f"  K derating  = {res.k:.4f}")
    print(f"  banda conformal radio={res.conformal_radius_kw:.3f} kW "
          f"cobertura_holdout={res.coverage_holdout:.1%} "
          f"(q90:{res.coverage_q90:.0%} q95:{res.coverage_q95:.0%})")
    rec = res.params_recovered
    hid = res.params_hidden
    print("  params hidden     : " + ", ".join(f"{k}={hid[k]:.3f}" for k in hid if k.startswith(("losses", "inverter", "temp"))))
    print("  params recuperados: " + ", ".join(f"{k}={v:.3f}" for k, v in rec.items()))
    if res.importance is not None:
        top = res.importance.head(3)
        print("  top features: " + ", ".join(f"{r.feature}" for r in top.itertuples()))