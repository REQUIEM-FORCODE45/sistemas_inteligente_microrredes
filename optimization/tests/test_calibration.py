# -*- coding: utf-8 -*-
"""Tests de la calibracion en dos niveles (Fase 2, HO#3).

Hermeticos (sin red): usan clima sintetico de pvlib. Verifican que cada pieza
de la cascada hace lo que debe:
  - N1a derating recupera la escala
  - N1b least_squares recupera la verdad oculta (clave de respuestas)
  - N2 el GBR aprende un patron horario (sombra) que la fisica no modela
  - la banda P10/P50/P90 del objeto calibrado es consistente
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import mean_squared_error

from optimization.physics.pv import PvPlant
from optimization.calibration.derating import estimate_derating, apply_derating
from optimization.calibration.params import calibrate_params, build_plant
from optimization.calibration.residual import (precip_accum, residual_features,
                                               fit_residual_gbr, residual_predict)
from optimization.calibration.calibrated_plant import CalibratedPvPlant


def fake_climate(days: int = 5) -> pd.DataFrame:
    idx = pd.date_range("2026-06-01", periods=days * 24, freq="h", tz="America/Bogota")
    hour = idx.hour.to_numpy()
    df = pd.DataFrame(index=idx)
    ghi = np.maximum(0, np.sin(hour / 24 * 2 * np.pi)) * 800
    df["shortwave_radiation"] = ghi
    df["direct_normal_irradiance"] = ghi * 0.75
    df["diffuse_radiation"] = ghi * 0.25
    df["temperature_2m"] = 18 + 6 * np.sin(hour / 24 * 2 * np.pi)
    df["relative_humidity_2m"] = 70.0
    df["cloud_cover"] = 40.0
    df["wind_speed_100m"] = 2.0
    df["wind_speed_10m"] = 1.0
    df["surface_pressure"] = 757.0
    df["precipitation"] = 0.0
    return df


def test_precip_accum():
    mm = np.array([0.0, 0.0, 5.0, 0.0, 0.0, 2.0, 0.0])
    np.testing.assert_allclose(precip_accum(mm), [1.0, 2.0, 0.0, 1.0, 2.0, 0.0, 1.0])


def test_derating_recovers_scale():
    climate = fake_climate()
    nominal = PvPlant()
    truth = PvPlant(losses_pct=21.0, inverter_eta=0.93, temp_coeff_pct_per_c=-0.42)
    p_nom = nominal.ac_power(climate) / 1000.0
    p_true = truth.ac_power(climate) / 1000.0
    k = estimate_derating(p_nom, p_true, nominal.capacity_kwp)
    assert 0.7 < k < 1.0
    corr = apply_derating(p_nom, k)
    assert mean_squared_error(corr, p_true) < mean_squared_error(p_nom, p_true)


def test_params_recovery_clave_respuestas():
    """El calibrador debe recuperar la verdad oculta a partir de mediciones."""
    climate = fake_climate(days=6)
    nominal = PvPlant()  # catalogo: 14 / 0.96 / -0.38
    truth = PvPlant(losses_pct=21.0, inverter_eta=0.93, temp_coeff_pct_per_c=-0.42)
    p_real = truth.ac_power(climate) / 1000.0  # sin ruido: identificacion pura

    rec = calibrate_params(nominal, climate, p_real)
    assert abs(rec["losses_pct"] - 21.0) < 2.0
    assert abs(rec["inverter_eta"] - 0.93) < 0.02
    assert abs(rec["temp_coeff_pct_per_c"] - (-0.42)) < 0.05

    # la planta recalibrada mejora el RMSE vs nominal
    calib = build_plant(nominal, rec)
    assert (mean_squared_error(calib.ac_power(climate) / 1000.0, p_real)
            < mean_squared_error(nominal.ac_power(climate) / 1000.0, p_real))


def test_residual_gbr_learns_shade_pattern():
    """N2: un patron horario deterministico (sombra) debe aprenderse."""
    climate = fake_climate(days=14)
    hour = climate.index.hour.to_numpy()
    shade = np.where((hour >= 6) & (hour < 10), -0.6, 0.0)  # "sombra" en kW
    noise = np.random.default_rng(0).normal(0, 0.05, len(climate))
    residual = pd.Series(shade + noise, index=climate.index)

    feats = residual_features(climate, climate.index[0], with_precip_cum=False)
    n_tr = int(0.7 * len(climate))
    model = fit_residual_gbr(feats.iloc[:n_tr], residual.iloc[:n_tr])
    pred = residual_predict(model, feats.iloc[n_tr:])
    err = mean_squared_error(pred, residual.iloc[n_tr:])
    assert err < 0.01  # aprendio el patron (sombra ~ -0.6 kW)

    # la sombra se captura via hour_sin/cos: hora 6-10 negativo
    mask_morning = (hour[n_tr:] >= 6) & (hour[n_tr:] < 10)
    assert pred[mask_morning].mean() < -0.3


def test_band_consistente():
    climate = fake_climate(days=1)
    plant = PvPlant()
    cp = CalibratedPvPlant(
        plant=plant, params=dict(losses_pct=15.0, inverter_eta=0.95,
                                 temp_coeff_pct_per_c=-0.4),
        k=0.9, residual_q=np.array([-0.5, 0.0, 0.6]),
        t0=climate.index[0])
    band = cp.predict_band(climate)
    assert list(band.columns) == ["P50", "P10", "P90"]
    assert (band["P10"] <= band["P50"] + 1e-9).all()
    assert (band["P50"] <= band["P90"] + 1e-9).all()
    assert (band >= 0).all().all()
