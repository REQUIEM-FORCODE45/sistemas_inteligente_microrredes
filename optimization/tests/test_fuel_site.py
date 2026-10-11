# -*- coding: utf-8 -*-
"""Cambio 11 — precio del combustible por sitio + Willans (criterios C1-C3, C6, C7).

Sin site_id: comportamiento legacy intacto (compatibilidad con tests viejos).
"""
from __future__ import annotations

import copy

from optimization.solver.model_builder import build_and_solve

SITE = "pasto_narino"
WILLANS = {"cost_a": 0.0012, "cost_b": 0.24, "cost_c": 1.8}
PRICE = 2782.0


def _isla_job(load_kw: float = 50.0, hours: int = 8, **kw):
    job = {
        "job_id": "fuel11", "horizon": hours, "time_step_minutes": 60,
        "predictions_solar": [], "predictions_load_total": [load_kw] * hours,
        "sources": [
            {"id": "diesel_1", "type": "diesel", "max_kw": 300, "min_kw": 50,
             "efficiency": 1.0, "cost_a": 0.0012, "cost_b": 0.24,
             "cost_c": 1.8},
        ],
        "storage": [],
        "loads": [{"id": "load_1", "type": "load", "max_kw": 1000, "min_kw": 0}],
        "grid": {"max_import_kw": 0, "max_export_kw": 0, "min_import_kw": 0,
                 "cost_fixed": 40, "cost_variable": 60},
        "site_id": SITE,
    }
    job.update(kw)
    return job


def _diesel_series(out, scenario="Soleado"):
    return [d["power_kw"] for d in out["dispatch_plan"]
            if d["device_type"] == "diesel" and d["scenario"] == scenario]


def test_c1_precio_del_sitio_y_cuenta_935():
    """C1+C6: el job recibe el precio del YAML; a 50 kW ~935 COP/kWh."""
    from optimization.config.loader import load_site
    assert load_site(SITE)["fuel"]["price_cop_per_l"] == 2782
    out = build_and_solve(_isla_job())
    assert out["status"] == "optimal"
    fp = out["fuel_price_applied"]
    assert fp == {"valor": 2782.0, "origen": "sitio",
                  "vigencia": "2026-10", "fuente": "Portal CREG"}
    seq = _diesel_series(out)
    assert all(abs(p - 50.0) < 0.5 for p in seq), seq
    cop_kwh = (1.8 + 0.24 * 50.0 + 0.0012 * 50.0 ** 2) * 2782.0 / 50.0
    print(f"precio sitio: {fp['valor']} | costo a 50 kW: {cop_kwh:.1f} COP/kWh")
    assert 930.0 < cop_kwh < 940.0


def test_c2_nodo_sobrescribe_con_origen():
    job = _isla_job()
    job["sources"][0]["fuel_cost"] = 3000.0
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    assert out["fuel_price_applied"]["origen"] == "nodo"
    assert out["fuel_price_applied"]["valor"] == 3000.0


def test_legacy_se_normaliza_a_sitio():
    """Diagramas viejos (fuel 100 + coeffs legacy) usan sitio/Willans."""
    job = _isla_job()
    job["sources"][0].update({"cost_a": 0.001, "cost_b": 0.5, "cost_c": 0.5,
                              "fuel_cost": 100})
    out = build_and_solve(job)
    assert out["status"] == "optimal"
    assert out["fuel_price_applied"]["origen"] == "sitio"
    assert out["fuel_price_applied"]["valor"] == 2782.0
    seq = _diesel_series(out)
    assert all(abs(p - 50.0) < 0.5 for p in seq), seq


def test_c3_desglose_cuadra_a_mano():
    """C3: cost_breakdown diesel == Willans x precio (tolerancia 1%)."""
    out = build_and_solve(_isla_job())
    assert out["status"] == "optimal"
    seq = _diesel_series(out, scenario="Soleado")
    esperado = sum((1.8 + 0.24 * p + 0.0012 * p ** 2) * 2782.0 for p in seq)
    horas = [e for e in out["cost_breakdown"]["hourly"]
             if e["scenario"] == "Soleado"]
    diesel_rep = sum(e["cost"] for e in horas) - 40.0 * 8
    print(f"esperado: {esperado:.1f} | reportado: {diesel_rep:.1f}")
    assert abs(diesel_rep - esperado) / esperado < 0.01


def test_c7_litros_por_mwh():
    """C7: ~336 L/MWh a 50 kW (Willans), no 560."""
    out = build_and_solve(_isla_job())
    seq = _diesel_series(out)
    litros = sum(1.8 + 0.24 * p + 0.0012 * p ** 2 for p in seq)
    mwh = sum(seq) / 1000.0
    ratio = litros / mwh
    print(f"litros/MWh: {ratio:.1f}")
    assert 330.0 < ratio < 342.0
