# -*- coding: utf-8 -*-
"""Cambio 12.3 — device_echo: cubre todos los dispositivos, ninguno ausente.
estado en {modelado, ignorado, error}; si no es modelado, motivo obligatorio.
"""
from __future__ import annotations

import copy

from optimization.solver.model_builder import build_and_solve
from optimization.tests.test_solver import BASE_JOB

DEVICES_6 = [
    {"id": "solar_1", "tipo": "solar_panel"},
    {"id": "diesel_1", "tipo": "diesel_generator"},
    {"id": "grid_1", "tipo": "grid"},
    {"id": "battery_1", "tipo": "battery"},
    {"id": "load_1", "tipo": "load"},
    {"id": "inv_1", "tipo": "inverter"},
]


def _job(fuel_cost=3000.0):
    job = copy.deepcopy(BASE_JOB)
    job["site_id"] = "pasto_narino"
    job["devices"] = copy.deepcopy(DEVICES_6)
    for s in job["sources"]:
        if s.get("type") == "diesel":
            s["fuel_cost"] = fuel_cost
    return job


def test_echo_cubre_todos():
    out = build_and_solve(_job())
    assert out["status"] == "optimal"
    echo = out["device_echo"]
    assert len(echo) == 6, f"eco incompleto: {len(echo)}"
    assert {e["device_id"] for e in echo} == {d["id"] for d in DEVICES_6}
    for e in echo:
        assert e["estado"] in ("modelado", "ignorado", "error")
        if e["estado"] != "modelado":
            assert e.get("motivo"), f"{e['device_id']}: sin motivo"


def test_echo_diesel_efectivo_y_origen_nodo():
    out = build_and_solve(_job(fuel_cost=3000.0))
    d = next(e for e in out["device_echo"] if e["device_id"] == "diesel_1")
    assert d["estado"] == "modelado"
    assert d["params_efectivos"]["fuel_cost"] == 3000.0
    assert d["params_efectivos"]["fuel_origen"] == "nodo"


def test_echo_diesel_origen_sitio():
    job = _job()
    for s in job["sources"]:
        if s.get("type") == "diesel":
            s.pop("fuel_cost", None)
    out = build_and_solve(job)
    d = next(e for e in out["device_echo"] if e["device_id"] == "diesel_1")
    assert d["params_efectivos"]["fuel_cost"] == 2782.0
    assert d["params_efectivos"]["fuel_origen"] == "sitio"


def test_echo_inverter_ignorado_con_motivo():
    out = build_and_solve(_job())
    inv = next(e for e in out["device_echo"] if e["device_id"] == "inv_1")
    assert inv["estado"] == "ignorado"
    assert inv["motivo"]


def test_echo_sin_devices_retrocompatible():
    out = build_and_solve(dict(BASE_JOB))
    assert out["status"] == "optimal"
    assert len(out["device_echo"]) > 0
    assert all(e["estado"] == "modelado" for e in out["device_echo"])
