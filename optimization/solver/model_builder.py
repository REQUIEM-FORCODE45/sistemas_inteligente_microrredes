"""Construye el modelo Pyomo de optimizacion estocastica para la microrred.

Traduce la topologia del diagrama unifilar + predicciones en un modelo
matematico de despacho economico con baterias, red y N generadores.

Soporte:
  - N generadores definidos dinamicamente
  - M baterias con restricciones de SOC
  - K escenarios estocasticos (soleado, nublado, lluvia)
  - Funcion objetivo = costo total esperado ponderado por probabilidad
"""

import logging
from typing import Any

from optimization.solver.cost_functions import (
    diesel_cost,
    battery_degradation_cost,
    no_cost,
)
from optimization.solver.scenarios import build_scenarios
from optimization.solver.solvers import solve, SolverResult

logger = logging.getLogger(__name__)

try:
    import pyomo.environ as pyo
except ImportError:
    raise ImportError("Pyomo es requerido. pip install pyomo")


def build_and_solve(input_data: dict[str, Any]) -> dict[str, Any]:
    """Construye el modelo Pyomo y ejecuta la optimizacion.

    Args:
        input_data: diccionario con la topologia del diagrama unifilar
                    y predicciones, con el formato de schemas.OptimizationInput.

    Returns:
        dict con el formato schemas.OptimizationResult (serializado)
    """
    job_id = input_data.get("job_id", "unknown")
    horizon = int(input_data.get("horizon", 24))
    time_step = int(input_data.get("time_step_minutes", 60))
    scenarios_raw = input_data.get("scenarios")
    predictions_solar = input_data.get("predictions_solar", [])
    predictions_load_total = input_data.get("predictions_load_total", [])
    sources = input_data.get("sources", [])
    storage_list = input_data.get("storage", [])
    converters = input_data.get("converters", [])
    loads = input_data.get("loads", [])
    grid_raw = input_data.get("grid", {})

    scenarios = build_scenarios(scenarios_raw)
    num_scenarios = len(scenarios)
    s_ids = list(range(num_scenarios))

    try:
        pyo_model, variables = _build_pyomo_model(
            horizon=horizon,
            time_step=time_step,
            scenarios=scenarios,
            s_ids=s_ids,
            predictions_solar=predictions_solar,
            predictions_load_total=predictions_load_total,
            sources=sources,
            storage_list=storage_list,
            loads=loads,
            grid_raw=grid_raw,
        )
    except Exception as e:
        logger.exception("Error construyendo modelo Pyomo")
        return {
            "job_id": job_id,
            "status": "error",
            "error": f"Error construyendo modelo Pyomo: {e}",
        }

    solver_pref = input_data.get("solver", "gurobi")
    result: SolverResult = solve(pyo_model, preferred=solver_pref)

    if result.status != "optimal":
        return {
            "job_id": job_id,
            "status": result.status,
            "error": result.error or f"Solver finalizo: {result.termination}",
        }

    dispatch_plan = _extract_dispatch_plan(
        pyo_model, variables, horizon, s_ids, scenarios, sources, storage_list
    )

    cost_breakdown = _extract_cost_breakdown(
        pyo_model, variables, horizon, s_ids, scenarios, sources, storage_list, grid_raw
    )

    battery_soc = _extract_battery_soc(pyo_model, variables, horizon, s_ids, storage_list)

    scenario_results = {}
    for si, s in enumerate(scenarios):
        scenario_total = 0.0
        for t in range(horizon):
            for di in range(variables.get("num_diesel", 0)):
                try:
                    scenario_total += float(pyo.value(variables["P_diesel"][di, t, si]))
                except (ValueError, KeyError, TypeError):
                    pass
            try:
                scenario_total += float(pyo.value(variables["P_grid"][t, si]))
            except (ValueError, KeyError):
                pass
        scenario_results[s["name"]] = {
            "probability": s["probability"],
            "total_power_kw": round(scenario_total, 2),
        }

    return {
        "job_id": job_id,
        "status": "optimal",
        "objective_value": round(result.objective, 2) if result.objective else None,
        "dispatch_plan": dispatch_plan,
        "cost_breakdown": cost_breakdown,
        "scenario_results": scenario_results,
        "battery_soc_evolution": battery_soc,
        "total_hours": horizon,
        "error": None,
    }


