# -*- coding: utf-8 -*-
"""Runner de los experimentos de calibracion de HO#3 (Fase 2).

Descarga CLIMA REAL horario de Pasto (Open-Meteo ERA5) y corre la cascada
N1a/N1b/N2 para ambas semillas (7 limpio, 42 realista). Guarda:
  - results/pasto_narino/calibration/rmse_seed{seed}.csv
  - results/pasto_narino/calibration/importancia_seed{seed}.csv
  - results/pasto_narino/calibration/planta_calibrada_seed{seed}.pkl

Ejemplo:
  python3 -m optimization.calibration.run_experiments --months 6
  python3 -m optimization.calibration.run_experiments --seed 42 --train-pct 0.7
"""
from __future__ import annotations

import argparse
import logging
import pickle
import os
from datetime import timedelta
from pathlib import Path

import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient
from optimization.calibration.experiments import run_experiment, print_result, ExperimentResult

logger = logging.getLogger("optimization.calibration.runner")

REPO_ROOT = Path(__file__).resolve().parents[2]
SEEDS = (7, 42)


def main() -> int:
    ap = argparse.ArgumentParser(description="Experimentos de calibracion HO#3")
    ap.add_argument("--site", default="pasto_narino")
    ap.add_argument("--months", type=int, default=6, help="meses de clima ERA5 a usar")
    ap.add_argument("--end-offset-days", type=int, default=14,
                    help="margen al final (latencia ERA5)")
    ap.add_argument("--seeds", default="7,42")
    ap.add_argument("--train-pct", type=float, default=0.70)
    ap.add_argument("--outdir", default="results/pasto_narino/calibration")
    args = ap.parse_args()

    # ancla rutas relativas a la raiz del repo (independiente del cwd)
    if not os.path.isabs(args.outdir):
        args.outdir = str(REPO_ROOT / args.outdir)

    cfg = load_site(args.site)
    s = cfg["site"]

    end = (pd.Timestamp.now(tz=s["timezone"]).floor("D")
           - pd.Timedelta(days=args.end_offset_days))
    start = end - pd.Timedelta(days=int(args.months * 30.42))
    logger.info("Descargando clima ERA5 %s .. %s (~%d meses)",
                start.date(), end.date(), args.months)
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    climate = client.fetch_archive(start.date().isoformat(), end.date().isoformat())
    if climate.empty or len(climate) < 1000:
        raise SystemExit(
            "Clima insuficiente; prueba --months mas corto o --end-offset-days mayor")
    logger.info("Clima: %d filas horarias (%.1f meses)",
                len(climate), len(climate) / 24.0 / 30.42)

    os.makedirs(args.outdir, exist_ok=True)
    for seed in [int(s) for s in args.seeds.split(",")]:
        res = run_experiment(cfg, climate, seed, train_pct=args.train_pct)
        print_result(res)

        seed_dir = os.path.join(args.outdir, f"seed{seed}")
        os.makedirs(seed_dir, exist_ok=True)
        res.table().to_csv(os.path.join(seed_dir, "rmse.csv"), float_format="%.4f")
        res.importance.to_csv(os.path.join(seed_dir, "importancia.csv"), index=False)
        pd.DataFrame([{
            "conformal_radius_kw": res.conformal_radius_kw,
            "coverage_holdout": res.coverage_holdout,
            "coverage_q90": res.coverage_q90,
            "coverage_q95": res.coverage_q95,
        }]).to_csv(os.path.join(seed_dir, "coverage.csv"), index=False)
        with open(os.path.join(seed_dir, "planta_calibrada.pkl"), "wb") as fh:
            pickle.dump(res.calibrated, fh)
        logger.info("Guardado en %s", seed_dir)

    # copia de la prediccion: planta calibrada por defecto (seed syn.truth_seed)
    if os.path.exists(os.path.join(args.outdir, "seed7", "planta_calibrada.pkl")):
        dst = os.path.join(args.outdir, "planta_calibrada_default.pkl")
        import shutil
        shutil.copy(os.path.join(args.outdir, "seed7", "planta_calibrada.pkl"), dst)
        logger.info("planta_calibrada_default.pkl = seed7 (planta limpia)")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    raise SystemExit(main())