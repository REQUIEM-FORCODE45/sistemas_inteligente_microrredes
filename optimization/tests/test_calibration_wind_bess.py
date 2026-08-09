# -*- coding: utf-8 -*-
"""Tests de calibracion eolica y BESS (Fase 4) — clave de respuestas."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.physics.wind import WindTurbine
from optimization.physics.bess import Bess
from optimization.calibration.wind import calibrate_wind, estimate_wind_derating
from optimization.calibration.bess import calibrate_bess, calibrated_bess
from optimization.calibration.residual import residual_features_wind


def test_wind_features_no_usa_radiacion_solar():
    """Regresion: el residuo eolico NO debe usar ghi/radiacion (opcion A).

    El viento no debe acoplarse al sol; las features eolicas son fisicas de
    viento (wind_speed_*, presion, temperatura) + temporales.
    """
    climate = windy_climate(3)
    feats = residual_features_wind(climate, climate.index[0])
    cols = set(feats.columns)
    assert "wind_speed_100m" in cols
    assert "wind_speed_10m" in cols
    assert "surface_pressure" in cols
    # ninguna columna de radiacion solar
    assert not cols.intersection({"ghi", "shortwave_radiation",
                                  "direct_normal_irradiance",
                                  "diffuse_radiation"})
    assert len(feats) == len(climate)


def windy_climate(days: int = 40) -> pd.DataFrame:
    """Clima con viento util (Guajira-like) para validar la metodologia."""
    idx = pd.date_range("2026-01-01", periods=days * 24, freq="h",
                        tz="America/Bogota")
    day = idx.hour.to_numpy()
    wind = 7.0 + 3.0 * np.sin(day / 24 * 2 * np.pi)
    c = pd.DataFrame(index=idx)
    c["wind_speed_100m"] = wind
    c["wind_speed_10m"] = wind * 0.7
    c["surface_pressure"] = 757.0
    c["temperature_2m"] = 18.0
    c["shortwave_radiation"] = 0.0
    c["direct_normal_irradiance"] = 0.0
    c["diffuse_radiation"] = 0.0
    c["relative_humidity_2m"] = 70.0
    c["cloud_cover"] = 40.0
    c["precipitation"] = 0.0
    return c


def test_wind_derating_recupera_escala():
    climate = windy_climate()
    nominal = WindTurbine()
    truth = WindTurbine(capacity_kw=80.0)  # real: 80 kW vs nominal 100
    p_true = truth.ac_power(climate) / 1000.0
    k = estimate_wind_derating(nominal, climate, p_true)
    assert 0.6 < k < 0.95
    assert abs(k - 0.8) < 0.15


def test_wind_calibrate_mejora_rmse():
    climate = windy_climate(60)
    nominal = WindTurbine()
    truth = WindTurbine(capacity_kw=80.0, cut_in_ms=2.5)
    rng = np.random.default_rng(7)
    p_true = truth.ac_power(climate) / 1000.0
    p_meas = (p_true + rng.normal(0, 0.5, len(p_true))).clip(lower=0.0)
    res = calibrate_wind(nominal, climate, p_meas, seed=7)
    assert res["rmse_hibrido"] < res["rmse_nominal"]
    assert res["rmse_derating"] < res["rmse_nominal"]
    band = res["calibrated"].predict_band(climate.iloc[:24])
    assert list(band.columns) == ["P10", "P50", "P90"]


def test_wind_degenerado_sin_viento():
    """En Pasto (viento ~0) la calibracion debe fallar informando limite."""
    idx = pd.date_range("2026-01-01", periods=48, freq="h", tz="America/Bogota")
    c = pd.DataFrame(index=idx)
    c["wind_speed_100m"] = 1.5  # < cut_in: sin senal
    c["wind_speed_10m"] = 1.0
    c["surface_pressure"] = 757.0
    c["temperature_2m"] = 18.0
    for col in ["shortwave_radiation", "direct_normal_irradiance",
                "diffuse_radiation", "relative_humidity_2m", "cloud_cover",
                "precipitation"]:
        c[col] = 0.0
    with pytest.raises(ValueError, match="Demasiadas pocas horas"):
        estimate_wind_derating(WindTurbine(), c, pd.Series([0.0] * 48, index=idx))


def test_bess_identifica_eficiencias():
    """Con SOC medido (ruido bajo) se recuperan las eficiencias ocultas."""
    bess_nominal = Bess()  # 0.95 / 0.95 / 200
    truth = Bess(charge_efficiency=0.90, discharge_efficiency=0.90,
                 capacity_kwh=180.0)
    rng = np.random.default_rng(42)
    n = 24 * 20
    power = pd.Series(rng.uniform(-40, 40, n), index=pd.date_range(
        "2026-02-01", periods=n, freq="h", tz="America/Bogota"))
    soc_true = truth.simulate(power, dt_h=1.0)["soc_pct"]
    soc_meas = soc_true + rng.normal(0, 0.5, n)

    params = calibrate_bess(bess_nominal, power, soc_meas, dt_h=1.0)
    assert abs(params["charge_efficiency"] - 0.90) < 0.03
    assert abs(params["discharge_efficiency"] - 0.90) < 0.03
    assert abs(params["capacity_kwh"] - 180.0) < 10.0
    assert params["rmse_soc_final_pct"] < params["rmse_soc_inicial_pct"]

    b_cal = calibrated_bess(bess_nominal, params)
    soc_cal = b_cal.simulate(power, dt_h=1.0)["soc_pct"]
    err_cal = np.sqrt(np.mean((soc_cal - soc_true) ** 2))
    err_nom = np.sqrt(np.mean((bess_nominal.simulate(power, dt_h=1.0)["soc_pct"]
                               - soc_true) ** 2))
    assert err_cal < err_nom
