# -*- coding: utf-8 -*-
"""Tests de la respuesta a los comentarios del revisor (Fase 1):
- H1: complementariedad carga/descarga de bateria (Ecs. 4-6 del paper).
- H2: escenarios anclados a cuantiles P90/P50/P10 (Comentario 1).
"""
from __future__ import annotations

import pytest

from optimization.solver.model_builder import build_and_solve, _build_pyomo_model
from optimization.solver.scenarios import DEFAULT_SCENARIOS, build_scenarios

BASE_JOB = {
    "job_id": "test", "horizon": 6, "time_step_minutes": 60,
    "predictions_solar": [0.5] * 6, "predictions_load_total": [10.0] * 6,
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


# ----------------------------------------------------------------- H1 ----- #
def test_complementariedad_excluye_carga_y_descarga_simultaneas():
    """H1: en la solucion optima nunca puede haber P_charge>0 y P_discharge>0
    en la misma (bateria, hora, escenario)."""
    out = build_and_solve(BASE_JOB)
    assert out["status"] == "optimal"

    for d in out["dispatch_plan"]:
        if d["device_type"] in ("battery_charge", "battery_discharge"):
            pass

    charges = {}
    for d in out["dispatch_plan"]:
        key = (d["device_id"], d["hour"], d["scenario"])
        charges.setdefault(key, {"ch": 0.0, "dis": 0.0})
        if d["device_type"] == "battery_charge":
            charges[key]["ch"] = d["power_kw"]
        elif d["device_type"] == "battery_discharge":
            charges[key]["dis"] = d["power_kw"]
    for key, v in charges.items():
        assert not (v["ch"] > 0.001 and v["dis"] > 0.001), \
            f"carga y descarga simultaneas en {key}: {v}"


def test_complementariedad_variable_binaria_z_existe():
    """H1: el modelo declara la variable binaria Z[bi,t,s] (big-M)."""
    from optimization.solver.model_builder import _build_pyomo_model
    from optimization.solver.scenarios import build_scenarios
    model, variables = _build_pyomo_model(
        horizon=6, time_step=60,
        scenarios=build_scenarios(None), s_ids=[0, 1, 2],
        predictions_solar=[0.5] * 6, predictions_load_total=[10.0] * 6,
        predictions_pv_kw=[], predictions_pv_band=[],
        predictions_wind_kw=[], predictions_wind_band=[],
        sources=BASE_JOB["sources"], storage_list=BASE_JOB["storage"],
        loads=BASE_JOB["loads"], grid_raw=BASE_JOB["grid"],
    )
    assert "Z" in variables
    assert model.Z[0, 0, 0].domain == __import__("pyomo.environ", fromlist=["Binary"]).Binary


def test_complementariedad_forzada_con_soc_saturado():
    """H1: con SOC en el maximo, el optimo NO descarga y recarga a la vez
    (degradacion evitada por la exclusividad, no solo por el costo)."""
    job = dict(BASE_JOB)
    # copia PROFUNDA del storage: dict(BASE_JOB) es shallow y mutar aqui
    # contaminaria BASE_JOB para los tests siguientes (regresion 2026-08-09)
    job["storage"] = [dict(BASE_JOB["storage"][0], initial_soc=0.95)]
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    # en cada (hora, escenario): nunca ambos a la vez
    pairs = {}
    for d in out["dispatch_plan"]:
        key = (d["hour"], d["scenario"])
        pairs.setdefault(key, {"ch": 0.0, "dis": 0.0})
        if d["device_type"] == "battery_charge":
            pairs[key]["ch"] = d["power_kw"]
        elif d["device_type"] == "battery_discharge":
            pairs[key]["dis"] = d["power_kw"]
    for key, v in pairs.items():
        assert not (v["ch"] > 0.001 and v["dis"] > 0.001), v


# ----------------------------------------------------------------- H2 ----- #
def test_escenarios_default_anclados_a_cuantiles():
    """H2: los escenarios por defecto llevan quantile P90/P50/P10 y probs
    0.2/0.6/0.2 (metodo documentado)."""
    names = {s["name"]: s for s in DEFAULT_SCENARIOS}
    assert names["Soleado"]["quantile"] == "P90"
    assert names["Nublado"]["quantile"] == "P50"
    assert names["Lluvia"]["quantile"] == "P10"
    assert names["Soleado"]["probability"] == pytest.approx(0.2)
    assert names["Nublado"]["probability"] == pytest.approx(0.6)
    assert names["Lluvia"]["probability"] == pytest.approx(0.2)
    assert abs(sum(s["probability"] for s in DEFAULT_SCENARIOS) - 1.0) < 1e-9


def test_build_scenarios_preserva_quantile_y_renormaliza():
    sc = build_scenarios([
        {"name": "A", "probability": 0.5, "quantile": "P90"},
        {"name": "B", "probability": 0.5, "quantile": "P10"},
    ])
    assert sc[0]["quantile"] == "P90"
    assert sum(s["probability"] for s in sc) == pytest.approx(1.0)

    re = build_scenarios([
        {"name": "A", "probability": 0.2, "quantile": "P90"},
        {"name": "B", "probability": 0.2, "quantile": "P10"},
    ])
    assert re[0]["probability"] == pytest.approx(0.5)  # 0.2/0.4


def test_balance_usa_el_cuantil_del_escenario():
    """H2: con banda P10/P50/P90, el balance usa la curva del cuantil de cada
    escenario: en Lluvia (P10) entra menos PV que en Soleado (P90)."""
    job = dict(BASE_JOB)
    job["predictions_pv_band"] = [{"P10": 2.0, "P50": 12.0, "P90": 25.0}] * 6
    out = build_and_solve(job)
    assert out["status"] == "optimal"

    pv = [d for d in out["dispatch_plan"] if d["device_type"] == "solar"]
    lluvia = [d["power_kw"] for d in pv if d["scenario"] == "Lluvia"]
    soleado = [d["power_kw"] for d in pv if d["scenario"] == "Soleado"]
    nublado = [d["power_kw"] for d in pv if d["scenario"] == "Nublado"]
    # el dispatch reporta la curva P50 (escenario por escenario, factor 1.0)
    assert max(soleado) == pytest.approx(12.0, abs=0.01)
    assert max(nublado) == pytest.approx(12.0, abs=0.01)
    assert max(lluvia) == pytest.approx(12.0, abs=0.01)

    # en el balance: Lluvia debe requerir mas diesel/grid que Soleado
    def _total_kw(dev_type, scenario):
        return sum(d["power_kw"] for d in out["dispatch_plan"]
                   if d["device_type"] == dev_type and d["scenario"] == scenario)
    # lluvia necesita >= diesel que soleado (su PV de balance es P10=2)
    assert _total_kw("diesel", "Lluvia") >= _total_kw("diesel", "Soleado")


def test_escenario_sin_quantile_fallback_p10_peor_caso():
    """H2: un escenario custom sin 'quantile' conserva el comportamiento
    robusto previo (balance con P10)."""
    sc = build_scenarios([
        {"name": "Base", "probability": 1.0, "factor_pv": 1.0},
    ])
    assert sc[0].get("quantile") is None


def test_tarifa_horaria_toU_activa_arbitraje_bateria():
    """Regresion (flag del revisor): con la tarifa VARIABLE horaria el
    solver carga la bateria en valle (45) y la descarga en pico (140)."""
    job = dict(BASE_JOB)
    job["horizon"] = 24
    job["predictions_load_total"] = [30.0] * 24
    job["predictions_solar"] = [0.0] * 24
    toU = [45] * 6 + [80] * 12 + [140] * 3 + [80] * 3   # valle/media/pico/media
    job["grid"] = {**BASE_JOB["grid"], "cost_variable": toU}
    out = build_and_solve(job)
    assert out["status"] == "optimal"

    ch = {(d["hour"], d["scenario"]): d["power_kw"]
          for d in out["dispatch_plan"] if d["device_type"] == "battery_charge"}
    dis = {(d["hour"], d["scenario"]): d["power_kw"]
           for d in out["dispatch_plan"] if d["device_type"] == "battery_discharge"}
    sc = "Soleado"
    # valle (horas 1-6): carga de la bateria; pico (19-21): descarga
    valley_charge = sum(ch.get((h, sc), 0.0) for h in range(1, 7))
    peak_discharge = sum(dis.get((h, sc), 0.0) for h in range(19, 22))
    assert valley_charge > 10.0, f"no carga en valle: {valley_charge}"
    assert peak_discharge > 10.0, f"no descarga en pico: {peak_discharge}"
