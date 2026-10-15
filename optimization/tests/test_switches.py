# -*- coding: utf-8 -*-
"""Cambio 15 — switches de conectividad: el operador fija, el solver elige.

C1 operador abre red -> 0 en todas las horas + eco. C2 solver abre con red
cara y cierra con red barata + maniobras con costo. C3 todo abierto -> ENS
declarado. C4 solver sin M -> error atribuido + fail-safe abierto. C6 modo
impuesto reproduce el dispatch anterior (artefacto golden versionado, job
asimetrico para evitar empates del solver).
"""
from __future__ import annotations

import copy
import hashlib
import json
import os

from optimization.solver.model_builder import build_and_solve
from optimization.tests.test_solver import BASE_JOB

# C6: golden del modo impuesto (sin connections). Job asimetrico a proposito:
# con entradas constantes el solver empata entre optimos y el sha baila.
# La EVIDENCIA pre-cambio vive versionada (no en constantes sueltas) en
# integracion_plataforma/cambio_15_switches_conectividad/reference/resultados/golden_impuesto.json
# — calculada con el codigo ANTERIOR al cambio (ver "capturado_en_commit"
# dentro del artefacto). Este test la CARGA.
C6_JOB = dict(
    predictions_solar=[0.1 + 0.1 * h for h in range(8)],
    predictions_load_total=[10.0, 12.0, 8.0, 15.0, 10.0, 9.0, 11.0, 13.0],
)
_GOLDEN_C6 = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..",
    "integracion_plataforma", "cambio_15_switches_conectividad",
    "reference", "resultados", "golden_impuesto.json"))


def _golden_c6():
    with open(_GOLDEN_C6, encoding="utf-8") as fh:
        return json.load(fh)


def _job(**kw):
    job = copy.deepcopy(BASE_JOB)
    job.update(copy.deepcopy(C6_JOB))
    job["grid"] = dict(job["grid"], max_export_kw=0)
    for k, v in kw.items():
        job[k] = copy.deepcopy(v)
    return job


def _canon(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()


def _grid_kw(plan):
    return [d["power_kw"] for d in plan
            if d["device_type"] in ("grid_import", "grid_export")]


def test_c6_modo_impuesto_reproduce_dispatch():
    golden = _golden_c6()
    # coherencia interna del artefacto: el sha que declara es el del plan
    # que trae (si alguien lo edita a mano, esto falla primero)
    assert _canon(golden["dispatch_plan"]) == golden["plan_sha256"]
    out = build_and_solve(_job())
    assert out["status"] == "optimal"
    assert _canon(out["dispatch_plan"]) == golden["plan_sha256"]
    assert out["objective_value"] == golden["objective_value"]
    assert out["topology"]["connections"] == []


def test_c1_operador_abre_red_cero_en_todas_las_horas():
    out = build_and_solve(_job(
        connections=[{"id": "sw_g", "from": "grid_1", "to": "bus_1",
                      "switch_state": "open"}],
        devices=[{"id": "grid_1", "tipo": "grid"}]))
    assert out["status"] == "optimal"
    assert _grid_kw(out["dispatch_plan"]) == []
    sw = next(e for e in out["device_echo"] if e.get("tipo") == "switch")
    assert sw["device_id"] == "sw_g" and sw["estado"] == "modelado"
    assert sw["params_efectivos"]["switch_state"] == "open"
    topo = next(c for c in out["topology"]["connections"] if c["id"] == "sw_g")
    assert topo["switch_state"] == "open"


def test_c1_operador_abre_diesel_y_solar():
    out = build_and_solve(_job(
        connections=[
            {"id": "sw_d", "from": "diesel_1", "to": "bus_1",
             "switch_state": "open"},
            {"id": "sw_s", "from": "solar_1", "to": "bus_1",
             "switch_state": "open"},
        ]))
    assert out["status"] == "optimal"
    for d in out["dispatch_plan"]:
        if d["device_id"] == "diesel_1":
            assert d["power_kw"] == 0.0
        if d["device_id"] == "solar_1":
            assert d["power_kw"] == 0.0


def test_c2_solver_abre_con_red_cara():
    job = _job(
        connections=[{"id": "sw_g", "from": "grid_1", "to": "bus_1",
                      "switch_mode": "solver", "M": 400.0,
                      "switch_cost_cop": 0.0}],
        devices=[{"id": "grid_1", "tipo": "grid"}])
    job["grid"] = dict(job["grid"], max_export_kw=0, cost_variable=500.0)
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    sched = next(c for c in out["topology"]["connections"] if c["id"] == "sw_g")
    vals = sched["schedule"]
    assert vals, "el solver debe reportar topologia por hora"
    assert all(v == 0 for vs in vals.values() for v in vs), vals
    assert _grid_kw(out["dispatch_plan"]) == []


def test_c2_solver_cierra_con_red_barata_y_cobra_maniobra():
    job = _job(
        connections=[{"id": "sw_g", "from": "grid_1", "to": "bus_1",
                      "switch_mode": "solver", "M": 400.0,
                      "switch_state": "open", "switch_cost_cop": 1000.0}],
        devices=[{"id": "grid_1", "tipo": "grid"}])
    job["grid"] = dict(job["grid"], max_export_kw=0, cost_variable=5.0)
    # Sin bateria: en isla solo queda diesel (min 50 kW, caro) o ENS (5000).
    # Cerrar (1 maniobra x 1000) + red barata gana por goleada.
    job["storage"] = []
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    sched = next(c for c in out["topology"]["connections"] if c["id"] == "sw_g")
    vals = [v for vs in sched["schedule"].values() for v in vs]
    assert any(v == 1 for v in vals), sched["schedule"]
    assert out["topology"]["switching_cost_cop"] == 1000.0
    assert any(m["id"] == "sw_g" and m["de"] == 0 and m["a"] == 1
               for m in out["topology"]["maneuvers"])


def test_c3_todo_abierto_ens_declarado():
    out = build_and_solve(_job(connections=[
        {"id": "sw_g", "from": "grid_1", "to": "bus_1", "switch_state": "open"},
        {"id": "sw_d", "from": "diesel_1", "to": "bus_1", "switch_state": "open"},
        {"id": "sw_s", "from": "solar_1", "to": "bus_1", "switch_state": "open"},
        {"id": "sw_b", "from": "battery_1", "to": "bus_1", "switch_state": "open"},
    ]))
    assert out["status"] == "optimal"
    ens = [d["power_kw"] for d in out["dispatch_plan"]
           if d["device_type"] == "ens"]
    assert sum(ens) > 0, "sin fuentes debe haber ENS declarado, no silencio"


def test_c4_solver_sin_m_error_atribuido_y_fail_safe():
    out = build_and_solve(_job(
        connections=[{"id": "sw_g", "from": "grid_1", "to": "bus_1",
                      "switch_mode": "solver"}],
        devices=[{"id": "grid_1", "tipo": "grid"}]))
    assert out["status"] == "optimal"
    sw = next(e for e in out["device_echo"] if e.get("tipo") == "switch")
    assert sw["estado"] == "error"
    assert "M" in sw["motivo"]
    assert _grid_kw(out["dispatch_plan"]) == []
    assert any("sw_g" in w for w in out.get("warnings", []))
