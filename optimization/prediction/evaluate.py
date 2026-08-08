# -*- coding: utf-8 -*-
"""Evaluacion walk-forward de baselines y del forecast operativo (Fase 2b).

Genera la tabla MAE de la tesis sobre clima ERA5 de Pasto:
  persistence | climatology | arima (y opcional chronos) + Open-Meteo NWP
por variable y por horizonte (1, 6, 12, 24, 48 h).

Uso:
  python3 -m optimization.prediction.evaluate --months 8 --horizons 1,6,12,24
Guarda CSV en results/pasto_narino/forecast/.
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient
from optimization.prediction.baselines import run_baseline, BASELINES

logger = logging.getLogger("optimization.prediction.evaluate")


RADIATION_VARS = {"shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation"}


def walk_forward_mae(climate: pd.DataFrame, train_h: int = 30 * 24,
                     step_h: int = 24, horizons=(1, 6, 12, 24),
                     baselines=("persistence", "climatology", "arima"),
                     arima_every: int = 1, daytime_only: bool = True,
                     ghi_threshold: float = 50.0) -> pd.DataFrame:
    """MAE por baseline, variable y horizonte (ventana movil temporal).

    En cada paso: entrena con los ultimos train_h y mide los proximos
    max(horizons) horas; avanza step_h. ARIMA se reestima cada
    `arima_every` pasos (caro en MLE).

    daytime_only: las variables RADIATIVAS se evaluan solo en horas diurnas
    (GHI_real > threshold) para no diluir con noches perfectas (HO1/HO2);
    el resto de variables incluye todas las horas.
    """
    rows = []
    n = len(climate)
    t = train_h
    step = 0
    while t + max(horizons) < n:
        train = climate.iloc[t - train_h:t]
        actual = climate.iloc[t:t + max(horizons)]
        run_arima = (step % arima_every == 0)
        for name in baselines:
            if name == "arima" and not run_arima:
                continue
            try:
                fc = run_baseline(name, train, max(horizons))
                if fc is None:
                    logger.warning("baseline %s no disponible; se omite", name)
                    continue
                fc = fc.reindex(actual.index)
                for h in horizons:
                    a, f = actual.iloc[h - 1], fc.iloc[h - 1]
                    for var in climate.columns:
                        if (daytime_only and var in RADIATION_VARS
                                and a["shortwave_radiation"] <= ghi_threshold):
                            continue
                        mae = abs(float(a[var]) - float(f[var]))
                        if not np.isnan(mae):
                            rows.append({"baseline": name, "horizon_h": h,
                                         "variable": var, "mae": mae})
            except Exception as exc:  # noqa: BLE001
                logger.warning("baseline %s fallo en paso %d: %s", name, t, exc)
                continue
        t += step_h
        step += 1
    return pd.DataFrame(rows)


def summarize(df: pd.DataFrame) -> pd.DataFrame:
    """Pivote: filas=(baseline, horizon), columnas=variables (MAE medio)."""
    if df.empty:
        return pd.DataFrame()
    return (df.groupby(["baseline", "horizon_h", "variable"])["mae"]
            .mean().reset_index()
            .pivot_table(index=["baseline", "horizon_h"],
                         columns="variable", values="mae")
            .round(3))


def main() -> int:
    ap = argparse.ArgumentParser(description="Walk-forward MAE de baselines")
    ap.add_argument("--site", default="pasto_narino")
    ap.add_argument("--months", type=int, default=8)
    ap.add_argument("--end-offset-days", type=int, default=14)
    ap.add_argument("--train-h", type=int, default=30 * 24)
    ap.add_argument("--step-h", type=int, default=24)
    ap.add_argument("--horizons", default="1,6,12,24")
    ap.add_argument("--arima-every", type=int, default=3,
                    help="reestimar ARIMA cada N pasos (MLE caro)")
    ap.add_argument("--no-daytime-only", action="store_true",
                    help="incluir horas nocturnas en el MAE")
    ap.add_argument("--outdir", default="results/pasto_narino/forecast")
    args = ap.parse_args()

    # ancla rutas relativas a la raiz del repo (independiente del cwd)
    if not os.path.isabs(args.outdir):
        args.outdir = str(Path(__file__).resolve().parents[2] / args.outdir)

    import warnings
    warnings.filterwarnings("ignore", module="statsmodels")
    warnings.filterwarnings("ignore", category=FutureWarning)

    cfg = load_site(args.site)
    s = cfg["site"]
    end = (pd.Timestamp.now(tz=s["timezone"]).floor("D")
           - pd.Timedelta(days=args.end_offset_days))
    start = end - pd.Timedelta(days=int(args.months * 30.42))
    logger.info("Clima ERA5 %s .. %s", start.date(), end.date())
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    climate = client.fetch_archive(start.date().isoformat(), end.date().isoformat())
    horizons = [int(h) for h in args.horizons.split(",")]
    logger.info("Walk-forward train_h=%d step_h=%d horizons=%s",
                args.train_h, args.step_h, horizons)

    table = walk_forward_mae(climate, args.train_h, args.step_h,
                             horizons, tuple(BASELINES.keys()),
                             arima_every=args.arima_every,
                             daytime_only=not args.no_daytime_only)
    summary = summarize(table)

    os.makedirs(args.outdir, exist_ok=True)
    table.to_csv(os.path.join(args.outdir, "walkforward_mae_long.csv"), index=False)
    summary.to_csv(os.path.join(args.outdir, "baselines_mae.csv"))
    print("\n===== MAE por baseline y horizonte (W/m2, C, %, m/s, hPa) =====")
    print(summary.to_string())
    logger.info("Guardado en %s", args.outdir)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    raise SystemExit(main())