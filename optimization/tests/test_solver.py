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


# --------------------------------------------------------------------------- #
# Cambio 08 — fisica del MPC de produccion
# --------------------------------------------------------------------------- #

def _diesel_series(out, scenario="Soleado"):
    return [d["power_kw"] for d in out["dispatch_plan"]
            if d["device_type"] == "diesel" and d["scenario"] == scenario]


def test_08_rampa_respeta_limite():
    """Con rampa declarada, el diesel no salta mas de ramp_kw_per_h."""
    import copy
    job = copy.deepcopy(BASE_JOB)
    job["sources"][1]["ramp_kw_per_h"] = 25
    # demanda con salto que exigiria 0->300 sin rampa
    job["predictions_load_total"] = [10.0] * 4 + [400.0] * 4
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    seq = _diesel_series(out)
    print("P_diesel:", [round(v, 1) for v in seq])
    # convencion: 0 -> minimo tecnico permitido (arranque); la rampa se exige
    # entre dos periodos encendidos (ambos > 0).
    salta = [abs(seq[t] - seq[t - 1]) for t in range(1, len(seq))
             if seq[t] > 0.001 and seq[t - 1] > 0.001]
    assert max(salta) <= 25.0 + 1e-3, f"salto maximo {max(salta)} > rampa 25"
    assert all("rampa" not in w for w in out["warnings"])


def test_08_rampa_no_declarada_warning():
    out = build_and_solve(dict(BASE_JOB))
    assert out["status"] == "optimal"
    assert any("rampa no declarada" in w for w in out["warnings"])


def test_08_exclusion_con_tarifa():
    """Con export_tariff > 0, ninguna hora importa Y exporta a la vez."""
    import copy
    job = copy.deepcopy(BASE_JOB)
    job["grid"] = dict(BASE_JOB["grid"], export_tariff=50.0)
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    by_hour = {}
    for d in out["dispatch_plan"]:
        if d["scenario"] != "Soleado":
            continue
        by_hour.setdefault(d["hour"], {})[d["device_type"]] = d["power_kw"]
    for h, v in by_hour.items():
        assert not (v.get("grid_import", 0) > 0.01
                    and v.get("grid_export", 0) > 0.01), f"hora {h}: coexisten"


def test_08_sin_tarifa_sin_ugrid():
    import copy
    out = build_and_solve(dict(BASE_JOB))
    assert out["status"] == "optimal"
    # BASE_JOB declara max_export_kw: 300 -> precedencia declarada
    assert out["grid_limits"] == {"max_import": 400.0, "max_export": 300.0,
                                  "source": "max_export_kw"}
    # sin max_export_kw -> fallback a -min_import_kw
    job = copy.deepcopy(BASE_JOB)
    job["grid"] = {k: v for k, v in BASE_JOB["grid"].items()
                   if k != "max_export_kw"}
    out2 = build_and_solve(job)
    assert out2["status"] == "optimal"
    assert out2["grid_limits"] == {"max_import": 400.0, "max_export": 300.0,
                                   "source": "min_import_kw"}


def test_08_cargo_fijo_reportado():
    """cost_fixed=40, horizonte 8h -> 320 COP por escenario, etiquetado."""
    out = build_and_solve(dict(BASE_JOB))
    assert out["status"] == "optimal"
    n_sc = len({d["scenario"] for d in out["dispatch_plan"]})
    assert out["cost_breakdown"]["fixed_total"] == 40 * 8 * n_sc
    assert out["cost_breakdown"]["fixed_source"] == "cost_fixed"
    assert all(e["fixed"] == 40 for e in out["cost_breakdown"]["hourly"])
    assert out["cost_fixed_applied"] == {"valor_hora": 40.0, "fuente": "cost_fixed"}


def test_08_max_export_precedencia():
    import copy
    job = copy.deepcopy(BASE_JOB)
    job["grid"] = dict(BASE_JOB["grid"], max_export_kw=100, min_import_kw=-300)
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    assert out["grid_limits"] == {"max_import": 400.0, "max_export": 100.0,
                                  "source": "max_export_kw"}


# --------------------------------------------------------------------------- #
# Cambio 08.4 — transitorios del generador (continuas, cero binarias nuevas)
# --------------------------------------------------------------------------- #

def _starts(out, scenario="Soleado"):
    seq = [d["power_kw"] for d in out["dispatch_plan"]
           if d["device_type"] == "diesel" and d["scenario"] == scenario]
    return sum(1 for i in range(1, len(seq))
               if seq[i] > 0.001 and seq[i - 1] <= 0.001)


def test_084_sin_declarar_warning_y_sin_limite():
    out = build_and_solve(dict(BASE_JOB))
    assert out["status"] == "optimal"
    assert any("start_cost no declarado" in w for w in out["warnings"])


def test_084_penalizacion_reduce_arranques():
    """Con start_cost alto el solver evita ciclar (4 -> 0 arranques)."""
    import copy
    base = copy.deepcopy(BASE_JOB)
    base["predictions_load_total"] = [10.0, 300.0] * 4
    o0 = build_and_solve(copy.deepcopy(base))
    assert o0["status"] == "optimal"
    hi = copy.deepcopy(base)
    hi["sources"][1]["start_cost"] = 1e7
    o1 = build_and_solve(hi)
    assert o1["status"] == "optimal"
    assert _starts(o1) <= _starts(o0)
    assert _starts(o0) >= 2  # el caso base cicla de verdad
    assert all("start_cost" not in w for w in o1["warnings"])
    print(f"arranques: { _starts(o0)} -> {_starts(o1)}")


def test_084_sin_binarias_nuevas():
    """S/D son continuas: el conteo de binarias no crece al penalizar."""
    import copy
    from optimization.solver.model_builder import _build_pyomo_model, build_scenarios
    import pyomo.environ as pyo
    base = copy.deepcopy(BASE_JOB)
    kw = dict(horizon=8, time_step=60, predictions_solar=base["predictions_solar"],
              predictions_load_total=base["predictions_load_total"],
              sources=base["sources"], storage_list=base["storage"],
              loads=base["loads"], grid_raw=base["grid"])
    sc = build_scenarios(None)
    m0, _ = _build_pyomo_model(scenarios=sc, s_ids=list(range(len(sc))), **kw)
    n0 = sum(1 for _ in m0.component_data_objects(pyo.Var, active=True)
             if _.is_binary())
    kw["sources"] = copy.deepcopy(base["sources"])
    kw["sources"][1]["start_cost"] = 5000
    m1, _ = _build_pyomo_model(scenarios=sc, s_ids=list(range(len(sc))), **kw)
    n1 = sum(1 for _ in m1.component_data_objects(pyo.Var, active=True)
             if _.is_binary())
    assert n1 == n0, f"binarias {n0} -> {n1}: la penalizacion no debe anadir"
    assert m1.find_component("diesel_start") is not None