def _build_pyomo_model(
    horizon: int,
    time_step: int,
    scenarios: list,
    s_ids: list,
    predictions_solar: list,
    predictions_load_total: list,
    sources: list,
    storage_list: list,
    loads: list,
    grid_raw: dict,
) -> tuple[Any, dict]:
    """Construye el ConcreteModel de Pyomo.

    Modelo equivalente al script Gurobi de referencia:
      - Solar: entrada fija determinada por irradiancia (no es variable de decision)
      - Diesel: variable P_DG[t,s] con costo cuadratico (c + b*P + a*P^2) * C_fuel
      - Grid: variable P_grid[t,s] bidireccional [grid_min .. grid_max]
              costo: d + e*P_grid  (si P_grid < 0 genera revenue)
      - Balance: P_diesel + P_grid >= load - P_solar
    """

    model = pyo.ConcreteModel(name="SIGEMM_Optimization")

    model.T = pyo.RangeSet(0, horizon - 1)
    model.S = pyo.RangeSet(0, len(scenarios) - 1)

    solar_src = next((s for s in sources if s.get("type") == "solar"), None)
    solar_max_kw = solar_src.get("max_kw", 900) if solar_src else 900
    solar_eff = solar_src.get("efficiency", 0.4 * 0.9) if solar_src else (0.4 * 0.9)

    solar_devices = []
    for src in sources:
        if src.get("type") == "solar":
            solar_devices.append({
                "id": src.get("id", "solar"),
                "max_kw": src.get("max_kw", 900),
                "efficiency": src.get("efficiency", 0.4 * 0.9),
            })

    diesel_devices = []
    for src in sources:
        if src.get("type") == "diesel":
            diesel_devices.append({
                "id": src.get("id", "gen_unknown"),
                "max_kw": src.get("max_kw", 300),
                "min_kw": src.get("min_kw", 50),
                "cost_a": src.get("cost_a", 0.001),
                "cost_b": src.get("cost_b", 0.5),
                "cost_c": src.get("cost_c", 0.5),
                "fuel_cost": src.get("fuel_cost", 100),
            })

    num_diesel = len(diesel_devices)
    grid_max = grid_raw.get("max_import_kw", 400)
    grid_min = grid_raw.get("min_import_kw", -300)

    model.P_diesel = pyo.Var(
        pyo.RangeSet(0, num_diesel - 1) if num_diesel > 0 else pyo.RangeSet(0, 0),
        model.T, model.S,
        domain=pyo.Reals,
    )

    model.P_grid = pyo.Var(
        model.T, model.S,
        domain=pyo.Reals,
    )

    for di in range(num_diesel):
        d = diesel_devices[di]
        for t in model.T:
            for s in model.S:
                model.P_diesel[di, t, s].setlb(d["min_kw"])
                model.P_diesel[di, t, s].setub(d["max_kw"])

    for t in model.T:
        for s in model.S:
            model.P_grid[t, s].setlb(grid_min)
            model.P_grid[t, s].setub(grid_max)

    storage_vars = []
    if storage_list:
        model.P_charge = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1),
            model.T, model.S,
            domain=pyo.NonNegativeReals,
        )
        model.P_discharge = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1),
            model.T, model.S,
            domain=pyo.NonNegativeReals,
        )
        # Binary complementarity variables: at most one of charge/discharge
        # can be active per battery, period and scenario. This guarantees
        # physical feasibility (no simultaneous charge and discharge).
        model.Y_charge = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1),
            model.T, model.S,
            domain=pyo.Binary,
        )
        model.Y_discharge = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1),
            model.T, model.S,
            domain=pyo.Binary,
        )
        model.SOC = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1),
            model.T, model.S,
            domain=pyo.NonNegativeReals,
        )
        for bi, bat in enumerate(storage_list):
            storage_vars.append({
                "id": bat.get("id", f"bat_{bi}"),
                "capacity_kwh": bat.get("capacity_kwh", 100),
                "max_charge": bat.get("max_charge_kw", 25),
                "max_discharge": bat.get("max_discharge_kw", 25),
                "soc_min": bat.get("soc_min", 0.2),
                "soc_max": bat.get("soc_max", 0.95),
                "initial_soc": bat.get("initial_soc", 0.65),
                "charge_eff": bat.get("charge_efficiency", 0.95),
                "discharge_eff": bat.get("discharge_efficiency", 0.95),
            })

    for s_idx in s_ids:
        sc = scenarios[s_idx]
        factor_pv = sc["factor_pv"]

        for t in model.T:
            t_idx = int(t)
            irrad = predictions_solar[t_idx] if t_idx < len(predictions_solar) else 0.0

            pv_kw = sum(sd["max_kw"] * sd["efficiency"] * irrad * factor_pv for sd in solar_devices)

            diesel_total = (
                sum(model.P_diesel[di, t, s_idx] for di in range(num_diesel))
                if num_diesel > 0
                else 0.0
            )

            load_total = predictions_load_total[t_idx] if t_idx < len(predictions_load_total) else 0.0

            storage_discharge = sum(
                model.P_discharge[bi, t, s_idx] for bi, _ in enumerate(storage_list)
            ) if storage_list else 0.0

            storage_charge = sum(
                model.P_charge[bi, t, s_idx] for bi, _ in enumerate(storage_list)
            ) if storage_list else 0.0

            expr = diesel_total + model.P_grid[t, s_idx] + pv_kw + storage_discharge - storage_charge

            model.add_component(
                f"balance_{t}_{s_idx}",
                pyo.Constraint(expr=expr >= load_total),
            )

    if storage_list:
        for bi, bmeta in enumerate(storage_vars):
            for s in s_ids:
                cap = bmeta["capacity_kwh"]
                for t_idx, t in enumerate(model.T):
                    model.P_charge[bi, t, s].setub(bmeta["max_charge"])
                    model.P_discharge[bi, t, s].setub(bmeta["max_discharge"])
                    model.SOC[bi, t, s].setlb(bmeta["soc_min"] * cap)
                    model.SOC[bi, t, s].setub(bmeta["soc_max"] * cap)
                    # Complementarity: charge and discharge cannot occur at once.
                    model.add_component(
                        f"comp_{bi}_{t}_{s}",
                        pyo.Constraint(
                            expr=model.Y_charge[bi, t, s] + model.Y_discharge[bi, t, s] <= 1
                        ),
                    )
                    model.add_component(
                        f"ch_bound_{bi}_{t}_{s}",
                        pyo.Constraint(
                            expr=model.P_charge[bi, t, s] <= bmeta["max_charge"] * model.Y_charge[bi, t, s]
                        ),
                    )
                    model.add_component(
                        f"dis_bound_{bi}_{t}_{s}",
                        pyo.Constraint(
                            expr=model.P_discharge[bi, t, s] <= bmeta["max_discharge"] * model.Y_discharge[bi, t, s]
                        ),
                    )
                    if t_idx == 0:
                        model.add_component(
                            f"soc_init_{bi}_{s}",
                            pyo.Constraint(
                                expr=model.SOC[bi, t, s]
                                == bmeta["initial_soc"] * cap
                                + bmeta["charge_eff"] * model.P_charge[bi, t, s]
                                - model.P_discharge[bi, t, s] / bmeta["discharge_eff"]
                            ),
                        )
                    else:
                        t_prev = t - 1
                        model.add_component(
                            f"soc_{bi}_{t}_{s}",
                            pyo.Constraint(
                                expr=model.SOC[bi, t, s]
                                == model.SOC[bi, t_prev, s]
                                + bmeta["charge_eff"] * model.P_charge[bi, t, s]
                                - model.P_discharge[bi, t, s] / bmeta["discharge_eff"]
                            ),
                        )

    grid_d = grid_raw.get("cost_fixed", 40)
    grid_e = grid_raw.get("cost_variable", 60)

    def obj_rule(m):
        total = 0.0
        for s_idx in s_ids:
            prob = scenarios[s_idx]["probability"]
            for t in model.T:
                for di in range(num_diesel):
                    p = m.P_diesel[di, t, s_idx]
                    d = diesel_devices[di]
                    total += prob * diesel_cost(pyo, d, p)

                total += prob * (grid_d + grid_e * m.P_grid[t, s_idx])

                for bi, _ in enumerate(storage_list):
                    total += prob * battery_degradation_cost(
                        pyo, storage_list[bi] if bi < len(storage_list) else {},
                        m.P_charge[bi, t, s_idx],
                        m.P_discharge[bi, t, s_idx],
                    )
        return total

    model.obj = pyo.Objective(rule=obj_rule, sense=pyo.minimize)

    gen_vars = [
        {"id": d["id"], "idx": di, "type": "diesel"}
        for di, d in enumerate(diesel_devices)
    ]

    variables = {
        "gen_vars": gen_vars,
        "P_diesel": model.P_diesel if num_diesel > 0 else None,
        "P_grid": model.P_grid,
        "num_diesel": num_diesel,
        "solar_max_kw": solar_max_kw,
        "solar_eff": solar_eff,
        "solar_devices": solar_devices,
        "predictions_solar": predictions_solar,
        "predictions_load_total": predictions_load_total,
        "load_ids": [l.get("id", "load") for l in loads],
    }

    if storage_list:
        variables["storage_vars"] = storage_vars
        variables["P_charge"] = model.P_charge
        variables["P_discharge"] = model.P_discharge
        variables["SOC"] = model.SOC

    return model, variables


