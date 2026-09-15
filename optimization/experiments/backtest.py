# -*- coding: utf-8 -*-
"""Lazo cerrado del Experimento A (receding horizon horario).

Por cada dia y estrategia:
  - Para cada hora h: se emite el forecast (PatchTST + ajuste de datos) con
    contexto que termina ANTES de la hora de decision (anchor = dia + h).
  - Se resuelve el MPC de 24 h de lookahead y se implementa SOLO la primera
    accion del escenario base (P50/Nublado).
  - La red es el slack: P_grid_real cierra el balance con los valores
    realizados; si el importe necesario excede el limite de la red -> la hora
    cuenta como violacion (debe ser 0).
  - El SOC se actualiza con las acciones implementadas y eficiencias reales.

Salida por dia: DataFrame horario con acciones, balance, costos parciales.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from optimization.experiments.config import (MICROGRID, tou_variable_tariff,
                                             diesel_total_cost)
from optimization.experiments import strategies as strat

logger = logging.getLogger("optimization.experiments.backtest")

HOURS = 24


def _grid_slack(load_real: float, pv_real: float, diesel: float,
                discharge: float, charge: float,
                grid_min: float, grid_max: float) -> tuple[float, int, float, float]:
    """Cierra el balance con la red como slack. Devuelve (P_grid_real, viol, ens, curtailed)."""
    net = load_real - (pv_real + diesel + discharge - charge)
    if net > grid_max:
        ens = net - grid_max
        return grid_max, 1, ens, 0.0
    if net < grid_min:
        curtailed = grid_min - net
        return grid_min, 0, 0.0, curtailed
    return net, 0, 0.0, 0.0


def _perfect_forecast(anchor: pd.Timestamp, pv_real: pd.Series,
                      load_real: pd.Series, hours: int = HOURS) -> tuple:
    """Forecast PERFECTO del MPC-PI: la serie realizada misma (sin error).

    Banda P10=P50=P90 = PV realizado; carga = carga realizada. El tail del
    lookahead se completa con el ultimo valor conocido (documentado)."""
    pv = pv_real.loc[anchor:].values
    ld = load_real.loc[anchor:].values
    if len(pv) < hours:
        pad = np.full(hours - len(pv), pv[-1] if len(pv) else 0.0)
        pv = np.concatenate([pv, pad])
    if len(ld) < hours:
        pad = np.full(hours - len(ld), ld[-1] if len(ld) else 0.0)
        ld = np.concatenate([ld, pad])
    idx = pd.date_range(anchor, periods=hours, freq="h", tz=pv_real.index.tz)
    band = pd.DataFrame({"P10": pv, "P50": pv, "P90": pv}, index=idx)
    load_fc = pd.Series(ld, index=idx)
    return band, load_fc


def run_day(strategy: str, day_start: pd.Timestamp, pv_real: pd.Series,
            load_real: pd.Series, provider, params: dict | None = None) -> pd.DataFrame:
    """Simula 24 h de lazo cerrado con una estrategia. Devuelve traza horaria."""
    params = params or {}
    if len(pv_real) != HOURS or len(load_real) != HOURS:
        raise ValueError(
            f"Los realizados deben tener {HOURS}h (dia): pv={len(pv_real)}, "
            f"load={len(load_real)} — rebanar por dia antes de llamar")
    b = MICROGRID["battery"]
    cap = b["capacity_kwh"]
    soc = (params.get("initial_soc") or b["initial_soc"]) * cap
    # Exp A2 (escasez de red): limite de importacion del lazo. None = config.
    _gmax = params.get("grid_max_kw")
    grid_max = (MICROGRID["grid"]["max_import_kw"]
                if _gmax is None else float(_gmax))
    grid_min = (MICROGRID["grid"]["min_import_kw"]
                if _gmax is None else -float(_gmax))
    # Exp A2: el ENS por escasez es METRICA, no violacion (el balance cierra
    # por construccion via slack). Default False = comportamiento Exp A.
    ens_as_metric = bool(params.get("ens_as_metric", False))
    tariff = tou_variable_tariff(pv_real.index)

    rows = []
    for h in range(HOURS):
        anchor = day_start + pd.Timedelta(hours=h)
        if strategy in ("mpc-pi", "oracle"):
            # MPC-PI: el forecast ES el realizado (informacion perfecta).
            band, load_fc = _perfect_forecast(anchor, pv_real, load_real)
        else:
            band, load_fc = provider.forecast(anchor)
        lookahead = band.iloc[:HOURS]
        load_fc_24 = load_fc.iloc[:HOURS]

        pv_r = float(pv_real.iloc[h])
        load_r = float(load_real.iloc[h])
        t = float(tariff.iloc[h])

        if strategy == "smpc":
            act = strat.strategy_smpc(lookahead, load_fc_24,
                                      initial_soc=soc / cap,
                                      grid_max_kw=None if _gmax is None
                                      else grid_max)
        elif strategy == "dmpc":
            act = strat.strategy_dmpc(lookahead, load_fc_24,
                                      initial_soc=soc / cap,
                                      grid_max_kw=None if _gmax is None
                                      else grid_max)
        elif strategy in ("mpc-pi", "oracle"):
            act = strat.strategy_mpc_pi(lookahead, load_fc_24,
                                        initial_soc=soc / cap,
                                        grid_max_kw=None if _gmax is None
                                        else grid_max)
        elif strategy == "heur":
            act = strat.strategy_heur(pv_r, load_r, soc, t, cap,
                                      grid_max_kw=None if _gmax is None
                                      else grid_max)
        else:
            raise ValueError(f"Estrategia desconocida: {strategy}")

        p_grid, viol, ens, curtailed_slack = _grid_slack(
            load_r, pv_r, act["diesel"], act["discharge"], act["charge"],
            grid_min, grid_max)
        if ens_as_metric:
            # El ENS por escasez es la metrica del Exp A2 (isla/grid10):
            # el balance cierra por construccion, no es violacion.
            viol = 0
        curtailed = act.get("curtailed", 0.0) + curtailed_slack
        export_tariff = MICROGRID["grid"].get("export_tariff", 0.0)
        ens_penalty = MICROGRID["grid"].get("ens_penalty_cop_kwh", 5000.0)

        rows.append({
            "hour": h,
            "timestamp": anchor,
            "pv_real_kw": pv_r,
            "load_real_kw": load_r,
            "diesel_kw": act["diesel"],
            "grid_kw": p_grid,
            "charge_kw": act["charge"],
            "discharge_kw": act["discharge"],
            "curtailed_kw": curtailed,
            "ens_kw": ens,
            "deficit_kw": max(0.0, load_r - pv_r - act["diesel"]
                              - act["discharge"] + act["charge"]
                              - max(p_grid, 0.0)),
            "tariff": t,
            "soc_kwh": soc,
            "violation": viol,
            "cost_diesel": diesel_total_cost(act["diesel"]),
            "cost_grid": (MICROGRID["grid"]["cost_fixed"]
                          + t * max(p_grid, 0) - export_tariff * max(-p_grid, 0)
                          + ens_penalty * ens),
            "cost_battery": b["degradation_cost_per_kwh"]
                            * (act["charge"] + act["discharge"]),
        })

        # clip fisico: la bateria real no supera [soc_min, soc_max]*cap
        soc = soc + b["charge_efficiency"] * act["charge"] \
            - act["discharge"] / b["discharge_efficiency"]
        soc = float(np.clip(soc, b["soc_min"] * cap, b["soc_max"] * cap))

    df = pd.DataFrame(rows)
    # SOC tras aplicar la acción de la última hora (la variable `soc` ya quedó
    # actualizada al salir del bucle) → permite encadenar días en lazo CONTINUO.
    df.attrs["soc_final_kwh"] = float(soc)
    return df
