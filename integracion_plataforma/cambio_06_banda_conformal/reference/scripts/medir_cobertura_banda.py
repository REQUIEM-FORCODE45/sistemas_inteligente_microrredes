#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Protocolo UNICO de medicion de cobertura de la banda (cambio 06).

POR QUE EXISTE
--------------
La banda P10/P90 del sensor solar es la que alimenta los escenarios del S-MPC
(`predictions_pv_band` -> `model_builder._band_at`). Hoy su cobertura real esta
medida en el anexo del informe: 50.2% / 54.8% con banda nominal 80%
(`informe.md:456-461`). Este script existe para que **ambas partes** (quien
especifica y quien implementa) midan con el MISMO protocolo, antes y despues del
cambio 06. Sin este script, cada quien mide a su manera y la cifra no es
comparable.

QUE MIDE
--------
Sobre el MISMO holdout (ultimo 20% de las horas de generacion), dos metodos:

  A) CRITERIO ACTUAL (reproduccion en espiritu, no bit-exacta):
     - k, params y GBR ajustados con el 80% NO-holdout
     - radio conformal = cuantil(1-alpha) del |residuo del modelo FISICO|,
       medido IN-SAMPLE sobre ese mismo 80%
     - banda SIMETRICA:  P10 = P50 - radio,  P90 = P50 + radio   (P50 = fisico+GBR)

  B) METODO CORREGIDO (lo que propone el cambio 06):
     - split TRIPLE DISJUNTO: ajuste 60% | calibracion 20% | holdout 20%
     - k, params y GBR ajustados SOLO con el tramo de ajuste
     - cuantiles q10/q90 del residuo del PREDICTOR FINAL (fisico+GBR)
       medidos SOLO en el tramo de calibracion
     - banda ASIMETRICA: P10 = P50 + q10,  P90 = P50 + q90

**Declarado**: el metodo A reproduce el *criterio* del codigo actual
(`calibration/service.py:129-141` + `calibrated_plant.py:72-78` +
`conformal.py:53-59`), no su reparticion exacta de indices. El objetivo es la
comparacion justa de criterios sobre un holdout comun, no una replicacion
bit-exacta.

**Fidelidad verificada** (leida en el repo, no supuesta):
  - `_base_kw` = P_fisico(theta_calibrado) * K  -> `calibrated_plant.py:50-52`
  - `predict_power` = base + GBR, recortado a >= 0 -> `:54-60`
  - `predict_band` prioridad 1 = banda SIMETRICA con radio conformal -> `:74-78`
  - fallback = cuantiles asimetricos `p50 + q10 / p50 + q90` -> `:79-81`
  - el radio se mide IN-SAMPLE y sobre el modelo FISICO -> `service.py:134-141`

USO
---
    python medir_cobertura_banda.py --sensor pasto_solar_pv --max-days 30
    python medir_cobertura_banda.py --alpha 0.2 --out cobertura_06.json

Requisitos: acceso a Mongo (Backend/.env) y a Open-Meteo archive (sin API key).
READ-ONLY: no escribe artefactos ni toca el repositorio.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd


# --------------------------------------------------------------------------- #
# Raiz del repo: se sube desde este archivo hasta encontrar `optimization/`.
# Asi el script funciona desde cualquier cwd y sigue siendo autocontenido.
# --------------------------------------------------------------------------- #
def _repo_root() -> Path:
    p = Path(__file__).resolve().parent
    while p != p.parent and not (p / "optimization").is_dir():
        p = p.parent
    if not (p / "optimization").is_dir():
        raise RuntimeError("No se encontro la raiz del repo (falta optimization/)")
    return p


REPO_ROOT = _repo_root()
sys.path.insert(0, str(REPO_ROOT))
os.chdir(REPO_ROOT)          # las rutas relativas (Backend/.env) dependen del cwd


