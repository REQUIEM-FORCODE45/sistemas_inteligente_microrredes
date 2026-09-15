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
  - SoC_final [kWh]        = SOC de la ultima hora (lazo continuo: hereda dias)
  - Costo_normalizado       = Costo_total + (0.65*cap - SoC_final) * 80.
    NOTA METODOLOGICA: los costos crudos NO son comparables entre estrategias
    porque los estados finales difieren (p.ej. HEUR liquida su reserva y MPC-PI
    la acumula). La diferencia de inventario respecto a la referencia 0.65*cap
    se valora a 80 COP/kWh (tarifa media: reponer/ceder 1 kWh cuesta lo que la
    red media). Limitacion: no captura dinamica intra-periodo ni el valor pico
    de la reserva; solo iguala el punto de llegada para ordenar el ranking.
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

# Referencia de inventario para el costo normalizado (ver NOTA METODOLOGICA).
NORM_SOC_REF = 0.65          # fracción de capacidad (igual al SOC inicial común)
NORM_PRICE_COP_KWH = 80.0    # tarifa media ToU [COP/kWh]


def normalized_cost(cost_total_period: float, soc_final_kwh: float) -> float:
    """Costo con la reserva terminal igualada a la referencia.

    costo_norm = costo + (0.65*cap - SoC_final) * 80. Positivo si la estrategia
    dejó menos reserva que la referencia (debe "recomprarla"); negativo si
    dejó más (se le abona)."""
    cap = MICROGRID["battery"]["capacity_kwh"]
    return float(cost_total_period
                 + (NORM_SOC_REF * cap - soc_final_kwh) * NORM_PRICE_COP_KWH)


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


def summary_table(summaries: dict[str, dict],
                  soc_info: dict[str, dict] | None = None) -> pd.DataFrame:
    """Tabla: filas = estrategias, columnas = metricas (media +/- std).

    Columnas de costo: 'Costo total periodo (COP)' (Σ del periodo) y
    'Costo diario medio (COP) ± std' — valores DISTINTOS por diseno.
    `soc_info[strat_id]` = {"final": kWh, ...} (de la traza, sin re-simular);
    si se provee, añade 'SoC final (kWh)' y 'Costo normalizado (COP)'."""
    rows = []
    for strat_id, s in summaries.items():
        row = {
            "Estrategia": STRATEGY_LABELS.get(strat_id, strat_id),
            "Costo total periodo (COP)": f"{s['cost_total_period']:,.0f}",
            "Costo diario medio (COP) ± std": (
                f"{s['cost_total']:,.0f} ± {s['cost_total_std']:,.0f}"),
            "Uso renovables (%)": f"{s['renewable_share_pct']:.1f}",
            "Ciclos batería /día": f"{s['battery_cycles']:.2f}",
            "Importación red (kWh)": f"{s['energy_imported_kwh']:,.0f}",
            "Diésel (L)": f"{s['diesel_liters']:,.0f}",
            "Violaciones": str(s["violations_total"]),
        }
        if soc_info and strat_id in soc_info:
            fin = float(soc_info[strat_id]["final"])
            row["SoC final (kWh)"] = f"{fin:,.1f}"
            row["Costo normalizado (COP)"] = (
                f"{normalized_cost(s['cost_total_period'], fin):,.0f}")
        rows.append(row)
    return pd.DataFrame(rows)