def _extract_dispatch_plan(
    model: Any,
    variables: dict,
    horizon: int,
    s_ids: list,
    scenarios: list,
    sources: list,
    storage_list: list,
) -> list[dict]:
    """Extrae el plan de despacho por hora y escenario."""
    plan = []
    num_diesel = variables.get("num_diesel", 0)

    for s_idx in s_ids:
        sc_name = scenarios[s_idx]["name"]
        for t in range(horizon):
            for di in range(num_diesel):
                gv = variables["gen_vars"][di]
                try:
                    val = float(pyo.value(variables["P_diesel"][di, t, s_idx]))
                except (ValueError, KeyError, TypeError):
                    val = 0.0
                plan.append({
                    "device_id": gv["id"],
                    "device_type": gv["type"],
                    "hour": t + 1,
                    "scenario": sc_name,
                    "power_kw": round(val, 3),
                    "cost": 0.0,
                })

            try:
                grid_val = float(pyo.value(variables["P_grid"][t, s_idx]))
            except (ValueError, KeyError):
                grid_val = 0.0

            if grid_val > 0.001:
                plan.append({
                    "device_id": "grid",
                    "device_type": "grid_import",
                    "hour": t + 1,
                    "scenario": sc_name,
                    "power_kw": round(grid_val, 3),
                    "cost": 0.0,
                })
            elif grid_val < -0.001:
                plan.append({
                    "device_id": "grid",
                    "device_type": "grid_export",
                    "hour": t + 1,
                    "scenario": sc_name,
                    "power_kw": round(grid_val, 3),
                    "cost": 0.0,
                })

            for bi, bmeta in enumerate(storage_list):
                try:
                    ch = float(pyo.value(variables["P_charge"][bi, t, s_idx]))
                except (ValueError, KeyError):
                    ch = 0.0
                try:
                    dch = float(pyo.value(variables["P_discharge"][bi, t, s_idx]))
                except (ValueError, KeyError):
                    dch = 0.0
                if ch > 0.001:
                    plan.append({
                        "device_id": bmeta.get("id", f"bat_{bi}"),
                        "device_type": "battery_charge",
                        "hour": t + 1,
                        "scenario": sc_name,
                        "power_kw": round(ch, 3),
                        "cost": 0.0,
                    })
                if dch > 0.001:
                    plan.append({
                        "device_id": bmeta.get("id", f"bat_{bi}"),
                        "device_type": "battery_discharge",
                        "hour": t + 1,
                        "scenario": sc_name,
                        "power_kw": round(dch, 3),
                        "cost": 0.0,
                    })

    solar_max_kw = variables.get("solar_max_kw", 0)
    solar_eff = variables.get("solar_eff", 0.36)
    solar_devices = variables.get("solar_devices", [])
    predictions_solar = variables.get("predictions_solar", [])
    predictions_load_total = variables.get("predictions_load_total", [])
    load_ids = variables.get("load_ids", ["load"])

    for s_idx in s_ids:
        sc = scenarios[s_idx]
        sc_name = sc["name"]
        factor_pv = sc["factor_pv"]
        for t in range(horizon):
            irrad = predictions_solar[t] if t < len(predictions_solar) else 0.0
            for sd in solar_devices:
                pv_kw = sd["max_kw"] * sd["efficiency"] * irrad * factor_pv
                if pv_kw > 0.001:
                    plan.append({
                        "device_id": sd["id"],
                        "device_type": "solar",
                        "hour": t + 1,
                        "scenario": sc_name,
                        "power_kw": round(pv_kw, 3),
                        "cost": 0.0,
                    })
            if t < len(predictions_load_total):
                ld = predictions_load_total[t]
                if ld > 0.001:
                    for l_id in load_ids:
                        plan.append({
                            "device_id": l_id,
                            "device_type": "load",
                            "hour": t + 1,
                            "scenario": sc_name,
                            "power_kw": round(ld, 3),
                            "cost": 0.0,
                        })

    return plan


