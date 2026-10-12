# -*- coding: utf-8 -*-
"""Cambio 13.1 — inversor con modelo: etapa en serie sobre la rama PV.

C1 conversion exacta, C2 tope + recorte visible, C3 eta ausente (cero
invencion), C6 eco modelado con params efectivos. 13.2 (bus DC) y 13.3
(propagacion) tienen sus propios tests mas abajo en este mismo archivo.
"""
from __future__ import annotations

import copy

from optimization.solver.model_builder import build_and_solve
from optimization.tests.test_solver import BASE_JOB

ETA = 0.97
# Decimales exactos: 0.97*10=9.7, *20=19.4, *30=29.1 (C1 a ±1e-6 en el plan).
BAND = [{"P10": 10.0, "P50": 20.0, "P90": 30.0}] * 8
CUANTIL = {"Soleado": "P90", "Nublado": "P50", "Lluvia": "P10"}
VALOR_DC = {"Soleado": 30.0, "Nublado": 20.0, "Lluvia": 10.0}


def _job(converters, band=None):
    job = copy.deepcopy(BASE_JOB)
    job["converters"] = copy.deepcopy(converters)
    job["devices"] = [{"id": "inv_1", "tipo": "inverter"}]
    if band is not None:
        job["predictions_pv_band"] = copy.deepcopy(band)
    return job


def _inv_rows(out):
    return [d for d in out["dispatch_plan"] if d["device_type"] == "inverter"]


def test_c1_conversion_exacta_por_hora_y_escenario():
    out = build_and_solve(_job(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 1000.0}],
        band=BAND))
    assert out["status"] == "optimal"
    rows = _inv_rows(out)
    assert len(rows) == 8 * 3, f"filas inversor: {len(rows)}"
    for r in rows:
        esperado = ETA * VALOR_DC[r["scenario"]]
        assert abs(r["power_kw"] - esperado) < 1e-6, (
            f'h{r["hour"]} {r["scenario"]}: {r["power_kw"]} != {ETA}*{VALOR_DC[r["scenario"]]}')


def test_c2_tope_limita_y_recorte_no_desaparece():
    out = build_and_solve(_job(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 50.0}],
        band=BAND))
    assert out["status"] == "optimal"
    for r in _inv_rows(out):
        assert r["power_kw"] <= 50.0 + 1e-9, f'sin tope: {r}'
    # Nublado: P_dc=20 -> 19.4 < 50 (sin recorte); Soleado: 30*0.97=29.1 < 50.
    # Fuerzo recorte con banda alta:
    out2 = build_and_solve(_job(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 50.0}],
        band=[{"P10": 60.0, "P50": 100.0, "P90": 120.0}] * 8))
    assert out2["status"] == "optimal"
    inv2 = [d for d in out2["dispatch_plan"] if d["device_type"] == "inverter"]
    assert all(d["power_kw"] <= 50.0 + 1e-9 for d in inv2)
    clips = [d for d in out2["dispatch_plan"]
             if d["device_type"] == "curtailment" and d["device_id"] == "inv_1"]
    assert clips, "el recorte por tope debe aparecer como no aprovechado"
    # Nublado: 100*0.97-50 = 47.0 exacto
    nub = next(c for c in clips if c["scenario"] == "Nublado")
    assert abs(nub["power_kw"] - 47.0) < 1e-6, nub


def test_c3_eta_ausente_no_convierte_y_lo_dice():
    out = build_and_solve(_job([{"id": "inv_1", "type": "inverter"}], band=BAND))
    assert out["status"] == "optimal"
    e = next(x for x in out["device_echo"] if x["device_id"] == "inv_1")
    assert e["estado"] == "modelado"
    assert e["params_efectivos"]["eta"] is None
    assert e["params_efectivos"]["eta_origen"] == "no declarada"
    # P_ac = P_dc (paso directo): igual al cuantil DC de cada escenario.
    for r in _inv_rows(out):
        assert abs(r["power_kw"] - VALOR_DC[r["scenario"]]) < 1e-6, r


def test_c6_eco_modelado_con_efectivos():
    out = build_and_solve(_job(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 25.0,
          "bidirectional": False, "bus_dc": False}], band=BAND))
    e = next(x for x in out["device_echo"] if x["device_id"] == "inv_1")
    assert e["estado"] == "modelado"
    pe = e["params_efectivos"]
    assert pe["eta"] == ETA and pe["eta_origen"] == "declarada"
    assert pe["max_kw"] == 25.0 and pe["bus_dc"] is False


def test_bidir_sin_bus_dc_avisa_y_no_rompe():
    out = build_and_solve(_job(
        [{"id": "inv_1", "type": "inverter", "eta": ETA,
          "bidirectional": True}], band=BAND))
    assert out["status"] == "optimal"
    assert any("bidirectional" in w for w in out.get("warnings", []))


# ---------------------------------------------------------------------------
# 13.2 — bus DC (C4) y 13.3 — propagacion (C5)
# ---------------------------------------------------------------------------

def _job_dc(converters, band=None, devices=None):
    job = copy.deepcopy(BASE_JOB)
    job["converters"] = copy.deepcopy(converters)
    job["devices"] = copy.deepcopy(devices) if devices is not None else [
        {"id": "inv_1", "tipo": "inverter"}]
    if band is not None:
        job["predictions_pv_band"] = copy.deepcopy(band)
    return job


