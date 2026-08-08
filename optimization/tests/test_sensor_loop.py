# -*- coding: utf-8 -*-
"""Tests del bucle: servicio de calibracion por sensor + predictor (Opcion A).

Hermeticos: sensor sintetico (monkeypatch de read_sensor_series) y clima
sintetico (monkeypatch de OpenMeteoClient). Sin red ni Mongo.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization import calibration as cal_mod
from optimization import prediction as pred_mod
from optimization.calibration import service as svc
from optimization.prediction import sensor_predictor as sp


def fake_climate(days: int = 40, tz="America/Bogota") -> pd.DataFrame:
    idx = pd.date_range("2026-03-01", periods=days * 24, freq="h", tz=tz)
    hour = idx.hour.to_numpy()
    c = pd.DataFrame(index=idx)
    ghi = np.maximum(0, np.sin(hour / 24 * 2 * np.pi)) * 800
    c["shortwave_radiation"] = ghi
    c["direct_normal_irradiance"] = ghi * 0.75
    c["diffuse_radiation"] = ghi * 0.25
    c["temperature_2m"] = 18 + 6 * np.sin(hour / 24 * 2 * np.pi)
    c["relative_humidity_2m"] = 70.0
    c["cloud_cover"] = 40.0
    c["wind_speed_100m"] = 2.0
    c["wind_speed_10m"] = 1.0
    c["surface_pressure"] = 757.0
    c["precipitation"] = 0.0
    return c


class FakeOpenMeteo:
    def __init__(self, *a, **k):
        self.climate = fake_climate()

    def fetch_archive(self, start, end):
        return self.climate

    def fetch_forecast(self, *a, **k):
        return self.climate.iloc[-72:]


class FakeProvider:
    provider_name = "openmeteo_nwp"

    def __init__(self, *a, **k):
        pass

    def forecast(self, days=1.0):
        df = fake_climate(3)
        horizon = int(days * 24)
        from optimization.prediction.forecaster import ClimateForecast
        return ClimateForecast(data=df.iloc[:horizon], horizon_h=horizon,
                               provider=self.provider_name)


def make_sensor_series(sensor_type: str, n_days: int = 30) -> pd.DataFrame:
    """Serie de sensor sintetica (horaria) segun tipo."""
    idx = pd.date_range("2026-03-01", periods=n_days * 24, freq="h",
                        tz="America/Bogota")
    hour = idx.hour.to_numpy()
    if sensor_type == "load":
        base = 6 + 4 * np.exp(-((hour - 7) ** 2) / 2) + 5 * np.exp(-((hour - 19) ** 2) / 2)
        return pd.DataFrame({"power_kw": base + np.random.default_rng(1).normal(0, 0.3, len(idx))},
                            index=idx)
    if sensor_type == "solar":
        ghi = np.maximum(0, np.sin(hour / 24 * 2 * np.pi)) * 800
        return pd.DataFrame({"power_kw": ghi * 0.02 + 0.5}, index=idx)
    raise ValueError(sensor_type)


@pytest.fixture()
def patched(monkeypatch, tmp_path):
    monkeypatch.setattr(svc, "read_sensor_series",
                        lambda sid, cols, max_days=30: make_sensor_series(
                            "load" if sid.endswith("_load") else "solar"))
    monkeypatch.setattr(svc, "OpenMeteoClient", FakeOpenMeteo)
    monkeypatch.setattr(svc, "ARTIFACT_DIR", str(tmp_path))
    monkeypatch.setattr(sp, "get_climate_provider",
                        lambda cfg, name=None: FakeProvider())
    return tmp_path


def test_fit_and_predict_load(patched, tmp_path):
    r = svc.fit_from_sensor("pasto_narino", "t_load", "load")
    assert r["status"] == "ok" and r["cached"] is False
    assert svc.is_calibrated("t_load")

    r2 = svc.fit_from_sensor("pasto_narino", "t_load", "load")
    assert r2["cached"] is True  # auto-solo-si-falta

    p = sp.predict_sensor("pasto_narino", "t_load", "load", hours=24)
    assert len(p["values"]) == 24
    assert all(v["P50"] > 0 for v in p["values"])


def test_fit_solar_cascada(patched, tmp_path):
    """El ajuste solar corre la cascada N1/N2 y guarda el artefacto."""
    r = svc.fit_from_sensor("pasto_narino", "t_solar", "solar")
    assert r["status"] == "ok"
    assert 0.0 < r["summary"]["k"] <= 1.5
    assert r["summary"]["params"]["losses_pct"] >= 0


def test_predict_wind_zero(tmp_path):
    """Viento sin senal: prediccion honesta de 0."""
    model = {"type": "wind", "zero": True, "meta": {}}
    path = tmp_path / "t_wind_zero.pkl"
    import pickle
    with open(path, "wb") as fh:
        pickle.dump(model, fh)
    svc.ARTIFACT_DIR = str(tmp_path)
    from optimization.prediction import sensor_predictor as _sp
    _sp.get_climate_provider = lambda cfg, name=None: FakeProvider()
    p = _sp.predict_sensor("pasto_narino", "t_wind_zero", "wind", hours=12)
    assert all(v["P50"] == 0.0 for v in p["values"])


def test_rutas_ancladas_al_repo_independientes_del_cwd():
    """Regresion del bug: con cwd=optimization/ las rutas siguen en el repo."""
    import os
    import subprocess
    import sys
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    code = (
        "from optimization.calibration import service as s;"
        "from optimization.prediction import power_forecast as pf;"
        "import os;"
        f"assert s.ARTIFACT_DIR == os.path.join('{repo}', 'results', 'pasto_narino', 'calibrated'), s.ARTIFACT_DIR;"
        f"assert pf.DEFAULT_PLK == os.path.join('{repo}', 'results', 'pasto_narino', 'calibration', 'planta_calibrada_default.pkl'), pf.DEFAULT_PLK;"
        "print('RUTAS_OK')"
    )
    # corre el codigo con cwd=optimization/ (el escenario del bug)
    env = {**os.environ, "PYTHONPATH": repo}
    res = subprocess.run([sys.executable, "-c", code], capture_output=True,
                         text=True, cwd=os.path.join(repo, "optimization"),
                         env=env)
    assert res.returncode == 0, res.stderr
    assert "RUTAS_OK" in res.stdout


def test_predict_sensor_autocalibra(monkeypatch, tmp_path):
    """Self-healing: /predict/sensor calibra si el sensor no tiene modelo."""
    import pickle
    monkeypatch.setattr(svc, "ARTIFACT_DIR", str(tmp_path))
    monkeypatch.setattr(svc, "is_calibrated", lambda sid: False)

    def fake_fit(site, sid, typ, force=False):
        model = {"type": "load", "sensor_id": sid,
                 "profile_kw": {h: 5.0 for h in range(24)},
                 "q10": -0.5, "q90": 0.5, "n_muestras": 100}
        with open(svc.artifact_path(sid), "wb") as fh:
            pickle.dump(model, fh)
        return {"status": "ok"}

    monkeypatch.setattr(svc, "fit_from_sensor", fake_fit)
    monkeypatch.setattr(sp, "get_climate_provider", lambda cfg, name=None: FakeProvider())

    from fastapi.testclient import TestClient
    from optimization.prediction.main import app
    c = TestClient(app)
    r = c.get("/predict/sensor", params={"sensor_id": "t_sensor",
                                         "type": "load", "hours": 6})
    j = r.json()
    assert j.get("status") != "error", j.get("error")
    assert j.get("calibrated_now") is True
    # horizonte minimo del provider = 24h
    assert len(j.get("values", [])) == 24
    assert all(v["P50"] == 5.0 for v in j["values"])
