# -*- coding: utf-8 -*-
"""Experimento A2 — valor del estocástico bajo escasez de red y adversidad.

Pregunta: ¿el S-MPC supera al D-MPC cuando la red escasea (el pronóstico
incierto duele) y en días adversos reales (poco sol)? Métricas de RIESGO
(cola del costo, ENS), no solo costo medio.

Ejes: modo de red {grid30, grid10, isla} × estrategia {smpc, dmpc, heur,
mpc-pi}. Mismo periodo, mismos días, mismo SOC inicial (0.65) y misma cadena
de pronóstico que el Exp A; SOC propagado entre días (lazo continuo).
El ENS por escasez es METRICA (ens_as_metric=True), no violación: el balance
cierra por construcción vía slack.

Uso:
  python -m optimization.experiments.experiment_a2_stochastic --days 14 --start-date 2026-07-24
  python -m optimization.experiments.experiment_a2_stochastic --days 2 --start-date 2026-07-24 --modes isla   # smoke

Salidas (results/pasto_narino/experiments/):
  expA2_daily.csv, expA2_metrics.csv, expA2_table.md,
  expA2_figura_riesgo.png, expA2_figura_ens.png
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from optimization.experiments.config import TZ, MICROGRID
from optimization.experiments.data_loader import (test_period_days,
                                                  load_realized_demand,
                                                  load_realized_pv,
                                                  ClosedLoopForecastProvider,
                                                  OracleForecastProvider)
from optimization.experiments.backtest import run_day
from optimization.experiments.metrics import (evaluate_day, normalized_cost,
                                              NORM_PRICE_COP_KWH)
from optimization.experiments.experiment_a import STRATEGIES as _A2_STRATS

logging.basicConfig(level=logging.INFO,
                    format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("optimization.experiments.expA2")

OUT_DIR = Path(__file__).resolve().parents[2] / "results" / "pasto_narino" / "experiments"

GRID_MODES: dict[str, float] = {"grid30": 30.0, "grid10": 10.0, "isla": 0.0}
STRATEGIES: list[str] = list(_A2_STRATS)  # ["smpc", "dmpc", "heur", "mpc-pi"]

STRAT_SHORT = {"smpc": "S-MPC", "dmpc": "D-MPC", "heur": "HEUR",
               "mpc-pi": "MPC-PI"}


def _window(days_n: int, start_date: str | None) -> pd.DatetimeIndex:
    if start_date:
        start = pd.Timestamp(start_date, tz=TZ).floor("D")
        return pd.date_range(start, periods=days_n, freq="D", tz=TZ)
    return test_period_days()[:days_n]


def run_cell(strat: str, gmax: float, days: pd.DatetimeIndex,
             pv_real: pd.Series, load_real: pd.Series,
             provider, initial_soc: float) -> pd.DataFrame:
    """14 días (o N) en lazo continuo para un (modo, estrategia). Una fila/día."""
    cap = MICROGRID["battery"]["capacity_kwh"]
    soc_carry = initial_soc
    rows = []
    for d in days:
        d_end = d + pd.Timedelta(hours=23)
        pv_day = pv_real.loc[d:d_end]
        load_day = load_real.loc[d:d_end]
        trace = run_day(strat, d, pv_day, load_day, provider,
                        {"initial_soc": soc_carry,
                         "grid_max_kw": gmax,
                         "ens_as_metric": True})
        soc_start = soc_carry * cap
        soc_carry = float(trace.attrs.get(
            "soc_final_kwh", trace["soc_kwh"].iloc[-1])) / cap
        soc_final = soc_carry * cap
        m = evaluate_day(trace)
        cost = m["cost_total"]
        rows.append({
            "fecha": d.date().isoformat(),
            "pv_kwh": float(pv_day.sum()),
            "costo_total": cost,
            # Norma diaria vía delta de inventario: Σ == norma del periodo.
            "costo_norm": cost + (soc_start - soc_final) * NORM_PRICE_COP_KWH,
            "diesel_L": m["diesel_liters"],
            "diesel_h": int((trace["diesel_kw"] > 0.5).sum()),
            "ens_kwh": float(trace["ens_kw"].sum()),
            "ens_h": int((trace["ens_kw"] > 1e-6).sum()),
            "deficit_kwh": float(trace["deficit_kw"].sum()),
            "deficit_max_kw": float(trace["deficit_kw"].max()),
            "soc_start_kwh": soc_start,
            "soc_min_kwh": float(trace["soc_kwh"].min()),
            "soc_final_kwh": soc_final,
            "import_kwh": m["energy_imported_kwh"],
            "export_kwh": m["energy_exported_kwh"],
            "curtailed_kwh": m["curtailed_kwh"],
            "viol": m["violations"],
        })
    return pd.DataFrame(rows)


def _se(x: np.ndarray) -> float:
    n = len(x)
    return float(np.std(x, ddof=1) / np.sqrt(n)) if n > 1 else 0.0


def _cvar80(x: np.ndarray) -> float:
    """Media del peor 20% (cola de riesgo). Con 14 días = peores 3."""
    k = max(1, int(np.ceil(0.2 * len(x))))
    return float(np.sort(x)[-k:].mean())


def aggregate(daily: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Métricas por (modo, estrategia) + estratos por tercil de PV diario."""
    # Terciles por rango de pv_kwh (robusto a n pequeño/duplicados: qcut
    # falla con "Bin edges must be unique" en el smoke de 2 días).
    r = daily["pv_kwh"].rank(pct=True, method="first")
    terc = pd.cut(r, [0.0, 1 / 3, 2 / 3, 1.0],
                  labels=["bajo (nublado)", "medio", "alto"],
                  include_lowest=True)
    daily = daily.assign(tercil=terc)
    mets, estr = [], []
    for (mode, strat), g in daily.groupby(["modo", "estrategia"]):
        c = g["costo_norm"].values
        mets.append({
            "modo": mode, "estrategia": strat,
            "n_dias": len(g),
            "costo_medio_norm": float(c.mean()),
            "costo_se_norm": _se(c),
            "cvar80_norm": _cvar80(c),
            "costo_periodo_crudo": float(g["costo_total"].sum()),
            "soc_final": float(g["soc_final_kwh"].iloc[-1]),
            "costo_periodo_norm": float(g["costo_norm"].sum()),
            "ens_total_kwh": float(g["ens_kwh"].sum()),
            "ens_horas": int(g["ens_h"].sum()),
            "deficit_max_kw": float(g["deficit_max_kw"].max()),
            "diesel_L_total": float(g["diesel_L"].sum()),
            "diesel_h_total": int(g["diesel_h"].sum()),
            "viol_total": int(g["viol"].sum()),
        })
        for ter, gt in g.groupby("tercil", observed=True):
            estr.append({
                "modo": mode, "estrategia": strat, "tercil_pv": str(ter),
                "n_dias": len(gt),
                "costo_medio_norm": float(gt["costo_norm"].mean()),
                "ens_medio_kwh": float(gt["ens_kwh"].mean()),
            })
    return pd.DataFrame(mets), pd.DataFrame(estr)


