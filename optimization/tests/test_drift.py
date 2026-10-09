# -*- coding: utf-8 -*-
"""Tests del detector de drift (Fase 6) — hermet, sin red."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.monitoring.drift import detect_drift, rolling_rmse, simulated_monitoring


def _positive_series(days: int = 45) -> pd.Series:
    idx = pd.date_range("2026-01-01", periods=days * 24, freq="h", tz="America/Bogota")
    x = np.arange(days * 24)
    return pd.Series(10 + 7.5 * (1 + np.sin(x / 24 * 2 * np.pi)), index=idx)


def test_rolling_rmse_forma():
    pred = _positive_series(10)
    rng = np.random.default_rng(0)
    meas = pred + rng.normal(0, 0.5, len(pred))
    rm = rolling_rmse(pred, meas, window_h=48)
    assert len(rm) == len(pred)
    assert 0.4 < rm.iloc[-1] < 0.7


def test_detect_drift_sin_deriva():
    pred = _positive_series()
    rng = np.random.default_rng(1)
    meas = pred + rng.normal(0, 0.5, len(pred))
    st = detect_drift(pred, meas, baseline_rmse_kw=0.6)
    assert st.drift is False
    assert st.ratio < 1.0


def test_detect_drift_con_deriva():
    pred = _positive_series()
    st = simulated_monitoring(pred, drift_after_h=24 * 5, noise=0.5,
                              drift_scale=3.0, baseline_rmse_kw=0.6)
    assert st.drift is True
    assert st.ratio > 2.0
    assert st.history  # serie de RMSE para graficar


def test_insuficientes_muestras():
    idx = pd.date_range("2026-01-01", periods=23, freq="h", tz="America/Bogota")
    pred = pd.Series(np.full(23, 10.0), index=idx)
    meas = pred + 0.1
    st = detect_drift(pred, meas, baseline_rmse_kw=0.6)
    assert st.drift is False
    assert st.n_samples < 24


# --------------------------------------------------------------------------- #
# Cambio 09 — ciclo de vida (stale por edad, registro append-only)
# --------------------------------------------------------------------------- #
from types import SimpleNamespace


def _fake_model(days_old=None):
    from datetime import datetime, timedelta, timezone
    at = ((datetime.now(timezone.utc) - timedelta(days=days_old)).isoformat()
          if days_old is not None else None)
    return SimpleNamespace(params={"losses_pct": 14.0}, k=0.9,
                           conformal_radius_kw=1.0, band_q=None,
                           calibrated_at=at, baseline_rmse_kw=0.4,
                           meta={})


def test_stale_por_edad():
    from optimization.calibration.service import _summary_of
    import os
    os.environ.pop("CALIBRATION_MAX_AGE_DAYS", None)
    assert _summary_of(_fake_model(60))["stale"] is True
    assert _summary_of(_fake_model(5))["stale"] is False
    assert _summary_of(_fake_model(None))["stale"] is None


def test_max_age_default_30():
    from optimization.monitoring.calibration_lifecycle import max_age_days
    import os
    os.environ.pop("CALIBRATION_MAX_AGE_DAYS", None)
    assert max_age_days() == 30.0
    os.environ["CALIBRATION_MAX_AGE_DAYS"] = "45"
    assert max_age_days() == 45.0
    del os.environ["CALIBRATION_MAX_AGE_DAYS"]


def test_registro_append_only(tmp_path, monkeypatch):
    import optimization.monitoring.calibration_lifecycle as lc
    monkeypatch.setattr(lc, "HISTORY_DIR", str(tmp_path))
    e1 = lc.registrar_evento("s1", "manual", rmse_despues=0.4, n_horas=100,
                             artifact_path=None)
    e2 = lc.registrar_evento("s1", "age", rmse_despues=0.5, n_horas=120,
                             artifact_path=None)
    lines = (tmp_path / "s1.jsonl").read_text().strip().split("\n")
    assert len(lines) == 2
    assert e1["motivo"] == "manual" and e2["motivo"] == "age"


def test_should_recalibrate_missing():
    from optimization.monitoring.calibration_lifecycle import should_recalibrate
    r = should_recalibrate("sensor_inexistente_xyz")
    assert r["recalibrar"] is True and r["motivo"] == "missing"
