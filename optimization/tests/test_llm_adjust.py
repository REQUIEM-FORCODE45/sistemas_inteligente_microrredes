# -*- coding: utf-8 -*-
"""Tests de la capa LLM de ajuste (Fase 7) — hermet, sin red."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from optimization.prediction.llm_adjust import (adjust_forecast_with_alert,
                                                check_alert_source, ALERT_WHITELIST,
                                                rule_based_multipliers,
                                                ForecastAdjustment)


def _band(hours: int = 24) -> pd.DataFrame:
    idx = pd.date_range("2026-06-01", periods=hours, freq="h", tz="America/Bogota")
    return pd.DataFrame({"P10": np.full(hours, 10.0),
                         "P50": np.full(hours, 15.0),
                         "P90": np.full(hours, 20.0)}, index=idx)


def test_whitelist():
    assert check_alert_source("IDEAM")
    assert check_alert_source("ideam")
    assert not check_alert_source("facebook")


def test_rechaza_fuente_no_confiable():
    with pytest.raises(ValueError, match="Whitelist"):
        adjust_forecast_with_alert(_band(), "twitter", "fuerte", "fake")


def test_fallback_rule_based_derating():
    out = adjust_forecast_with_alert(_band(), "IDEAM", "fuerte", "tormenta")
    assert (out["P50"] == 15.0 * 0.70).all()
    assert (out >= 0).all().all()


def test_llm_valid_json():
    band = _band(24)
    out = adjust_forecast_with_alert(
        band, "IDEAM", "moderada", "lluvia esperada",
        llm_fn=lambda p: json.dumps({
            "source": "IDEAM", "severity": "moderada",
            "reason": "lluvia esperada",
            "multipliers": [0.85] * 24}))
    assert (out["P50"] == 15.0 * 0.85).all()


def test_llm_mal_json_cae_a_fallback():
    band = _band(24)
    out = adjust_forecast_with_alert(
        band, "IDEAM", "extrema", "granizo",
        llm_fn=lambda p: "esto no es json")
    assert (out["P50"] == 15.0 * 0.55).all()  # fallback extrema


def test_esquema_pydantic_validacion():
    ok = ForecastAdjustment(source="IDEAM", severity="fuerte",
                            reason="tormenta", multipliers=[0.7, 0.7])
    assert ok.multipliers == [0.7, 0.7]
    with pytest.raises(Exception):
        ForecastAdjustment(source="IDEAM", severity="fuerte",
                           reason="tormenta", multipliers=[3.0])