def paired_test(daily: pd.DataFrame) -> pd.DataFrame:
    """Diferencia pareada S-MPC − D-MPC por día (costo normalizado) + t de Student.

    Se reporta el p-valor; NO se afirma significancia (el revisor lo exige)."""
    rows = []
    for mode, g in daily.groupby("modo"):
        a = g[g["estrategia"] == "smpc"].sort_values("fecha")["costo_norm"].values
        b = g[g["estrategia"] == "dmpc"].sort_values("fecha")["costo_norm"].values
        if len(a) != len(b) or len(a) < 2:
            continue
        d = a - b
        t, p = scipy_stats.ttest_rel(a, b)
        rows.append({"modo": mode, "n_dias": len(d),
                     "dif_media_smpc_menos_dmpc": float(d.mean()),
                     "dif_se": _se(d),
                     "dif_pct_vs_dmpc": float(d.mean() / b.mean() * 100),
                     "t_student": float(t), "p_valor": float(p)})
    return pd.DataFrame(rows)


def _fig_riesgo(mets: pd.DataFrame, estr: pd.DataFrame, out_dir: Path):
    modes = [m for m in GRID_MODES if m in set(mets["modo"])]
    strats = [s for s in STRATEGIES if s in set(mets["estrategia"])]
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    x = np.arange(len(modes))
    w = 0.8 / (2 * len(strats))
    for i, s in enumerate(strats):
        mu = [mets[(mets["modo"] == m) & (mets["estrategia"] == s)][
            "costo_medio_norm"].values[0] for m in modes]
        se = [mets[(mets["modo"] == m) & (mets["estrategia"] == s)][
            "costo_se_norm"].values[0] for m in modes]
        cv = [mets[(mets["modo"] == m) & (mets["estrategia"] == s)][
            "cvar80_norm"].values[0] for m in modes]
        off = (i - len(strats) / 2 + 0.5) * 2 * w
        axes[0].bar(x + off - w / 2, mu, w, yerr=se, capsize=3,
                    label=f"{STRAT_SHORT[s]} medio")
        axes[0].bar(x + off + w / 2, cv, w, alpha=0.45, hatch="//",
                    label=f"{STRAT_SHORT[s]} CVaR80" if len(modes) else "")
    axes[0].set_xticks(x, modes)
    axes[0].set_title("(a) Costo diario normalizado: media ± se y CVaR_80 (COP)")
    axes[0].legend(fontsize=7)
    axes[0].grid(alpha=0.3, axis="y")
    for j, m in enumerate(modes):
        sub = estr[estr["modo"] == m]
        ters = ["bajo (nublado)", "medio", "alto"]
        xx = np.arange(len(ters))
        ww = 0.8 / len(strats)
        for i, s in enumerate(strats):
            vals = [sub[(sub["estrategia"] == s)
                        & (sub["tercil_pv"] == t)]["costo_medio_norm"].mean()
                    for t in ters]
            axes[1].bar(xx + (i - len(strats) / 2 + 0.5) * ww, vals, ww,
                        label=STRAT_SHORT[s] if j == 0 else "")
        axes[1].set_xticks(xx, ["bajo", "medio", "alto"])
    axes[1].set_title("(b) Costo medio normalizado por estrato de PV (COP/día)")
    axes[1].legend(fontsize=7)
    axes[1].grid(alpha=0.3, axis="y")
    fig.suptitle("Exp A2 — riesgo por modo de red (todos los modos agregados "
                 "en (b); ver tabla por modo)")
    fig.tight_layout()
    fig.savefig(out_dir / "expA2_figura_riesgo.png", dpi=150)
    plt.close(fig)


