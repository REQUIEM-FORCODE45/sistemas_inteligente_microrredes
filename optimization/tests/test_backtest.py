# -*- coding: utf-8 -*-
"""Tests del Experimento A (lazo cerrado) — sin red ni Mongo.

Usa datos falsos deterministicos para verificar:
  - el lazo cerrado produce balance (violaciones = 0) y contabilidad coherente;
  - las metricas (costo, renovables, ciclos, importacion, diesel, violaciones);
  - la regla heuristica (priority list) con casos limite;
  - la igualdad de condiciones entre estrategias (mismos dias/estado inicial).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from optimization.experiments.config import MICROGRID, diesel_total_cost
from optimization.experiments.backtest import run_day, _grid_slack
from optimization.experiments.metrics import evaluate_day, summarize
from optimization.experiments import strategies as strat

TZ = "America/Bogota"


class FakeProvider:
    """Banda PV y carga fake: PV diurno P50=20 kW, carga 30 kW constante."""

    def forecast(self, anchor, hours=48):
        idx = pd.date_range(anchor, periods=hours, freq="h", tz=anchor.tz)
        hours_of_day = idx.hour.values
        pv = np.where((hours_of_day >= 7) & (hours_of_day <= 17), 20.0, 0.0)
        band = pd.DataFrame({
            "P10": pv * 0.6, "P50": pv, "P90": pv * 1.2,
        }, index=idx)
        load = pd.Series(30.0, index=idx)
        return band, load


def _realized(day: pd.Timestamp, n=24):
    idx = pd.date_range(day, periods=n, freq="h", tz=TZ)
    pv = np.where((idx.hour.values >= 7) & (idx.hour.values <= 17), 22.0, 0.0)
    return pd.Series(pv, index=idx), pd.Series(30.0, index=idx)


def test_balance_violaciones_cero_y_costos_positivos():
    day = pd.Timestamp("2026-07-18", tz=TZ)
    pv_real, load_real = _realized(day)
    trace = run_day("dmpc", day, pv_real, load_real, FakeProvider())
    assert trace["violation"].sum() == 0
    assert (trace["cost_diesel"] >= 0).all()
    assert np.isfinite(trace["cost_grid"]).all()  # exportacion = ingreso (negativo)
    # balance cerrado: carga <= PV + diesel + red + bateria (sobre-generacion ok)
    gen = (trace["pv_real_kw"] + trace["diesel_kw"] + trace["grid_kw"]
           + trace["discharge_kw"] - trace["charge_kw"])
    assert (gen >= trace["load_real_kw"] - 1e-6).all()


def test_metricas_agregadas_consistencia():
    day = pd.Timestamp("2026-07-18", tz=TZ)
    pv_real, load_real = _realized(day)
    trace = run_day("smpc", day, pv_real, load_real, FakeProvider())
    m = evaluate_day(trace)
    assert m["violations"] == 0
    assert m["load_kwh"] == pytest.approx(24 * 30.0)
    assert m["battery_throughput_kwh"] >= 0
    assert m["battery_cycles"] == pytest.approx(
        m["battery_throughput_kwh"] / (2 * MICROGRID["battery"]["capacity_kwh"]))
    # costo = suma de los terminos parciales
    assert m["cost_total"] == pytest.approx(
        trace["cost_diesel"].sum() + trace["cost_grid"].sum()
        + trace["cost_battery"].sum())
    # diesel: litros = sum(c + b*P + a*P^2)
    assert m["diesel_liters"] == pytest.approx(sum(
        (0.5 + 0.5 * d + 0.001 * d ** 2) for d in trace["diesel_kw"]))


def test_heur_prioridad_pv_primero():
    day = pd.Timestamp("2026-07-18", tz=TZ)
    # dia con mucha PV: la bateria carga en valle (tarifa 45) y no descarga
    pv_real, load_real = _realized(day)
    trace = run_day("heur", day, pv_real, load_real, FakeProvider())
    assert trace["violation"].sum() == 0
    # en horas sin PV la carga la cubre la red o el diesel (nunca vacio)
    assert (trace["grid_kw"] + trace["diesel_kw"] + trace["discharge_kw"]
            >= trace["load_real_kw"] - trace["pv_real_kw"] - 1e-6).all()


def test_heur_regla_diesel_vs_red():
    # tarifa pico (140) y diesel mas barato -> con deficit >= min usa diesel
    b = MICROGRID["battery"]
    act = strat.strategy_heur(pv_real=0.0, load_real=80.0, soc_kwh=0.2 * 200,
                              tariff=140.0, capacity_kwh=200.0)
    assert act["diesel"] >= 50.0  # uso diesel (marginal < 140)
    assert act["grid"] == 0.0
    # tarifa valle (45) -> red, no diesel
    act2 = strat.strategy_heur(pv_real=0.0, load_real=80.0, soc_kwh=0.2 * 200,
                               tariff=45.0, capacity_kwh=200.0)
    assert act2["grid"] == pytest.approx(80.0)
    assert act2["diesel"] == 0.0


def test_heur_bateria_en_pico():
    # SOC alto + tarifa pico -> descarga primero (hasta cubrir deficit)
    act = strat.strategy_heur(pv_real=0.0, load_real=40.0,
                              soc_kwh=0.8 * 200, tariff=140.0,
                              capacity_kwh=200.0)
    assert act["discharge"] == pytest.approx(40.0, abs=1e-6)
    assert act["grid"] == 0.0


def test_estrategias_mismos_dias_y_estado_inicial():
    """Todas las estrategias se ejecutan sobre el mismo dia y SOC inicial."""
    day = pd.Timestamp("2026-07-18", tz=TZ)
    pv_real, load_real = _realized(day)
    traces = {s: run_day(s, day, pv_real, load_real, FakeProvider())
              for s in ("smpc", "dmpc", "heur", "mpc-pi")}
    for s, t in traces.items():
        assert len(t) == 24
        assert t["soc_kwh"].iloc[0] == pytest.approx(0.65 * 200)
    # mismo PV y carga realizados para todas
    assert all((traces[s]["pv_real_kw"].values == pv_real.values).all()
               for s in traces)
    assert all((traces[s]["load_real_kw"].values == load_real.values).all()
               for s in traces)


def test_grid_slack_recorte_y_violacion():
    grid_min, grid_max = MICROGRID["grid"]["min_import_kw"], \
        MICROGRID["grid"]["max_import_kw"]
    p, v, _, _ = _grid_slack(load_real=500, pv_real=0, diesel=0, discharge=0,
                       charge=0, grid_min=grid_min, grid_max=grid_max)
    assert v == 1 and p == grid_max          # deficit -> violacion
    p2, v2, _, _ = _grid_slack(load_real=0, pv_real=1000, diesel=0, discharge=0,
                         charge=0, grid_min=grid_min, grid_max=grid_max)
    assert v2 == 0 and p2 == grid_min        # excedente -> recorte, no viola


def test_summarize_media_y_std():
    days = {
        "d1": {"cost_total": 100.0, "violations": 0, "battery_cycles": 1.0},
        "d2": {"cost_total": 300.0, "violations": 0, "battery_cycles": 2.0},
    }
    s = summarize(days)
    assert s["cost_total"] == pytest.approx(200.0)
    assert s["cost_total_std"] == pytest.approx(141.42, abs=1e-2)  # std muestral
    assert s["violations_total"] == 0


def test_cada_dia_usa_su_rebanada_de_realizados():
    """Regresion: el dia 2 usa los realizados del dia 2 (no los del dia 1)."""
    day1 = pd.Timestamp("2026-07-18", tz=TZ)
    day2 = day1 + pd.Timedelta(days=1)
    pv1, load1 = _realized(day1)
    pv2, load2 = _realized(day2)
    pv2 = pv2 * 2.0   # dia 2 con el doble de PV
    t1 = run_day("heur", day1, pv1, load1, FakeProvider())
    t2 = run_day("heur", day2, pv2, load2, FakeProvider())
    assert t1["pv_real_kw"].sum() > 0
    assert t2["pv_real_kw"].sum() == pytest.approx(2 * t1["pv_real_kw"].sum())
    assert (t1["pv_real_kw"].values != t2["pv_real_kw"].values).any()


def test_run_day_rechaza_rebanadas_incompletas():
    day = pd.Timestamp("2026-07-18", tz=TZ)
    pv_real, load_real = _realized(day)
    with pytest.raises(ValueError):
        run_day("heur", day, pv_real.iloc[:10], load_real, FakeProvider())


def test_soc_se_mantiene_dentro_de_limites():
    """Regresion (flag del revisor): el SOC del lazo cerrado NUNCA sale de
    [soc_min, soc_max] — cada solve recibe el SOC real propagado."""
    b = MICROGRID["battery"]
    lo = b["soc_min"] * b["capacity_kwh"] - 1e-3
    hi = b["soc_max"] * b["capacity_kwh"] + 1e-3
    day = pd.Timestamp("2026-07-18", tz=TZ)
    pv_real, load_real = _realized(day)
    for s in ("smpc", "dmpc", "mpc-pi", "heur"):
        trace = run_day(s, day, pv_real, load_real, FakeProvider())
        assert trace["soc_kwh"].min() >= lo, f"{s}: SOC por debajo del piso"
        assert trace["soc_kwh"].max() <= hi, f"{s}: SOC por encima del techo"


def test_mpc_pi_es_cota_inferior_de_costo():
    """Regresion (flag del revisor): con forecast perfecto el MPC-PI debe
    rendir al menos tan bien como D-MPC en el costo realizado."""
    day = pd.Timestamp("2026-07-18", tz=TZ)
    pv_real, load_real = _realized(day)
    t_d = run_day("dmpc", day, pv_real, load_real, FakeProvider())
    t_o = run_day("mpc-pi", day, pv_real, load_real, FakeProvider())
    cost_d = evaluate_day(t_d)["cost_total"]
    cost_o = evaluate_day(t_o)["cost_total"]
    assert cost_o <= cost_d + 1e-6, \
        f"MPC-PI ({cost_o:.0f}) NO domina a D-MPC ({cost_d:.0f})"

def test_oracle_es_cota_inferior_de_costo():
    """Alias compat Oráculo -> MPC-PI."""
    return test_mpc_pi_es_cota_inferior_de_costo()


def test_metricas_etiquetas_periodo_vs_diario():
    """Regresion (flag del revisor): 'Costo total periodo' es la SUMA del
    periodo; 'diario medio' es la media — valores distintos por diseno."""
    days = {
        "d1": {"cost_total": 100.0, "violations": 0},
        "d2": {"cost_total": 300.0, "violations": 0},
        "d3": {"cost_total": 500.0, "violations": 0},
    }
    s = summarize(days)
    assert s["n_days"] == 3
    assert s["cost_total_period"] == pytest.approx(900.0)
    assert s["cost_total"] == pytest.approx(300.0)
    assert s["cost_total_std"] == pytest.approx(200.0, abs=1e-6)
    assert s["cost_total_period"] != pytest.approx(s["cost_total"])


def test_costo_diesel_formula_exacta():
    assert diesel_total_cost(100.0) == pytest.approx(
        (0.5 + 0.5 * 100 + 0.001 * 100 ** 2) * 100)
