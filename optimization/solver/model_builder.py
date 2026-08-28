import logging
import time
from typing import Any

import numpy as np
import pyomo.environ as pyo

from optimization.solver.cost_functions import battery_degradation_cost
from optimization.solver.scenarios import build_scenarios
from optimization.solver.solvers import solve, SolverResult

PW_DIESEL_N_PTS = 10
PW_DIESEL_BIGM = 1e6

logger = logging.getLogger(__name__)


def build_and_solve(input_data: dict[str, Any]) -> dict[str, Any]:
    job_id = input_data.get("job_id", "unknown")
    horizon = int(input_data.get("horizon", 24))
    time_step = int(input_data.get("time_step_minutes", 60))
    scenarios_raw = input_data.get("scenarios")
    predictions_solar = input_data.get("predictions_solar", [])
    predictions_load_total = input_data.get("predictions_load_total", [])
    predictions_pv_kw = input_data.get("predictions_pv_kw", [])
    predictions_pv_band = input_data.get("predictions_pv_band", [])
    predictions_wind_kw = input_data.get("predictions_wind_kw", [])
    predictions_wind_band = input_data.get("predictions_wind_band", [])
    sources = input_data.get("sources", [])
    storage_list = input_data.get("storage", [])
    loads = input_data.get("loads", [])
    grid_raw = input_data.get("grid", {})

    scenarios = build_scenarios(scenarios_raw)
    num_scenarios = len(scenarios)
    s_ids = list(range(num_scenarios))

    t_build0 = time.time()
    try:
        pyo_model, variables = _build_pyomo_model(
            horizon=horizon,
            time_step=time_step,
            scenarios=scenarios,
            s_ids=s_ids,
            predictions_solar=predictions_solar,
            predictions_load_total=predictions_load_total,
            predictions_pv_kw=predictions_pv_kw,
            predictions_pv_band=predictions_pv_band,
            predictions_wind_kw=predictions_wind_kw,
            predictions_wind_band=predictions_wind_band,
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
    t_build = time.time() - t_build0

    solver_pref = input_data.get("solver", "gurobi")
    t_solve0 = time.time()
    result: SolverResult = solve(pyo_model, preferred=solver_pref)
    t_solve = time.time() - t_solve0

    if result.status != "optimal":
        return {
            "job_id": job_id,
            "status": result.status,
            "error": result.error or f"Solver finalizo: {result.termination}",
            "timing_s": {"t_build": t_build, "t_solve": t_solve,
                         "t_total": t_build + t_solve},
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
                if "P_import" in variables:
                    imp = float(pyo.value(variables["P_import"][t, si]))
                    exp = float(pyo.value(variables["P_export"][t, si]))
                    scenario_total += imp - exp
                else:
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
        "timing_s": {"t_build": round(t_build, 4), "t_solve": round(t_solve, 4),
                     "t_total": round(t_build + t_solve, 4)},
        "error": None,
    }


def _build_pyomo_model(
    horizon: int,
    time_step: int,
    scenarios: list,
    s_ids: list,
    predictions_solar: list,
    predictions_load_total: list,
    predictions_pv_kw: list = None,
    predictions_pv_band: list = None,
    predictions_wind_kw: list = None,
    predictions_wind_band: list = None,
    sources: list = None,
    storage_list: list = None,
    loads: list = None,
    grid_raw: dict = None,
) -> tuple[Any, dict]:

    model = pyo.ConcreteModel(name="SIGE_Optimization")

    model.T = pyo.RangeSet(0, horizon - 1)
    model.S = pyo.RangeSet(0, len(scenarios) - 1)

    sources = sources or []
    storage_list = storage_list or []
    loads = loads or []
    grid_raw = grid_raw or {}
    predictions_solar = list(predictions_solar) if predictions_solar else []
    predictions_load_total = list(predictions_load_total) if predictions_load_total else []
    predictions_pv_kw = list(predictions_pv_kw) if predictions_pv_kw else []
    predictions_pv_band = list(predictions_pv_band) if predictions_pv_band else []
    predictions_wind_kw = list(predictions_wind_kw) if predictions_wind_kw else []
    predictions_wind_band = list(predictions_wind_band) if predictions_wind_band else []

    def _band_at(t: int, key: str, band: list = None) -> float:
        band = band if band is not None else predictions_pv_band
        if not band or t >= len(band):
            return 0.0
        b = band[t]
        if isinstance(b, dict):
            return float(b.get(key, b.get("P50", 0.0)))
        try:
            order = {"P10": 0, "P50": 1, "P90": 2}
            return float(b[order[key]])
        except (IndexError, TypeError):
            return 0.0

    SOLAR_TYPES = ("solar", "solar_panel_ac")

    solar_src = next((s for s in sources if s.get("type") in SOLAR_TYPES), None)
    solar_max_kw = solar_src.get("max_kw", 900) if solar_src else 900
    solar_eff = solar_src.get("efficiency", 0.4 * 0.9) if solar_src else (0.4 * 0.9)

    solar_devices = []
    for src in sources:
        if src.get("type") in SOLAR_TYPES:
            solar_devices.append({
                "id": src.get("id", "solar"),
                "max_kw": src.get("max_kw", 900),
                "efficiency": src.get("efficiency", 0.4 * 0.9),
                "weight": src.get("max_kw", 900) * src.get("efficiency", 0.4 * 0.9),
            })
    total_solar_kw = sum(d["weight"] for d in solar_devices) or 1.0

    WIND_TYPES = ("wind", "wind_turbine")
    wind_devices = []
    for src in sources:
        if src.get("type") in WIND_TYPES:
            wind_devices.append({
                "id": src.get("id", "wind"),
                "max_kw": src.get("max_kw", 100),
                "efficiency": src.get("efficiency", 0.4),
                "weight": src.get("max_kw", 100) * src.get("efficiency", 0.4),
            })
    total_wind_kw = sum(d["weight"] for d in wind_devices) or 1.0

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
    export_tariff = float(grid_raw.get("export_tariff", 0.0))
    ens_penalty = float(grid_raw.get("ens_penalty_cop_kwh", 5000.0))

    max_import = float(grid_max)
    max_export = float(-grid_min) if float(grid_min) < 0 else 0.0

    model.P_diesel = pyo.Var(
        pyo.RangeSet(0, num_diesel - 1) if num_diesel > 0 else pyo.RangeSet(0, 0),
        model.T, model.S,
        domain=pyo.NonNegativeReals,
    )
    if num_diesel > 0:
        model.U_diesel = pyo.Var(
            pyo.RangeSet(0, num_diesel - 1), model.T, model.S,
            domain=pyo.Binary,
        )

    model.P_import = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)
    model.P_export = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)
    model.ENS = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)
    model.CURT = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)

    if num_diesel > 0:
        for di in range(num_diesel):
            d = diesel_devices[di]
            for t in model.T:
                for s in model.S:
                    model.P_diesel[di, t, s].setub(d["max_kw"])
                    model.add_component(f"diesel_min_{di}_{t}_{s}",
                        pyo.Constraint(expr=model.P_diesel[di, t, s] >= d["min_kw"] * model.U_diesel[di, t, s]))
                    model.add_component(f"diesel_max_{di}_{t}_{s}",
                        pyo.Constraint(expr=model.P_diesel[di, t, s] <= d["max_kw"] * model.U_diesel[di, t, s]))

    for t in model.T:
        for s in model.S:
            model.P_import[t, s].setub(max_import if max_import > 0 else 1e6)
            if max_export > 0:
                model.P_export[t, s].setub(max_export)
            else:
                model.P_export[t, s].setub(0.0)
                model.P_export[t, s].fix(0.0)
            max_load = max(predictions_load_total) if predictions_load_total else 1000.0
            model.ENS[t, s].setub(max_load * 2)
            model.CURT[t, s].setub(1e6)

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
        model.Z = pyo.Var(
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

    pv_first_kw = 0.0
    wind_first_kw = 0.0
    for s_idx in s_ids:
        sc = scenarios[s_idx]
        factor_pv = sc["factor_pv"]
        factor_wind = sc.get("factor_wind", 1.0)

        for t in model.T:
            t_idx = int(t)
            irrad = predictions_solar[t_idx] if t_idx < len(predictions_solar) else 0.0

            if not solar_devices:
                pv_kw = 0.0
            elif predictions_pv_band:
                pv_kw = _band_at(t_idx, sc.get("quantile") or "P10",
                                 band=predictions_pv_band) * factor_pv
            elif predictions_pv_kw:
                pv_kw = (predictions_pv_kw[t_idx] if t_idx < len(predictions_pv_kw)
                         else 0.0) * factor_pv
            else:
                pv_kw = sum(sd["max_kw"] * sd["efficiency"] * irrad * factor_pv
                            for sd in solar_devices)
            if t_idx == 0 and s_idx == s_ids[0]:
                pv_first_kw = float(pv_kw)

            if not wind_devices:
                wind_kw = 0.0
            elif predictions_wind_band:
                wind_kw = _band_at(t_idx, sc.get("quantile") or "P10",
                                   band=predictions_wind_band) * factor_wind
            elif predictions_wind_kw:
                wind_kw = (predictions_wind_kw[t_idx] if t_idx < len(predictions_wind_kw)
                           else 0.0) * factor_wind
            else:
                wind_kw = 0.0
            if t_idx == 0 and s_idx == s_ids[0]:
                wind_first_kw = float(wind_kw)

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

            grid_net = model.P_import[t, s_idx] - model.P_export[t, s_idx]
            expr = (diesel_total + grid_net + pv_kw + wind_kw
                    + storage_discharge + model.ENS[t, s_idx]
                    - storage_charge - model.CURT[t, s_idx])

            model.add_component(
                f"balance_{t}_{s_idx}",
                pyo.Constraint(expr=expr == load_total),
            )
            model.add_component(
                f"exp_solo_pv_{t}_{s_idx}",
                pyo.Constraint(expr=model.P_export[t, s_idx] <= pv_kw + 1e-3),
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

        for bi, bmeta in enumerate(storage_vars):
            for s in s_ids:
                for t in model.T:
                    model.add_component(
                        f"comp_charge_{bi}_{t}_{s}",
                        pyo.Constraint(
                            expr=model.P_charge[bi, t, s]
                            <= bmeta["max_charge"] * model.Z[bi, t, s]
                        ),
                    )
                    model.add_component(
                        f"comp_discharge_{bi}_{t}_{s}",
                        pyo.Constraint(
                            expr=model.P_discharge[bi, t, s]
                            <= bmeta["max_discharge"] * (1 - model.Z[bi, t, s])
                        ),
                    )

    SOC_TERM_PEN = 300.0
    SOC_TARGET_FRAC = 0.65
    if storage_list:
        model.TERM_DEV_POS = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1), model.S,
            domain=pyo.NonNegativeReals,
        )
        model.TERM_DEV_NEG = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1), model.S,
            domain=pyo.NonNegativeReals,
        )
        for bi, bmeta in enumerate(storage_vars):
            cap = bmeta["capacity_kwh"]
            target = SOC_TARGET_FRAC * cap
            for s in s_ids:
                tH = horizon - 1
                model.add_component(
                    f"soc_term_pos_{bi}_{s}",
                    pyo.Constraint(expr=model.SOC[bi, tH, s] - target <= model.TERM_DEV_POS[bi, s]),
                )
                model.add_component(
                    f"soc_term_neg_{bi}_{s}",
                    pyo.Constraint(expr=target - model.SOC[bi, tH, s] <= model.TERM_DEV_NEG[bi, s]),
                )

    if len(s_ids) > 1:
        model.nonant = pyo.ConstraintList()
        s0 = s_ids[0]
        for t in (0,):
            if num_diesel > 0:
                for di in range(num_diesel):
                    for s in s_ids[1:]:
                        model.nonant.add(model.P_diesel[di, t, s0] == model.P_diesel[di, t, s])
                        model.nonant.add(model.U_diesel[di, t, s0] == model.U_diesel[di, t, s])
            for s in s_ids[1:]:
                model.nonant.add(model.P_import[t, s0] == model.P_import[t, s])
                model.nonant.add(model.P_export[t, s0] == model.P_export[t, s])
                for bi in range(len(storage_list)):
                    model.nonant.add(model.P_charge[bi, t, s0] == model.P_charge[bi, t, s])
                    model.nonant.add(model.P_discharge[bi, t, s0] == model.P_discharge[bi, t, s])
                    model.nonant.add(model.Z[bi, t, s0] == model.Z[bi, t, s])

    grid_d = grid_raw.get("cost_fixed", 40)
    grid_e_raw = grid_raw.get("cost_variable", 60)
    if isinstance(grid_e_raw, (list, tuple, np.ndarray)):
        grid_e = {int(t): float(grid_e_raw[t]) if t < len(grid_e_raw)
                  else float(grid_e_raw[-1]) for t in model.T}
    else:
        grid_e = {int(t): float(grid_e_raw) for t in model.T}

    if num_diesel > 0:
        model.DIESEL_COST = pyo.Var(model.P_diesel.index_set(),
                                    domain=pyo.NonNegativeReals, initialize=0.0)
        for di in range(num_diesel):
            d = diesel_devices[di]
            pts = [float(p) for p in np.linspace(0.0, d["max_kw"], PW_DIESEL_N_PTS)]
            vals = [(d["cost_b"] * p + d["cost_a"] * p ** 2) * d["fuel_cost"] for p in pts]
            for t in model.T:
                for s_idx in s_ids:
                    pw = pyo.Piecewise(
                        model.DIESEL_COST[di, t, s_idx],
                        model.P_diesel[di, t, s_idx],
                        pw_pts=pts, f_rule=vals,
                        pw_constr_type="EQ", pw_repn="MC",
                    )
                    model.add_component(f"pw_diesel_{di}_{t}_{s_idx}", pw)

    def obj_rule(m):
        total = 0.0
        for s_idx in s_ids:
            prob = scenarios[s_idx]["probability"]
            for t in model.T:
                if num_diesel > 0:
                    for di in range(num_diesel):
                        total += prob * m.DIESEL_COST[di, t, s_idx]
                        total += prob * diesel_devices[di]["cost_c"] * diesel_devices[di]["fuel_cost"] * m.U_diesel[di, t, s_idx]
                total += prob * (grid_d + grid_e[int(t)] * m.P_import[t, s_idx] - export_tariff * m.P_export[t, s_idx])
                total += prob * ens_penalty * m.ENS[t, s_idx]
                for bi, _ in enumerate(storage_list):
                    total += prob * battery_degradation_cost(
                        pyo, storage_list[bi] if bi < len(storage_list) else {},
                        m.P_charge[bi, t, s_idx],
                        m.P_discharge[bi, t, s_idx],
                    )
            if storage_list:
                for bi in range(len(storage_list)):
                    total += prob * SOC_TERM_PEN * (m.TERM_DEV_POS[bi, s_idx] + m.TERM_DEV_NEG[bi, s_idx])
        return total

    model.obj = pyo.Objective(rule=obj_rule, sense=pyo.minimize)

    gen_vars = [
        {"id": d["id"], "idx": di, "type": "diesel"}
        for di, d in enumerate(diesel_devices)
    ]

    variables = {
        "gen_vars": gen_vars,
        "P_diesel": model.P_diesel if num_diesel > 0 else None,
        "U_diesel": model.U_diesel if num_diesel > 0 else None,
        "DIESEL_COST": model.DIESEL_COST if num_diesel > 0 else None,
        "P_import": model.P_import,
        "P_export": model.P_export,
        "ENS": model.ENS,
        "CURT": model.CURT,
        "P_grid": None,
        "num_diesel": num_diesel,
        "diesel_devices": diesel_devices,
        "export_tariff": export_tariff,
        "ens_penalty": ens_penalty,
        "solar_max_kw": solar_max_kw,
        "solar_eff": solar_eff,
        "solar_devices": solar_devices,
        "predictions_solar": predictions_solar,
        "predictions_pv_kw": predictions_pv_kw,
        "predictions_pv_band": predictions_pv_band,
        "pv_balance_first_kw": pv_first_kw,
        "wind_devices": wind_devices,
        "predictions_wind_kw": predictions_wind_kw,
        "predictions_wind_band": predictions_wind_band,
        "wind_balance_first_kw": wind_first_kw,
        "predictions_load_total": predictions_load_total,
        "load_ids": [l.get("id", "load") for l in loads],
    }

    if storage_list:
        variables["storage_vars"] = storage_vars
        variables["P_charge"] = model.P_charge
        variables["P_discharge"] = model.P_discharge
        variables["Z"] = model.Z
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
                imp = float(pyo.value(variables["P_import"][t, s_idx]))
                exp = float(pyo.value(variables["P_export"][t, s_idx]))
                grid_val = imp - exp
            except (ValueError, KeyError):
                grid_val = 0.0
                imp = 0.0
                exp = 0.0

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
            if "ENS" in variables:
                try:
                    ens = float(pyo.value(variables["ENS"][t, s_idx]))
                    if ens > 0.001:
                        plan.append({
                            "device_id": "grid",
                            "device_type": "ens",
                            "hour": t + 1,
                            "scenario": sc_name,
                            "power_kw": round(ens, 3),
                            "cost": 0.0,
                        })
                except (ValueError, KeyError):
                    pass
            if "CURT" in variables:
                try:
                    curt = float(pyo.value(variables["CURT"][t, s_idx]))
                    if curt > 0.001:
                        plan.append({
                            "device_id": "curtailment",
                            "device_type": "curtailment",
                            "hour": t + 1,
                            "scenario": sc_name,
                            "power_kw": round(curt, 3),
                            "cost": 0.0,
                        })
                except (ValueError, KeyError):
                    pass

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

    solar_devices = variables.get("solar_devices", [])
    predictions_solar = variables.get("predictions_solar", [])
    predictions_pv_kw = variables.get("predictions_pv_kw", [])
    predictions_pv_band = variables.get("predictions_pv_band", [])
    wind_devices = variables.get("wind_devices", [])
    predictions_wind_kw = variables.get("predictions_wind_kw", [])
    predictions_wind_band = variables.get("predictions_wind_band", [])
    predictions_load_total = variables.get("predictions_load_total", [])
    load_ids = variables.get("load_ids", ["load"])
    total_solar_kw = sum(d.get("weight", 0.0) for d in solar_devices) or 1.0
    total_wind_kw = sum(d.get("weight", 0.0) for d in wind_devices) or 1.0

    def _band_at(t: int, key: str, band: list = None) -> float:
        band = band if band is not None else predictions_pv_band
        if not band or t >= len(band):
            return 0.0
        b = band[t]
        if isinstance(b, dict):
            return float(b.get(key, b.get("P50", 0.0)))
        try:
            order = {"P10": 0, "P50": 1, "P90": 2}
            return float(b[order[key]])
        except (IndexError, TypeError):
            return 0.0

    for s_idx in s_ids:
        sc = scenarios[s_idx]
        sc_name = sc["name"]
        factor_pv = sc["factor_pv"]
        factor_wind = sc.get("factor_wind", 1.0)
        for t in range(horizon):
            irrad = predictions_solar[t] if t < len(predictions_solar) else 0.0
            for sd in solar_devices:
                if predictions_pv_band:
                    pv_total = _band_at(t, "P50") * factor_pv
                    pv_kw = pv_total * sd.get("weight", 0.0) / total_solar_kw
                elif predictions_pv_kw:
                    pv_total = (predictions_pv_kw[t] if t < len(predictions_pv_kw)
                                else 0.0) * factor_pv
                    pv_kw = pv_total * sd.get("weight", 0.0) / total_solar_kw
                else:
                    pv_kw = sd["max_kw"] * sd["efficiency"] * irrad * factor_pv
                plan.append({
                    "device_id": sd["id"],
                    "device_type": "solar",
                    "hour": t + 1,
                    "scenario": sc_name,
                    "power_kw": round(pv_kw, 3) if pv_kw > 0.001 else 0.0,
                    "cost": 0.0,
                })
            for wd in wind_devices:
                if predictions_wind_band:
                    wind_total = _band_at(t, "P50", band=predictions_wind_band) * factor_wind
                    wind_kw = wind_total * wd.get("weight", 0.0) / total_wind_kw
                elif predictions_wind_kw:
                    wind_total = (predictions_wind_kw[t] if t < len(predictions_wind_kw)
                                  else 0.0) * factor_wind
                    wind_kw = wind_total * wd.get("weight", 0.0) / total_wind_kw
                else:
                    wind_kw = 0.0
                plan.append({
                    "device_id": wd["id"],
                    "device_type": "wind",
                    "hour": t + 1,
                    "scenario": sc_name,
                    "power_kw": round(wind_kw, 3) if wind_kw > 0.001 else 0.0,
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
    grid_e_raw = grid_raw.get("cost_variable", 60)
    export_tariff = float(grid_raw.get("export_tariff", 0.0))
    if isinstance(grid_e_raw, (list, tuple, np.ndarray)):
        def _grid_e(t):
            return float(grid_e_raw[t]) if t < len(grid_e_raw) \
                else float(grid_e_raw[-1])
    else:
        def _grid_e(t):
            return float(grid_e_raw)
    cost_per_hour = []

    for s_idx in s_ids:
        sc = scenarios[s_idx]
        for t in range(horizon):
            hour_cost = 0.0
            for di in range(num_diesel):
                try:
                    p = float(pyo.value(variables["P_diesel"][di, t, s_idx]))
                except (ValueError, KeyError, TypeError):
                    p = 0.0
                try:
                    u = float(pyo.value(variables["U_diesel"][di, t, s_idx])) if variables.get("U_diesel") is not None else (1.0 if p > 0.001 else 0.0)
                except (ValueError, KeyError, TypeError):
                    u = 0.0
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
                if p > 0.001 or u > 0.5:
                    hour_cost += (c + b * p + a * p**2) * fuel
                else:
                    hour_cost += 0.0

            try:
                imp = float(pyo.value(variables["P_import"][t, s_idx]))
                exp = float(pyo.value(variables["P_export"][t, s_idx]))
            except (ValueError, KeyError):
                imp = exp = 0.0
            hour_cost += grid_d + _grid_e(t) * imp - export_tariff * exp
            try:
                ens = float(pyo.value(variables["ENS"][t, s_idx]))
                hour_cost += float(grid_raw.get("ens_penalty_cop_kwh", 5000.0)) * ens
            except (ValueError, KeyError):
                pass

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