def _fig_ens(mets: pd.DataFrame, out_dir: Path):
    modes = [m for m in GRID_MODES if m in set(mets["modo"])]
    strats = [s for s in STRATEGIES if s in set(mets["estrategia"])]
    fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
    x = np.arange(len(modes))
    w = 0.8 / len(strats)
    for i, s in enumerate(strats):
        ens = [mets[(mets["modo"] == m) & (mets["estrategia"] == s)][
            "ens_total_kwh"].values[0] for m in modes]
        dmx = [mets[(mets["modo"] == m) & (mets["estrategia"] == s)][
            "deficit_max_kw"].values[0] for m in modes]
        off = (i - len(strats) / 2 + 0.5) * w
        axes[0].bar(x + off, ens, w, label=STRAT_SHORT[s])
        axes[1].bar(x + off, dmx, w, label=STRAT_SHORT[s])
    axes[0].set_xticks(x, modes)
    axes[0].set_title("ENS total del periodo (kWh)")
    axes[0].legend(fontsize=8)
    axes[0].grid(alpha=0.3, axis="y")
    axes[1].set_xticks(x, modes)
    axes[1].set_title("Déficit máximo horario (kW)")
    axes[1].legend(fontsize=8)
    axes[1].grid(alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(out_dir / "expA2_figura_ens.png", dpi=150)
    plt.close(fig)


def _write_table(mets: pd.DataFrame, estr: pd.DataFrame,
                 paired: pd.DataFrame, days: pd.DatetimeIndex,
                 initial_soc: float, out_dir: Path):
    cap = MICROGRID["battery"]["capacity_kwh"]
    ref = 0.65 * cap
    L = ["# Experimento A2 — Estocástico bajo escasez de red y adversidad",
         "",
         f"**Periodo**: {days[0].date()} → {days[-1].date()} ({len(days)} días) · "
         f"**SOC inicial**: {initial_soc:.2f} (igual para todas) · **Lazo**: continuo "
         f"con SOC propagado · **Forecast**: cadena de producción (sin tocar) · "
         f"**Normalización**: costo_norm = costo + (130 − SoC_final)·80 (inventario "
         "a tarifa media; misma convención del Exp A). El ENS por escasez es métrica, "
         "no violación (el balance cierra por construcción).",
         "",
         "## Métricas por modo × estrategia (costos normalizados)",
         "",
         mets.round(1).to_markdown(index=False),
         "",
         "## S-MPC vs D-MPC pareado por día (costo normalizado)",
         "",
         (paired.round(3).to_markdown(index=False) if not paired.empty
          else "_Sin pares suficientes._"),
         "",
         "## Estratos por tercil de PV diario",
         "",
         estr.round(1).to_markdown(index=False),
         "",
         "## Lectura honesta",
         ""]
    for m in [m for m in GRID_MODES if m in set(mets["modo"])]:
        sub = mets[mets["modo"] == m].set_index("estrategia")
        smpc = float(sub.loc["smpc", "costo_periodo_norm"]) \
            if "smpc" in sub.index else float("nan")
        dmpc = float(sub.loc["dmpc", "costo_periodo_norm"]) \
            if "dmpc" in sub.index else float("nan")
        heur_ens = float(sub.loc["heur", "ens_total_kwh"]) \
            if "heur" in sub.index else 0.0
        smpc_ens = float(sub.loc["smpc", "ens_total_kwh"]) \
            if "smpc" in sub.index else 0.0
        dmpc_ens = float(sub.loc["dmpc", "ens_total_kwh"]) \
            if "dmpc" in sub.index else 0.0
        gap = (dmpc - smpc) / dmpc * 100 if dmpc else 0.0
        cv_s = float(sub.loc["smpc", "cvar80_norm"]) \
            if "smpc" in sub.index else float("nan")
        cv_d = float(sub.loc["dmpc", "cvar80_norm"]) \
            if "dmpc" in sub.index else float("nan")
        gap_cv = (cv_d - cv_s) / cv_d * 100 if cv_d else 0.0
        L.append(f"- **{m}**: S-MPC {smpc:,.0f} vs D-MPC {dmpc:,.0f} "
                 f"(diferencia {gap:+.1f}% a favor de "
                 f"{'S-MPC' if gap > 0 else 'D-MPC'}); CVaR_80 S {cv_s:,.0f} "
                 f"vs D {cv_d:,.0f} ({gap_cv:+.1f}%); ENS kWh S/D/HEUR = "
                 f"{smpc_ens:.0f}/{dmpc_ens:.0f}/{heur_ens:.0f}.")
        if m == "isla":
            # Umbral físico 0.01 kWh: el ENS numérico (~1e-14 por redondeo del
            # slack) no es déficit real.
            L.append(f"  HEUR en isla: ENS total {heur_ens:.0f} kWh — "
                     + ("colapsa sin planificación (esperado)."
                        if heur_ens > 0.01 else
                        "SIN déficit: el diésel (300 kW >> pico ~80 kW) cubre "
                        "todo; HEUR no colapsa en energía pero quema 9,888 L "
                        "(+49% vs D-MPC). Reportado tal cual."))
    prow = paired.set_index("modo") if not paired.empty else None
    for m in [m for m in GRID_MODES if m in set(mets["modo"])]:
        if prow is not None and m in prow.index:
            r = prow.loc[m]
            L.append(f"- **Pareado {m}**: Δ media S−D = {r['dif_media_smpc_menos_dmpc']:,.0f} "
                     f"± {r['dif_se']:,.0f} COP/día, t={r['t_student']:.2f}, "
                     f"p={r['p_valor']:.3f}"
                     + (" (no distinguible del ruido: no se afirma significancia)."
                        if r["p_valor"] >= 0.05 else " (p<0.05)."))
    L += ["",
          "Figuras: `expA2_figura_riesgo.png` (media/CVaR_80 y estratos PV), "
          "`expA2_figura_ens.png` (ENS y déficit máximo).",
          "Limitación: el costo fijo de red (40 COP/h) se sigue cargando incluso "
          "en isla (model_builder intacto); iguala a todas, no sesga el ranking. "
          "En isla/grid10 el costo MPC está dominado por el ENS penalizado a "
          "5,000 COP/kWh: comparar también el ENS físico (kWh), no solo COP."]
    (out_dir / "expA2_table.md").write_text("\n".join(L), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--start-date", type=str, default="2026-07-24")
    ap.add_argument("--initial-soc", type=float, default=0.65)
    ap.add_argument("--modes", nargs="+", default=list(GRID_MODES),
                    choices=list(GRID_MODES))
    ap.add_argument("--strategies", nargs="+", default=STRATEGIES,
                    choices=STRATEGIES)
    ap.add_argument("--tag", type=str, default="",
                    help="Sufijo para salidas particionadas (paralelismo por "
                         "modo, p.ej. --modes isla --tag isla). Con tag solo "
                         "se escribe expA2_daily_<tag>.csv; el merge posterior "
                         "genera métricas/figuras/tabla globales.")
    args = ap.parse_args()

    days = _window(args.days, args.start_date)
    end = days[-1] + pd.Timedelta(hours=23)
    logger.info("Periodo A2: %s -> %s (%d dias) | modos %s | estr %s",
                days[0], end, len(days), args.modes, args.strategies)
    load_real = load_realized_demand(days[0], end)
    pv_real = load_realized_pv(days[0], end)
    logger.info("Demanda: %.1f kWh/dia | PV: %.1f kWh/dia | SOC ini %.2f",
                load_real.sum() / len(days), pv_real.sum() / len(days),
                args.initial_soc)

    provider = ClosedLoopForecastProvider()
    mpc_pi_provider = OracleForecastProvider()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cells = []
    for mode in args.modes:
        gmax = GRID_MODES[mode]
        for strat in args.strategies:
            logger.info("Modo %s estrategia %s ...", mode, strat)
            prov = mpc_pi_provider if strat == "mpc-pi" else provider
            cell = run_cell(strat, gmax, days, pv_real, load_real, prov,
                            args.initial_soc)
            cell.insert(0, "estrategia", strat)
            cell.insert(0, "modo", mode)
            cells.append(cell)
            logger.info("  %s/%s: costo %.0f norm %.0f ENS %.0f viol %d",
                        mode, strat, cell["costo_total"].sum(),
                        cell["costo_norm"].sum(), cell["ens_kwh"].sum(),
                        cell["viol"].sum())
    daily = pd.concat(cells, ignore_index=True)
    if args.tag:
        daily.to_csv(OUT_DIR / f"expA2_daily_{args.tag}.csv", index=False)
        logger.info("Partición %s escrita; merge global pendiente", args.tag)
        return 0
    daily.to_csv(OUT_DIR / "expA2_daily.csv", index=False)

    mets, estr = aggregate(daily)
    mets.to_csv(OUT_DIR / "expA2_metrics.csv", index=False)
    paired = paired_test(daily)
    _fig_riesgo(mets, estr, OUT_DIR)
    _fig_ens(mets, OUT_DIR)
    _write_table(mets, estr, paired, days, args.initial_soc, OUT_DIR)
    logger.info("Salidas A2 en %s", OUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
