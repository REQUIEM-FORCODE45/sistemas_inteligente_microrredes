# -*- coding: utf-8 -*-
"""Metricas economicas del Experimento A (especificacion del revisor).

Definiciones (evaluadas con valores REALIZADOS, no pronosticados):
  - Costo_total       = Σ_d Σ_t [ diesel_total_cost(P_d) + C_fijo
                         + C_var(t)*P_grid + deg*(P_ch + P_dis) ]
  - Costo_diario_medio = mean(Costo_total_d) +/- std
  - Tasa_uso_renovables = Σ energia PV consumida / Σ energia de carga * 100
  - Ciclos_bateria      = Σ (P_ch + P_dis) / (2 * Capacidad)  [equivalentes]
  - Energia_importada_red [kWh] = Σ max(P_grid, 0)
  - Combustible_diesel [L] = Σ (c + b*P_d + a*P_d^2)  (consumo horario)
  - Violaciones            = Σ horas con balance no satisfecho (debe ser 0)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from optimization.experiments.config import (MICROGRID, diesel_total_cost,
                                             tou_variable_tariff)

STRATEGY_LABELS = {
    "smpc": "S-MPC (estocástico, 3 escenarios)",
    "dmpc": "D-MPC (determinista, P50)",
    "heur": "HEUR (priority list)",
    "mpc-pi": "MPC-PI (información perfecta)",
    "oracle": "MPC-PI (información perfecta)",
}


def evaluate_day(trace: pd.DataFrame) -> dict:
    """Metricas de UN dia (sumas) a partir de la traza horaria."""
    b = MICROGRID["battery"]
    load_kwh = float(trace["load_real_kw"].sum())
    grid_import = trace["grid_kw"].clip(lower=0).sum()
    diesel_kwh = trace["diesel_kw"].sum()
    # Energia renovable que SIRVE a la carga, hora a hora (cap 100%):
    # PV + descarga de bateria (energia PV almacenada) cubriendo la carga.
    # Renovable no renovable importada o generada por diesel se excluye.
    renewable_served = float(np.minimum(
        trace["load_real_kw"].values,
        trace["pv_real_kw"].values + trace["discharge_kw"].values).sum())
    return {
        "cost_total": float(trace["cost_diesel"].sum()
                            + trace["cost_grid"].sum()
                            + trace["cost_battery"].sum()),
        "diesel_liters": float(sum(
            0.0 if d <= 0.001 else
            (MICROGRID["diesel"]["cost_c"]
             + MICROGRID["diesel"]["cost_b"] * d
             + MICROGRID["diesel"]["cost_a"] * d ** 2)
            for d in trace["diesel_kw"])),
        "energy_imported_kwh": float(grid_import),
        "energy_exported_kwh": float((-trace["grid_kw"].clip(upper=0)).sum()),
        "renewable_share_pct": (
            float(renewable_served / load_kwh * 100)
            if load_kwh > 0 else 0.0),
        "battery_cycles": float((trace["charge_kw"].sum()
                                 + trace["discharge_kw"].sum())
                                / (2 * b["capacity_kwh"])),
        "battery_throughput_kwh": float(trace["charge_kw"].sum()
                                        + trace["discharge_kw"].sum()),
        "violations": int(trace["violation"].sum()),
        "curtailed_kwh": float(trace["curtailed_kw"].sum()),
        "load_kwh": load_kwh,
        "pv_kwh": float(trace["pv_real_kw"].sum()),
    }


def summarize(days: dict[str, dict]) -> dict:
    """Agrega las metricas de todos los dias de una estrategia.

    `cost_total_period` = SUMA real del periodo (especificacion del revisor:
    Costo_total = Σ_d Σ_t [...]). `cost_total` = media diaria (para la
    columna 'diario medio +/- std')."""
    rows = list(days.values())
    df = pd.DataFrame(rows)
    out = {"n_days": len(df)}
    for col in df.columns:
        if col == "violations":
            out["violations_total"] = int(df[col].sum())
        elif col == "cost_total":
            out["cost_total_period"] = float(df[col].sum())
            out["cost_total"] = float(df[col].mean())
            out["cost_total_std"] = float(df[col].std())
        elif col in ("curtailed_kwh", "load_kwh", "pv_kwh",
                     "battery_throughput_kwh", "energy_exported_kwh"):
            out[col] = float(df[col].sum())
        else:
            out[col] = float(df[col].mean())
            out[f"{col}_std"] = float(df[col].std())
    return out


def summary_table(summaries: dict[str, dict]) -> pd.DataFrame:
    """Tabla: filas = estrategias, columnas = metricas (media +/- std).

    Columnas de costo: 'Costo total periodo (COP)' (Σ del periodo) y
    'Costo diario medio (COP) ± std' — valores DISTINTOS por diseno."""
    rows = []
    for strat_id, s in summaries.items():
        rows.append({
            "Estrategia": STRATEGY_LABELS.get(strat_id, strat_id),
            "Costo total periodo (COP)": f"{s['cost_total_period']:,.0f}",
            "Costo diario medio (COP) ± std": (
                f"{s['cost_total']:,.0f} ± {s['cost_total_std']:,.0f}"),
            "Uso renovables (%)": f"{s['renewable_share_pct']:.1f}",
            "Ciclos batería /día": f"{s['battery_cycles']:.2f}",
            "Importación red (kWh)": f"{s['energy_imported_kwh']:,.0f}",
            "Diésel (L)": f"{s['diesel_liters']:,.0f}",
            "Violaciones": str(s["violations_total"]),
        })
    return pd.DataFrame(rows)
