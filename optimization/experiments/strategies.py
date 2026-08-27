# -*- coding: utf-8 -*-
"""Estrategias del Experimento A.

- S-MPC  : estocastico, 3 escenarios anclados a cuantiles (P90/P50/P10,
           probs 0.2/0.6/0.2) — es la configuracion de produccion.
- D-MPC  : determinista, S=1 con la curva P50.
- MPC-PI : D-MPC con forecast perfecto (clima realizado) — cota superior.
- HEUR   : priority list (PV -> bateria en pico -> diesel si es mas barato
           que la red -> red). Decide sobre los valores REALIZADOS de la hora
           (informacion presente), como haria un controlador clasico.

Todas usan el mismo modelo Pyomo (complementariedad big-M incluida) y la
misma funcion de costo. En cada hora se implementa la PRIMERA accion del
escenario base (P50/Nublado) — receding horizon.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from optimization.solver.model_builder import build_and_solve
from optimization.experiments.config import (MICROGRID, HEUR,
                                             tou_variable_tariff,
                                             diesel_marginal_cost)


def _build_job(anchor: pd.Timestamp, band: pd.DataFrame, load_fc: pd.Series,
               horizon: int, scenarios: list | None,
               initial_soc: float | None = None) -> dict:
    """Payload del solver con la topologia de la microred (igual produccion).

    `initial_soc` es el SOC REAL del lazo cerrado en la hora de decision:
    sin esto, cada solve arranca con SOC=0.65 y la bateria "regala" energia
    (artefacto que invalida el receding horizon).
    """
    t0 = band.index[0]
    idx = pd.date_range(t0, periods=horizon, freq="h", tz=band.index.tz)
    band_24 = band.reindex(idx).ffill().fillna(0.0)
    load_24 = load_fc.reindex(idx).ffill().fillna(0.0)
    battery = dict(MICROGRID["battery"])
    if initial_soc is not None:
        battery["initial_soc"] = float(np.clip(initial_soc,
                                               battery["soc_min"],
                                               battery["soc_max"]))
    return {
        "job_id": "expA", "horizon": horizon, "time_step_minutes": 60,
        "predictions_solar": [],
        "predictions_load_total": load_24.tolist(),
        "predictions_pv_kw": band_24["P50"].tolist(),
        "predictions_pv_band": [
            {"P10": float(r["P10"]), "P50": float(r["P50"]),
             "P90": float(r["P90"])} for _, r in band_24.iterrows()
        ],
        "predictions_wind_kw": [],
        "predictions_wind_band": [],
        "sources": [
            {"id": "solar_1", "type": "solar", "max_kw": 50, "min_kw": 0,
             "efficiency": 1.0, "cost_a": 0, "cost_b": 0, "cost_c": 0,
             "fuel_cost": 0},
            {"id": "diesel_1", "type": "diesel",
             "min_kw": MICROGRID["diesel"]["min_kw"],
             "max_kw": MICROGRID["diesel"]["max_kw"],
             "efficiency": 1.0,
             "cost_a": MICROGRID["diesel"]["cost_a"],
             "cost_b": MICROGRID["diesel"]["cost_b"],
             "cost_c": MICROGRID["diesel"]["cost_c"],
             "fuel_cost": MICROGRID["diesel"]["fuel_cost"]},
        ],
        "storage": [battery],
        "loads": [{"id": "load_1", "type": "load", "max_kw": 1000, "min_kw": 0}],
        "grid": {
            "max_import_kw": MICROGRID["grid"]["max_import_kw"],
            "min_import_kw": MICROGRID["grid"]["min_import_kw"],
            "cost_fixed": MICROGRID["grid"]["cost_fixed"],
            "export_tariff": MICROGRID["grid"].get("export_tariff", 0.0),
            "ens_penalty_cop_kwh": MICROGRID["grid"].get("ens_penalty_cop_kwh", 5000.0),
            "cost_variable": [
                float(tou_variable_tariff(idx).iloc[k]) for k in range(horizon)
            ],
        },
        "scenarios": scenarios,
        "solver": "gurobi",
    }


D_SCEN = [{"name": "Base", "probability": 1.0, "quantile": "P50"}]


def mpc_first_action(band: pd.DataFrame, load_fc: pd.Series,
                     horizon: int, scenarios: list | None,
                     base_scenario: str,
                     initial_soc: float | None = None) -> dict:
    """Resuelve el MPC y devuelve la primera accion del escenario base."""
    job = _build_job(band.index[0], band, load_fc, horizon, scenarios,
                     initial_soc=initial_soc)
    out = build_and_solve(job)
    if out.get("status") != "optimal":
        raise RuntimeError(f"MPC no resolvio: {out.get('status')} {out.get('error')}")
    hour = 1
    actions = {"diesel": 0.0, "grid": 0.0, "charge": 0.0, "discharge": 0.0}
    for d in out["dispatch_plan"]:
        if d["hour"] != hour or d["scenario"] != base_scenario:
            continue
        if d["device_type"] == "diesel":
            actions["diesel"] = d["power_kw"]
        elif d["device_type"] in ("grid_import", "grid_export"):
            # el dispatch trae el valor CON SIGNO (positivo=import, negativo=export)
            actions["grid"] = d["power_kw"]
        elif d["device_type"] == "battery_charge":
            actions["charge"] = d["power_kw"]
        elif d["device_type"] == "battery_discharge":
            actions["discharge"] = d["power_kw"]
    return actions


# --------------------------------------------------------------------------- #
# Estrategias
# --------------------------------------------------------------------------- #
def strategy_smpc(band: pd.DataFrame, load_fc: pd.Series,
                  horizon: int = 24, initial_soc: float | None = None) -> dict:
    """S-MPC: 3 escenarios anclados a cuantiles (default de produccion)."""
    return mpc_first_action(band, load_fc, horizon, None, "Nublado",
                            initial_soc=initial_soc)


def strategy_dmpc(band: pd.DataFrame, load_fc: pd.Series,
                  horizon: int = 24, initial_soc: float | None = None) -> dict:
    """D-MPC: determinista (solo P50)."""
    return mpc_first_action(band, load_fc, horizon, D_SCEN, "Base",
                            initial_soc=initial_soc)


def strategy_mpc_pi(band: pd.DataFrame, load_fc: pd.Series,
                    horizon: int = 24, initial_soc: float | None = None) -> dict:
    """MPC-PI: D-MPC con el forecast perfecto (serie realizada)."""
    return mpc_first_action(band, load_fc, horizon, D_SCEN, "Base",
                            initial_soc=initial_soc)

def strategy_oracle(band: pd.DataFrame, load_fc: pd.Series,
                    horizon: int = 24, initial_soc: float | None = None) -> dict:
    return strategy_mpc_pi(band, load_fc, horizon, initial_soc)


def strategy_heur(pv_real: float, load_real: float, soc_kwh: float,
                  tariff: float, capacity_kwh: float,
                  b: dict | None = None) -> dict:
    """Priority list sobre la hora actual (valores realizados).

    Regla documentada:
      1. PV (gratis) cubre la carga.
      2. Si queda deficit y tarifa >= umbral de pico y SOC > piso:
         bateria descarga (hasta el deficit o su max).
      3. Si sigue el deficit: diesel si su costo marginal < tarifa de red
         (y el deficit >= min del diesel; si no, red).
      4. Excedente PV: si tarifa <= valle y SOC < techo, cargar bateria.
      5. Excedente restante se exporta (hasta el limite) o se recorta.
    """
    b = b or MICROGRID["battery"]
    soc_min_kwh = b["soc_min"] * capacity_kwh
    actions = {"diesel": 0.0, "grid": 0.0, "charge": 0.0, "discharge": 0.0,
               "curtailed": 0.0}

    deficit = max(0.0, load_real - pv_real)
    surplus = max(0.0, pv_real - load_real)

    if deficit > 0:
        if (tariff >= HEUR["peak_tariff"]
                and soc_kwh > HEUR["soc_discharge_floor"] * capacity_kwh):
            max_dis = min(deficit, b["max_discharge_kw"])
            usable = (soc_kwh - soc_min_kwh) * b["discharge_efficiency"]
            discharge = min(max_dis, usable)
            actions["discharge"] = discharge
            deficit -= discharge
    if deficit > 0:
        diesel_ok = (diesel_marginal_cost(MICROGRID["diesel"]["max_kw"])
                     < tariff and deficit >= MICROGRID["diesel"]["min_kw"])
        if diesel_ok:
            actions["diesel"] = min(MICROGRID["diesel"]["max_kw"],
                                    max(MICROGRID["diesel"]["min_kw"], deficit))
        else:
            actions["grid"] = deficit
    if surplus > 0:
        if (tariff <= HEUR["valley_tariff"]
                and soc_kwh < HEUR["soc_charge_ceiling"] * capacity_kwh):
            room = (HEUR["soc_charge_ceiling"] * capacity_kwh - soc_kwh) \
                / b["charge_efficiency"]
            charge = min(surplus, b["max_charge_kw"], room)
            actions["charge"] = charge
            surplus -= charge
        actions["curtailed"] = max(0.0, surplus)
    return actions
