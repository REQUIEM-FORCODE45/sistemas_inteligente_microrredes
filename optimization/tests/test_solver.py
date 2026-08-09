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


def test_solve_wind_separado_de_solar():
    """El viento entra al balance y al dispatch como tipo propio 'wind'.

    Regresion: antes el viento se ignoraba (sin dispatch) y en el pipeline
    Node se mezclaba con solar; aqui debe salir device_type 'wind' y la curva
    solar NO debe contener los kW eolicos.
    """
    job = dict(BASE_JOB)
    job["sources"] = BASE_JOB["sources"] + [
        {"id": "wind_1", "type": "wind", "max_kw": 60, "min_kw": 0,
         "efficiency": 0.4, "cost_a": 0, "cost_b": 0, "cost_c": 0,
         "fuel_cost": 0},
    ]
    # solar pequena (2 kW P50) + viento real (15 kW P50)
    job["predictions_pv_kw"] = [2.0] * 8
    job.pop("predictions_pv_band", None)
    job["predictions_solar"] = []
    job["predictions_wind_kw"] = [15.0] * 8
    out = build_and_solve(job)
    assert out["status"] == "optimal"

    types = {d["device_type"] for d in out["dispatch_plan"]}
    assert "wind" in types
    wind = [d for d in out["dispatch_plan"] if d["device_type"] == "wind"]
    assert len(wind) > 0
    # la curva eolica usa la prediccion del viento (P50 15 kW * factor_wind)
    assert max(d["power_kw"] for d in wind) > 5.0
    # solar NO debe absorber el viento: su pico queda ~2 kW
    solar = [d for d in out["dispatch_plan"] if d["device_type"] == "solar"]
    assert max(d["power_kw"] for d in solar) <= 2.5


def test_solve_wind_factor_por_escenario():
    """factor_wind por escenario: en Lluvia el viento se castiga (0.7)."""
    job = dict(BASE_JOB)
    job["sources"] = BASE_JOB["sources"] + [
        {"id": "wind_1", "type": "wind", "max_kw": 60, "min_kw": 0,
         "efficiency": 0.4, "cost_a": 0, "cost_b": 0, "cost_c": 0,
         "fuel_cost": 0},
    ]
    job["predictions_pv_kw"] = [2.0] * 8
    job.pop("predictions_pv_band", None)
    job["predictions_solar"] = []
    job["predictions_wind_kw"] = [10.0] * 8
    out = build_and_solve(job)
    assert out["status"] == "optimal"

    wind = [d for d in out["dispatch_plan"] if d["device_type"] == "wind"]
    # Lluvia (0.7 * 10 = 7 kW) < Soleado (1.0 * 10 = 10 kW)
    lluvia = [d for d in wind if d["scenario"] == "Lluvia"]
    soleado = [d for d in wind if d["scenario"] == "Soleado"]
    assert lluvia and soleado
    assert max(d["power_kw"] for d in lluvia) < max(d["power_kw"] for d in soleado)


def test_solve_dispatch_solar_wind_cubren_todas_las_horas():
    """Regresion: solar/wind emiten TODAS las horas del horizonte (con 0.0
    explicito cuando no generan), para que los graficos no queden con huecos."""
    job = dict(BASE_JOB)
    job["sources"] = BASE_JOB["sources"] + [
        {"id": "wind_1", "type": "wind", "max_kw": 60, "min_kw": 0,
         "efficiency": 0.4, "cost_a": 0, "cost_b": 0, "cost_c": 0,
         "fuel_cost": 0},
    ]
    job["predictions_pv_kw"] = [0.0] * 8   # sin sol en todo el horizonte
    job.pop("predictions_pv_band", None)
    job["predictions_solar"] = []
    job["predictions_wind_kw"] = [0.0] * 8  # sin viento util en todo el horizonte
    out = build_and_solve(job)
    assert out["status"] == "optimal"

    horizon = 8
    for dev_type in ("solar", "wind"):
        entries = [d for d in out["dispatch_plan"]
                   if d["device_type"] == dev_type and d["scenario"] == "Soleado"]
        assert len(entries) == horizon, f"{dev_type} debe cubrir las {horizon}h"
        assert entries[0]["power_kw"] == 0.0, f"{dev_type} con cero explicito"


def test_solve_sin_fuentes_ignora_predicciones():
    """COHERENCIA: sin dispositivos solares/eolicos en la topologia, el
    balance NO usa las predicciones PV/wind aunque el cliente las envie
    (el solver se apoya solo en diesel+grid+storage)."""
    job = dict(BASE_JOB)
    # elimina los sources (solo queda diesel? no: se quita TODO source solar)
    job["sources"] = [
        {"id": "diesel_1", "type": "diesel", "max_kw": 300, "min_kw": 50,
         "efficiency": 1.0, "cost_a": 0.001, "cost_b": 0.5, "cost_c": 0.5,
         "fuel_cost": 100},
    ]
    # predicciones PV/wind presentes pero NO debe usarlas (no hay fuentes)
    job["predictions_pv_band"] = [{"P10": 100.0, "P50": 300.0, "P90": 500.0}] * 8
    job["predictions_wind_band"] = [{"P10": 50.0, "P50": 120.0, "P90": 200.0}] * 8
    job["predictions_solar"] = []
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    # sin PV/wind, la carga 10 kW la cubren diesel (>=50) + grid -> debe bastar
    solar_entries = [d for d in out["dispatch_plan"] if d["device_type"] == "solar"]
    wind_entries = [d for d in out["dispatch_plan"] if d["device_type"] == "wind"]
    assert len(solar_entries) == 0, "no debe emitir solar sin dispositivos"
    assert len(wind_entries) == 0, "no debe emitir wind sin dispositivos"