def build_predictor(climate: pd.DataFrame, p_real: pd.Series,
                    nominal, use_gbr: bool = True):
    """Ajusta k + params (+GBR) con el tramo recibido. Devuelve el predictor.

    Regla de oro de `residual.py`: el GBR se entrena SIEMPRE contra la base
    calibrada (nunca contra la nominal).
    """
    from optimization.calibration.derating import estimate_derating
    from optimization.calibration.params import calibrate_params, build_plant
    from optimization.calibration.residual import (residual_features,
                                                   fit_residual_gbr)

    k = estimate_derating(nominal.ac_power(climate) / 1000.0, p_real,
                          nominal.capacity_kwp)
    params = calibrate_params(nominal, climate, p_real)
    plant_calib = build_plant(nominal, params)
    gbr = None
    if use_gbr:
        t0 = climate.index[0]
        feats = residual_features(climate, t0)
        resid = p_real - plant_calib.ac_power(climate) / 1000.0
        gbr = fit_residual_gbr(feats, resid)
    return k, params, plant_calib, gbr


def predict(plant_calib, gbr, climate: pd.DataFrame, k_extra: float = 1.0):
    """P50 = k * fisico + GBR (si hay). Devuelve (p50, fisico_puro).

    Fidelidad verificada contra el codigo existente:
      - `_base_kw` = P_fisico(theta_calibrado) * K   (`calibrated_plant.py:50-52`)
      - `predict_power` recorta a >= 0               (`calibrated_plant.py:60`)
    """
    from optimization.calibration.residual import residual_features, residual_predict

    base = plant_calib.ac_power(climate) / 1000.0 * k_extra
    p50 = base.copy()
    if gbr is not None:
        feats = residual_features(climate, climate.index[0])
        p50 = base + residual_predict(gbr, feats)
    return p50.clip(lower=0.0), base