def _extract_cost_breakdown(
    model: Any,
    variables: dict,
    horizon: int,
    s_ids: list,
    scenarios: list,
    sources: list,
    storage_list: list,
    grid_raw: dict,
) -> dict:
    num_diesel = variables.get("num_diesel", 0)
    grid_d = grid_raw.get("cost_fixed", 40)
    grid_e = grid_raw.get("cost_variable", 60)
    cost_per_hour = []

    for s_idx in s_ids:
        sc = scenarios[s_idx]
        for t in range(horizon):
            hour_cost = 0.0
            for di in range(num_diesel):
                gv = variables["gen_vars"][di]
                try:
                    p = float(pyo.value(variables["P_diesel"][di, t, s_idx]))
                except (ValueError, KeyError, TypeError):
                    p = 0.0
                a = 0.001
                b = 0.5
                c = 0.5
                fuel = 100
                diesel_devs = []
                for src in sources:
                    if src.get("type") == "diesel":
                        diesel_devs.append(src)
                if di < len(diesel_devs):
                    dd = diesel_devs[di]
                    a = dd.get("cost_a", 0.001)
                    b = dd.get("cost_b", 0.5)
                    c = dd.get("cost_c", 0.5)
                    fuel = dd.get("fuel_cost", 100)
                hour_cost += (c + b * p + a * p**2) * fuel

            try:
                grid_p = float(pyo.value(variables["P_grid"][t, s_idx]))
            except (ValueError, KeyError):
                grid_p = 0.0
            hour_cost += grid_d + grid_e * grid_p

            cost_per_hour.append({
                "hour": t + 1,
                "scenario": sc["name"],
                "probability": sc["probability"],
                "cost": round(hour_cost, 2),
                "weighted_cost": round(hour_cost * sc["probability"], 2),
            })

    return {"hourly": cost_per_hour}


def _extract_battery_soc(
    model: Any,
    variables: dict,
    horizon: int,
    s_ids: list,
    storage_list: list,
) -> dict:
    soc_data = {}
    for s_idx in s_ids:
        for bi, bmeta in enumerate(storage_list):
            bat_id = bmeta.get("id", f"bat_{bi}")
            if bat_id not in soc_data:
                soc_data[bat_id] = []
            try:
                vals = [float(pyo.value(variables["SOC"][bi, t, s_idx])) for t in range(horizon)]
            except (ValueError, KeyError):
                vals = [0.0] * horizon
            soc_data[bat_id].append({"scenario": f"s{s_idx}", "soc_kwh": vals})
    return soc_data
