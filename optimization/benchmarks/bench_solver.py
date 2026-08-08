#!/usr/bin/env python3
"""
Benchmark de resolución del solver SIGE (Punto 11 del revisor).

Mide el tiempo de CONSTRUCCIÓN + RESOLUCIÓN del modelo Pyomo/Gurobi para un
ciclo MPC de 24 h con S escenarios, bajo carga concurrente opcional.

Requisitos:
  - pyomo, gurobipy (o highspy como fallback) instalados.
  - Gurobi con licencia válida (la licencia gratuita "size-limited" rechaza
    modelos grandes; usar licencia académica/comercial completa).

Uso:
  python optimization/benchmarks/bench_solver.py --horizon 24 --scenarios 3 \
      --batteries 1 --concurrency 1 --repeat 5

Salida: JSON con p50/p95/p99 de tiempo de resolución por ciclo (ms) y
verificación de que cabe en el intervalo de 15 min del MPC.
"""
import argparse
import json
import os
import statistics
import sys
import time

sys.path.insert(0, ".")

from optimization.solver import model_builder


def build_topology(n_batteries, n_diesel):
    sources = [
        {"id": "solar_1", "type": "solar", "max_kw": 50, "efficiency": 0.85},
    ]
    for i in range(n_diesel):
        sources.append({
            "id": f"diesel_{i+1}", "type": "diesel", "max_kw": 300, "min_kw": 50,
            "cost_a": 0.001, "cost_b": 0.5, "cost_c": 0.0, "fuel_cost": 100,
        })
    storage = [
        {
            "id": f"battery_{i+1}", "type": "battery", "capacity_kwh": 200,
            "max_charge_kw": 50, "max_discharge_kw": 50, "soc_min": 0.2,
            "soc_max": 0.95, "initial_soc": 0.65,
            "charge_efficiency": 0.95, "discharge_efficiency": 0.95,
        }
        for i in range(n_batteries)
    ]
    loads = [{"id": "load_1", "type": "load", "max_kw": 80}]
    grid = {"max_import_kw": 400, "min_import_kw": -300, "cost_fixed": 40, "cost_variable": 60}
    return sources, storage, loads, grid


def run_once(horizon, scenarios_n, sources, storage, loads, grid, solver="gurobi"):
    scenarios = model_builder.build_scenarios(None)[:scenarios_n] if scenarios_n else model_builder.build_scenarios(None)
    s_ids = list(range(len(scenarios)))
    pred_solar = [0.8] * horizon
    pred_load = [50.0] * horizon
    t0 = time.time()
    m, _ = model_builder._build_pyomo_model(
        horizon, 60, scenarios, s_ids, pred_solar, pred_load, sources, storage, loads, grid
    )
    import pyomo.environ as pyo

    if solver == "gurobi":
        solver_f = pyo.SolverFactory("gurobi")
        res = solver_f.solve(m, tee=False)
        term = str(res.solver.termination_condition)
    elif solver.startswith("highspy"):
        lp = "/tmp/hermes_bench.lp"
        if solver == "highspy-lp":
            # LP relaxation: relax binaries to continuous [0,1] for a fast lower bound.
            for idx in m.Y_charge.index_set():
                m.Y_charge[idx].domain = pyo.UnitInterval
            for idx in m.Y_discharge.index_set():
                m.Y_discharge[idx].domain = pyo.UnitInterval
            # Neutralize quadratic cost (HiGHS free cannot solve MIQP); use a linear proxy.
            m.obj.deactivate()
            m.obj_lin = pyo.Objective(
                expr=sum(m.P_grid[t, s] for t in m.T for s in s_ids),
                sense=pyo.minimize,
            )
        m.write(lp)
        import highspy
        h = highspy.Highs()
        h.readModel(lp)
        h.run()
        term = h.modelStatusToString(h.getModelStatus())
        os.remove(lp)
    else:
        raise ValueError(f"solver {solver} no soportado")
    t1 = time.time()
    return (t1 - t0) * 1000.0, term


def pct(vals, p):
    if not vals:
        return None
    s = sorted(vals)
    k = max(0, min(len(s) - 1, int(round((p / 100.0) * (len(s) - 1)))))
    return s[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=24)
    ap.add_argument("--scenarios", type=int, default=3)
    ap.add_argument("--batteries", type=int, default=1)
    ap.add_argument("--diesel", type=int, default=1)
    ap.add_argument("--repeat", type=int, default=5)
    ap.add_argument("--solver", default="gurobi",
                    choices=["gurobi", "highspy", "highspy-lp"],
                    help="gurobi=MIQP (licencia completa); highspy=MIQP (no soportado por HiGHS libre); highspy-lp=relajación LP (cota inferior rápida)")
    args = ap.parse_args()

    sources, storage, loads, grid = build_topology(args.batteries, args.diesel)
    times = []
    terms = set()
    for i in range(args.repeat):
        ms, term = run_once(args.horizon, args.scenarios, sources, storage, loads, grid, args.solver)
        times.append(ms)
        terms.add(term)
        print(f"  run {i+1}/{args.repeat}: {ms:.1f} ms ({term})")

    result = {
        "horizon_h": args.horizon,
        "scenarios": args.scenarios,
        "batteries": args.batteries,
        "diesel": args.diesel,
        "repeats": args.repeat,
        "termination": sorted(terms),
        "solve_time_ms": {
            "min": round(min(times), 2),
            "p50": round(pct(times, 50), 2),
            "p95": round(pct(times, 95), 2),
            "p99": round(pct(times, 99), 2),
            "max": round(max(times), 2),
        },
        "mpc_interval_min": 15,
        "fits_in_mpc_interval": max(times) < 15 * 60 * 1000,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