def main() -> int:
    ap = argparse.ArgumentParser(description="Cobertura de la banda del sensor solar")
    ap.add_argument("--sensor", default="pasto_solar_pv")
    ap.add_argument("--site", default="pasto_narino")
    ap.add_argument("--alpha", type=float, default=0.2, help="0.2 -> nominal 0.80")
    ap.add_argument("--max-days", type=float, default=30.0)
    ap.add_argument("--min-cal", type=int, default=100,
                    help="minimo de horas de calibracion para reportar")
    ap.add_argument("--out", default=None, help="ruta JSON de salida (opcional)")
    args = ap.parse_args()

    from optimization.calibration.experiments import build_nominal_plant
    from optimization.calibration.conformal import (conformal_radius,
                                                    conformal_band, coverage)
    from optimization.calibration.service import (read_sensor_series,
                                                  hourly_resample)
    from optimization.config.loader import load_site
    from optimization.weather.openmeteo import OpenMeteoClient

    cfg = load_site(args.site)
    nominal = build_nominal_plant(cfg)

    # ---- 1. datos: medicion del sensor alineada con ERA5 ------------------- #
    df = hourly_resample(read_sensor_series(args.sensor, ["power_kw"],
                                            max_days=args.max_days))
    if df.empty:
        print(json.dumps({"error": f"Sensor {args.sensor} sin datos en Mongo"}))
        return 1
    s = cfg["site"]
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    start = (df.index.min() - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    end = (df.index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    climate = client.fetch_archive(start, end)

    p_meas = df["power_kw"].reindex(climate.index).dropna()
    p_meas = p_meas[p_meas > 0.01]              # SOLO horas de generacion
    climate = climate.loc[p_meas.index]
    n = len(p_meas)
    if n < 96:
        print(json.dumps({"error": f"Horas de generacion insuficientes ({n})"}))
        return 1

    # ---- 2. holdout COMUN (ultimo 20%) para comparacion justa -------------- #
    n_hold = int(round(0.20 * n))
    n_rest = n - n_hold
    hold_idx = p_meas.index[n_rest:]
    rest_idx = p_meas.index[:n_rest]

    # ---- 3. METODO A — criterio actual (in-sample, radio del fisico) ------- #
    k_a, pa_a, pc_a, gbr_a = build_predictor(climate.loc[rest_idx],
                                             p_meas.loc[rest_idx], nominal,
                                             use_gbr=True)
    p50_rest_a, base_rest_a = predict(pc_a, gbr_a, climate.loc[rest_idx], k_a)
    resid_fisico_insample = p_meas.loc[rest_idx] - base_rest_a   # <- del FISICO
    radius_a = conformal_radius(resid_fisico_insample, alpha=args.alpha)
    p50_hold_a, base_hold_a = predict(pc_a, gbr_a, climate.loc[hold_idx], k_a)
    band_a = conformal_band(p50_hold_a, radius_a)                # SIMETRICA
    cov_a = coverage(p_meas.loc[hold_idx], band_a)
    ancho_a = float((band_a["P90"] - band_a["P10"]).mean())

    # ---- 4. METODO B — corregido (split triple disjunto) ------------------- #
    n_aj = int(round(0.60 * n))
    n_cal = n - n_hold - n_aj
    aj_idx = p_meas.index[:n_aj]
    cal_idx = p_meas.index[n_aj:n_aj + n_cal]

    k_b, pa_b, pc_b, gbr_b = build_predictor(climate.loc[aj_idx],
                                             p_meas.loc[aj_idx], nominal,
                                             use_gbr=True)
    p50_cal_b, _ = predict(pc_b, gbr_b, climate.loc[cal_idx], k_b)
    resid_final_cal = p_meas.loc[cal_idx] - p50_cal_b            # <- del FINAL
    q10 = float(np.quantile(resid_final_cal.values, 0.10))
    q90 = float(np.quantile(resid_final_cal.values, 0.90))

    p50_hold_b, _ = predict(pc_b, gbr_b, climate.loc[hold_idx], k_b)
    band_b = pd.DataFrame({
        "P10": (p50_hold_b + q10).clip(lower=0.0),
        "P50": p50_hold_b,
        "P90": (p50_hold_b + q90).clip(lower=0.0),
    })
    cov_b = coverage(p_meas.loc[hold_idx], band_b)
    ancho_b = float((band_b["P90"] - band_b["P10"]).mean())

    # ---- 5. reporte -------------------------------------------------------- #
    nominal_cov = 1.0 - args.alpha
    out = {
        "sensor": args.sensor,
        "site": args.site,
        "alpha": args.alpha,
        "nominal": nominal_cov,
        "n_generacion": int(n),
        "tramos": {"ajuste": int(n_aj), "calibracion": int(n_cal),
                   "holdout": int(n_hold)},
        "ventana": {"desde": str(p_meas.index[0]), "hasta": str(p_meas.index[-1])},
        "metodo_actual": {
            "descripcion": "radio del modelo FISICO in-sample + banda simetrica",
            "radio_kw": round(float(radius_a), 4),
            "cobertura_holdout": round(float(cov_a), 4),
            "ancho_medio_kw": round(ancho_a, 4),
        },
        "metodo_corregido": {
            "descripcion": "split disjunto + cuantiles del predictor FINAL + banda asimetrica",
            "q10_kw": round(q10, 4), "q90_kw": round(q90, 4),
            "cobertura_holdout": round(float(cov_b), 4),
            "ancho_medio_kw": round(ancho_b, 4),
        },
        "delta_cobertura": round(float(cov_b - cov_a), 4),
        "criterio_cierre": {"objetivo": 0.72, "cumple": bool(cov_b >= 0.72)},
        "avisos": [],
        "nota": ("El metodo A reproduce el CRITERIO del codigo actual "
                 "(in-sample, radio del fisico, banda simetrica) sobre el mismo "
                 "holdout; no es replicacion bit-exacta del split original."),
    }
    if n_cal < args.min_cal:
        out["avisos"].append(
            f"n_cal={n_cal} < min_cal={args.min_cal}: cuantiles ruidosos, "
            f"reportar y considerar banda conservadora")

    txt = json.dumps(out, indent=2, ensure_ascii=False)
    print(txt)
    if args.out:
        Path(args.out).write_text(txt, encoding="utf-8")
        print(f"\n[guardado] {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