def _rows(out, dtype, did=None):
    return [d for d in out["dispatch_plan"]
            if d["device_type"] == dtype and (did is None or d["device_id"] == did)]


def test_c4_bus_dc_balances_por_separado():
    conv = [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 1000.0,
             "bus_dc": True}]
    out = build_and_solve(_job_dc(conv, band=BAND))
    assert out["status"] == "optimal"
    for sc, q in CUANTIL.items():
        for h in range(1, 9):
            pv_dc = BAND[h - 1][q]  # factor_pv = 1.0 en los 3 escenarios
            en = lambda rows: sum(
                r["power_kw"] for r in rows
                if r["scenario"] == sc and r["hour"] == h)
            ch = en(_rows(out, "battery_charge", "battery_1"))
            dis = en(_rows(out, "battery_discharge", "battery_1"))
            inv_in = en(_rows(out, "inverter_dc", "inv_1"))
            inv_out = en(_rows(out, "inverter", "inv_1"))
            rev = en(_rows(out, "inverter_rev", "inv_1"))
            spill = sum(r["power_kw"] for r in _rows(out, "curtailment")
                        if r["scenario"] == sc and r["hour"] == h
                        and r["device_id"] == "inv_1")
            # DC: PV + descarga + rev == carga + puerta + vertido
            assert abs(pv_dc + dis + rev - ch - inv_in - spill) < 0.01, (sc, h)
            die = en(_rows(out, "diesel", "diesel_1"))
            red = (en(_rows(out, "grid_import", "grid"))
                   + en(_rows(out, "grid_export", "grid")))  # export va en negativo
            ens = en(_rows(out, "ens"))
            curt = sum(r["power_kw"] for r in _rows(out, "curtailment")
                       if r["scenario"] == sc and r["hour"] == h
                       and r["device_id"] == "curtailment")
            load = 10.0  # predictions_load_total del BASE_JOB
            # AC: diesel + red + viento(0) + puerta + ENS == carga + CURT + rev
            assert abs(die + red + inv_out + ens
                       - load - curt - rev) < 0.01, (sc, h)


def test_c4_panel_ac_en_bus_dc_error_atribuido():
    job = _job_dc(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "bus_dc": True}],
        band=BAND,
        devices=[{"id": "pv_ac", "tipo": "solar_panel_ac"},
                 {"id": "inv_1", "tipo": "inverter"}])
    job["sources"] = [
        {"id": "pv_ac", "type": "solar", "max_kw": 50, "min_kw": 0,
         "efficiency": 0.85, "cost_a": 0, "cost_b": 0, "cost_c": 0,
         "fuel_cost": 0},
        {"id": "diesel_1", "type": "diesel", "max_kw": 300, "min_kw": 50,
         "efficiency": 1.0, "cost_a": 0.001, "cost_b": 0.5, "cost_c": 0.5,
         "fuel_cost": 100},
    ]
    job["storage"] = []
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    e = next(x for x in out["device_echo"] if x["device_id"] == "pv_ac")
    assert e["estado"] == "error", e
    assert "bus DC" in e["motivo"]
    # Su aporte es 0 en el plan (excluido, no adivinado).
    assert all(r["power_kw"] == 0.0
               for r in _rows(out, "solar", "pv_ac"))
    inv = next(x for x in out["device_echo"] if x["device_id"] == "inv_1")
    assert inv["estado"] == "modelado" and inv["params_efectivos"]["bus_dc"] is True


def test_c5_banda_conserva_orden_y_ancho():
    # 13.3 sobre la etapa en serie: P_ac,Pxx = eta * P_dc,Pxx.
    out = build_and_solve(_job(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 1000.0}],
        band=BAND))
    assert out["status"] == "optimal"
    for h in range(1, 9):
        v = {r["scenario"]: r["power_kw"] for r in _inv_rows(out)
             if r["hour"] == h}
        assert v["Soleado"] >= v["Nublado"] >= v["Lluvia"], (h, v)
        ancho_dc = VALOR_DC["Soleado"] - VALOR_DC["Lluvia"]  # 20.0
        ancho_ac = v["Soleado"] - v["Lluvia"]
        assert abs(ancho_ac - ETA * ancho_dc) < 1e-6, (h, ancho_ac)
    # Caso con numeros: h1 Nublado 20.0 -> 19.4; ancho 20.0 -> 19.4.
    n1 = next(r for r in _inv_rows(out)
              if r["hour"] == 1 and r["scenario"] == "Nublado")
    assert abs(n1["power_kw"] - 19.4) < 1e-6, n1


def test_c5_puerta_bus_dc_aplica_eta_al_despacho():
    out = build_and_solve(_job_dc(
        [{"id": "inv_1", "type": "inverter", "eta": ETA, "max_kw": 1000.0,
          "bus_dc": True}], band=BAND))
    assert out["status"] == "optimal"
    for h in range(1, 9):
        for sc in CUANTIL:
            ac = next(r["power_kw"] for r in _rows(out, "inverter", "inv_1")
                      if r["hour"] == h and r["scenario"] == sc)
            dc = next(r["power_kw"] for r in _rows(out, "inverter_dc", "inv_1")
                      if r["hour"] == h and r["scenario"] == sc)
            # El plan redondea a 3 decimales: el mapa P_ac = eta*P_dc es exacto
            # por restriccion; aqui se verifica a precision de reporte.
            assert abs(ac - ETA * dc) < 2e-3, (h, sc, ac, dc)
