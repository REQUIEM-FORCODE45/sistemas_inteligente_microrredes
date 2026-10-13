# -*- coding: utf-8 -*-
"""Cambio 14 — transformador en la RAMA DE RED (decision 2026-10-12, ver
VERIFICACION): perdidas P_out = P_in*(1-p) + tope P_in <= S_max*pf, sin
variables nuevas. Regla unificada del 0: campo no > 0 = no declarado.
"""
from __future__ import annotations

import copy

from optimization.solver.model_builder import build_and_solve
from optimization.tests.test_solver import BASE_JOB

# PV determinista sin banda: 50*0.85*0.5 = 21.25 kW todas las horas.
PV_DC = 50 * 0.85 * 0.5


def _job(converters, load_kw=30.0, devices=None):
    job = copy.deepcopy(BASE_JOB)
    job["sources"] = [s for s in job["sources"] if s["type"] == "solar"]
    job["storage"] = []
    job["loads"] = [{"id": "load_1", "type": "load", "max_kw": 1000,
                     "min_kw": 0}]
    job["predictions_load_total"] = [load_kw] * 8
    job["converters"] = copy.deepcopy(converters)
    job["devices"] = (copy.deepcopy(devices) if devices is not None
                      else [{"id": "tr_1", "tipo": "transformer"}])
    return job


def _rows(out, dtype, did="tr_1"):
    return [d for d in out["dispatch_plan"]
            if d["device_type"] == dtype and d["device_id"] == did]


def test_c1_perdidas_exactas_por_hora_y_escenario():
    out = build_and_solve(_job(
        [{"id": "tr_1", "type": "transformer", "s_max_kva": 100.0,
          "power_factor": 0.9, "losses_pct": 2.0}], load_kw=30.0))
    assert out["status"] == "optimal"
    thru = [d for d in out["dispatch_plan"] if d["device_type"] == "transformer"]
    loss = [d for d in out["dispatch_plan"] if d["device_type"] == "transformer_loss"]
    assert len(thru) == 8 * 3, len(thru)
    for t in thru:
        l = next(x["power_kw"] for x in loss
                 if x["hour"] == t["hour"] and x["scenario"] == t["scenario"])
        # P_out = 0.98*P_in, la diferencia no desaparece (fila atribuida).
        # El plan redondea a 3 decimales: el mapa es exacto en el modelo
        # (escala del balance), aqui a precision de reporte.
        assert abs(l - 0.02 * t["power_kw"]) < 2e-3, (t, l)
        assert abs((t["power_kw"] - l) - 0.98 * t["power_kw"]) < 2e-3


def test_c2_tope_limita_y_se_reporta():
    # Demanda 120: sin trafo importaria (120-21.25)/0.98 = 100.8; con tope 90
    # el modelo LIMITA (resto a ENS: diesel/bateria ausentes a proposito).
    out = build_and_solve(_job(
        [{"id": "tr_1", "type": "transformer", "s_max_kva": 100.0,
          "power_factor": 0.9, "losses_pct": 2.0}], load_kw=120.0))
    assert out["status"] == "optimal"
    thru = [d["power_kw"] for d in out["dispatch_plan"]
            if d["device_type"] == "transformer"]
    assert thru and max(thru) <= 90.0 + 1e-9, thru
    assert any(abs(v - 90.0) < 1e-3 for v in thru), "el tope debe morder"
    ens = [d for d in out["dispatch_plan"] if d["device_type"] == "ens"]
    assert ens, "el resto va a ENS declarado (valvula fisica, no cota bajada)"


def test_c3_sin_pf_no_hay_tope_y_se_dice():
    out = build_and_solve(_job(
        [{"id": "tr_1", "type": "transformer", "s_max_kva": 100.0,
          "losses_pct": 2.0}], load_kw=120.0))
    assert out["status"] == "optimal"
    thru = [d["power_kw"] for d in out["dispatch_plan"]
            if d["device_type"] == "transformer"]
    assert max(thru) > 90.0, "sin pf el limite NO se aplica"
    e = next(x for x in out["device_echo"] if x["device_id"] == "tr_1")
    assert e["estado"] == "modelado"
    pe = e["params_efectivos"]
    assert pe["limite_aplicado"] is False
    assert any("power_factor" in m for m in pe["motivos"])
    assert pe["energia_no_contabilizada"] is True


def test_c3_sin_perdidas_pasa_directo_y_se_dice():
    out = build_and_solve(_job(
        [{"id": "tr_1", "type": "transformer", "s_max_kva": 100.0,
          "power_factor": 0.9}], load_kw=30.0))
    assert out["status"] == "optimal"
    assert not _rows(out, "transformer_loss"), "sin perdidas no hay fila"
    e = next(x for x in out["device_echo"] if x["device_id"] == "tr_1")
    pe = e["params_efectivos"]
    assert pe["losses_p"] is None and pe["limite_aplicado"] is True
    assert any("perdidas" in m for m in pe["motivos"])
    # Paso directo: lo que entrega la red al bus == lo importado.
    imp = [d["power_kw"] for d in out["dispatch_plan"]
           if d["device_type"] == "grid_import"]
    thru = [d["power_kw"] for d in out["dispatch_plan"]
            if d["device_type"] == "transformer"]
    assert len(imp) == len(thru) == 8 * 3
    for a, b in zip(sorted(imp), sorted(thru)):
        assert abs(a - b) < 1e-6


def test_c3_cero_es_no_declarado():
    # Pitfall del 13: el panel guarda 0 al vaciar un number.
    out = build_and_solve(_job(
        [{"id": "tr_1", "type": "transformer", "s_max_kva": 0,
          "power_factor": 0, "losses_pct": 0}], load_kw=30.0))
    assert out["status"] == "optimal"
    e = next(x for x in out["device_echo"] if x["device_id"] == "tr_1")
    pe = e["params_efectivos"]
    assert pe["limite_aplicado"] is False and pe["losses_p"] is None
    assert len(pe["motivos"]) == 2


def test_c4_frontera_en_eco_y_c5_balance_integro():
    out = build_and_solve(_job(
        [{"id": "tr_1", "type": "transformer", "s_max_kva": 100.0,
          "power_factor": 0.9, "losses_pct": 2.0,
          "ratio_label": "13.2/0.22 kV"}], load_kw=30.0))
    assert out["status"] == "optimal"
    e = next(x for x in out["device_echo"] if x["device_id"] == "tr_1")
    assert "tension/impedancia NO simuladas" in e["params_efectivos"]["alcance"]
    for sc in ("Soleado", "Nublado", "Lluvia"):
        for h in range(1, 9):
            en = lambda rows: sum(
                r["power_kw"] for r in rows
                if r["scenario"] == sc and r["hour"] == h)
            imp = en([d for d in out["dispatch_plan"]
                      if d["device_type"] == "grid_import"])
            loss = en(_rows(out, "transformer_loss"))
            # Balance con trafo: PV + 0.98*import == carga (sin diesel/bat).
            assert abs(PV_DC + 0.98 * imp - 30.0) < 0.01, (sc, h, imp)
            assert abs(loss - 0.02 * imp) < 0.01, (sc, h, loss)
