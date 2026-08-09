# -*- coding: utf-8 -*-
"""Experimento B — Tiempo de computo del MPC (R4).

Ejecuta >= 100 ciclos build+solve del modelo COMPLETO de produccion
(24 h, 3 escenarios anclados a cuantiles, MILP con binarias piecewise +
complementariedad big-M) y reporta p50/p95/p99/max de t_build/t_solve/
t_total, el margen vs el intervalo de control (900 s) y el hardware.

NOTA (H3): el modelo desplegado es un MILP, no un MIQP: el costo cuadratico
del diesel se linealiza por tramos (pyo.Piecewise, pw_repn="MC") para que la
licencia gratuita de Gurobi (size-limited) y el fallback HiGHS (sin QP) lo
resuelvan. Gurobi 13.0.2 con licencia pip (expira 2027-11-29).

Uso: python -m optimization.experiments.experiment_b_solver_time [--cycles 100]
"""
from __future__ import annotations

import argparse
import json
import platform
import socket
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from optimization.solver.model_builder import build_and_solve

OUT_DIR = Path(__file__).resolve().parents[2] / "results" / "pasto_narino" / "experiments"

# Topologia de produccion (24 h, 3 escenarios, MILP completo).
JOB = {
    "job_id": "expB", "horizon": 24, "time_step_minutes": 60,
    "predictions_solar": [],
    "predictions_load_total": [30.0 + 10 * (h % 12) for h in range(24)],
    "predictions_pv_band": [
        {"P10": 4.0 * max(0.0, 1 - abs(h - 12) / 6),
         "P50": 8.0 * max(0.0, 1 - abs(h - 12) / 6),
         "P90": 12.0 * max(0.0, 1 - abs(h - 12) / 6)}
        for h in range(24)
    ],
    "predictions_wind_kw": [],
    "predictions_wind_band": [],
    "sources": [
        {"id": "solar_1", "type": "solar", "max_kw": 50, "min_kw": 0,
         "efficiency": 1.0, "cost_a": 0, "cost_b": 0, "cost_c": 0,
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
    "loads": [{"id": "load_1", "type": "load", "max_kw": 1000, "min_kw": 0}],
    "grid": {"max_import_kw": 400, "max_export_kw": 300, "min_import_kw": -300,
             "cost_fixed": 40, "cost_variable": 80},
    "scenarios": None,
    "solver": "gurobi",
}


def hardware_report() -> dict:
    """Hardware y solvers declarados (requisito R4)."""
    try:
        cpu = platform.processor() or socket.gethostname()
    except Exception:  # noqa: BLE001
        cpu = "desconocido"
    try:
        import os
        nproc = os.cpu_count() or 1
        cores = f"{nproc} (4 threads disponibles)"
    except Exception:  # noqa: BLE001
        cores = "?"
    try:
        with open("/proc/meminfo") as fh:
            mem_kb = int([l for l in fh if l.startswith("MemTotal")][0]
                         .split()[1])
        ram_gb = round(mem_kb / 1024 / 1024, 1)
    except Exception:  # noqa: BLE001
        ram_gb = "?"
    import gurobipy
    import pyomo
    out = {
        "cpu": cpu, "cores": cores, "ram_gb": ram_gb,
        "python": platform.python_version(),
        "pyomo": pyomo.__version__ if hasattr(pyomo, "__version__")
                 else getattr(pyomo, "version", "?"),
        "gurobipy": ".".join(map(str, gurobipy.gurobi.version())),
        "gurobi_license": "pip comunity (expira 2027-11-29)",
        "highs": "1.15.1 (fallback)",
        "model_class": "MILP (diesel linealizado por tramos + complementariedad "
                       "big-M: 648+ binarias)",
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cycles", type=int, default=120)
    args = ap.parse_args()
    n = args.cycles
    assert n >= 100, "La especificacion exige >= 100 ciclos"

    build_t, solve_t, total_t = [], [], []
    statuses = []
    for i in range(n):
        t0 = time.time()
        out = build_and_solve(JOB)
        total_t.append(time.time() - t0)
        build_t.append(out.get("timing_s", {}).get("t_build", float("nan")))
        solve_t.append(out.get("timing_s", {}).get("t_solve", float("nan")))
        statuses.append(out.get("status"))
        if (i + 1) % 20 == 0:
            print(f"  ciclo {i + 1}/{n}: {out.get('status')} "
                  f"t_total={total_t[-1]:.3f}s", flush=True)

    ok = [s == "optimal" for s in statuses]
    if not all(ok):
        print(f"ATENCION: {sum(1 for s in ok if not s)} ciclos no-optimales")

    def _q(a, p):
        return float(np.percentile(a, p))

    rows = {
        "t_build": {"p50": _q(build_t, 50), "p95": _q(build_t, 95),
                    "p99": _q(build_t, 99), "max": float(max(build_t))},
        "t_solve": {"p50": _q(solve_t, 50), "p95": _q(solve_t, 95),
                    "p99": _q(solve_t, 99), "max": float(max(solve_t))},
        "t_total": {"p50": _q(total_t, 50), "p95": _q(total_t, 95),
                    "p99": _q(total_t, 99), "max": float(max(total_t))},
    }
    t_p95 = rows["t_total"]["p95"]
    rows["margen_vs_900s"] = {"p50": 900.0 / _q(total_t, 50),
                              "p95": 900.0 / t_p95,
                              "p99": 900.0 / _q(total_t, 99),
                              "max": 900.0 / max(total_t)}
    hw = hardware_report()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_csv(OUT_DIR / "expB_solver_times.csv")
    (OUT_DIR / "expB_hardware.json").write_text(
        json.dumps({"hardware": hw, "cycles": n,
                    "statuses_ok": sum(ok), "statuses_total": n},
                   indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n== Hardware declarado ==")
    for k, v in hw.items():
        print(f"  {k}: {v}")
    print(f"\n== Tiempos MPC ({n} ciclos, MILP 24h x 3 escenarios) ==")
    print(df.to_string())
    print(f"\nMargen de control: 900 s / t_p95 = {900 / t_p95:.0f}x")
    print(f"Salidas en {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
