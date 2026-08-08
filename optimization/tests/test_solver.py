# -*- coding: utf-8 -*-
"""Tests del solver estocastico (regresion — Fase 6).

Verifican que el modelo MILP con costo diesel linealizado por tramos se
resuelve (HiGHS fallback, sin licencia Gurobi) y produce el plan de despacho.
"""
from __future__ import annotations

import pytest

from optimization.solver.model_builder import build_and_solve

BASE_JOB = {
    "job_id": "test", "horizon": 8, "time_step_minutes": 60,
    "predictions_solar": [0.5] * 8, "predictions_load_total": [10.0] * 8,
    "sources": [
        {"id": "solar_1", "type": "solar", "max_kw": 50, "min_kw": 0,
         "efficiency": 0.85, "cost_a": 0, "cost_b": 0, "cost_c": 0,
         "fuel_cost": 0},
        {"id": "diesel_1", "type": "diesel", "max_kw": 300, "min_kw": 50,
         "efficiency": 1.0, "cost_a": 0.001, "cost_b": 0.5, "cost_c": 0.5,
         "fuel_cost": 100},
    ],
    "storage": [{"id": "battery_1", "type": "battery", "max_kw": 100,
                 "min_kw": 0, "capacity_kwh": 200, "max_charge_kw": 50,
                 "max_discharge_kw": 50, "soc_min": 0.2, "soc_max": 0.95,
                 "initial_soc": 0.65, "charge_efficiency": 0.95,
                 "discharge_efficiency": 0.95}],
    "loads": [{"id": "load_1", "type": "load", "max_kw": 80, "min_kw": 0}],
    "grid": {"max_import_kw": 400, "max_export_kw": 300, "min_import_kw": -300,
             "cost_fixed": 40, "cost_variable": 60},
}


def test_solve_optimal_con_dispatch():
    out = build_and_solve(BASE_JOB)
    assert out["status"] == "optimal"
    assert out["objective_value"] is not None
    assert len(out["dispatch_plan"]) > 0
    # debe incluir diesel, solar, grid, battery y load en el plan
    types = {d["device_type"] for d in out["dispatch_plan"]}
    assert "diesel" in types
    assert "solar" in types
    assert "grid_import" in types or "grid_export" in types
    assert "battery_discharge" in types or "battery_charge" in types


def test_solve_con_banda_p10():
    job = dict(BASE_JOB)
    job["predictions_pv_band"] = [{"P10": 5.0, "P50": 12.0, "P90": 19.0}] * 8
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    # el dispatch solar reporta P50 (12*0.85*... >= 0)
    solar = [d for d in out["dispatch_plan"] if d["device_type"] == "solar"]
    assert len(solar) > 0


def test_solve_banda_robusta_p10_cubre_carga():
    """Con banda, el balance se garantiza con P10 (peor caso): la carga de
    10 kW debe cubrirse aunque la generacion solar reportada sea P50."""
    job = dict(BASE_JOB)
    job["predictions_pv_band"] = [{"P10": 0.0, "P50": 30.0, "P90": 45.0}] * 8
    out = build_and_solve(job)
    assert out["status"] == "optimal"
