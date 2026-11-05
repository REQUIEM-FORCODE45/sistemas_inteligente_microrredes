# -*- coding: utf-8 -*-
"""Probe 5.2: ¿la intermitencia de nubes explica lo que el booster no captura?

Pregunta (fijada antes de correr):
  residuo = cloud_cover_real - prediccion del booster cloud v2 actual
            (ruta de produccion: v1 del iTransformer + 8 features)
  feat    = energia DCT de alta frecuencia de las ultimas 6 h de nubosidad
            del NWP antes del anchor (causal, disponible al decidir)
  senal   = corr(|feat|, |residuo|) sobre la ventana de test jul-dic 2025

Umbrales fijados antes de correr (no se negocian con el numero):
  corr >= 0.20 -> HAY SENAL (rama a: spec aparte + reentreno)
  corr <  0.20 -> SIN SENAL (rama b: veredicto, sprint cerrado)

Para ADOPTAR tras el reentreno (fijado tambien antes):
  MAE de nubes <= 14.85 (hoy 15.15) y corr NO baja de 0.439.
  Si no se cumple, se reporta y NO se adopta (como 5.1).

Uso (en la maquina con los parquet; NO usa red):
  python3 -m optimization.prediction.mos.probe_intermittencia_nubes \
      --data-dir DIR  (era5_v3.parquet + ecmwf/ecmwf_YYYY_MM.parquet)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

L, H = 512, 72
N_HORAS_CONTEXTO = 6  # ultimas 6 h de nubosidad NWP antes del anchor
UMBRAL_SENAL = 0.20


def dct_hf_energy(x: np.ndarray) -> float:
    """Energia de la mitad alta de la DCT-II (scipy si esta, manual si no)."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    try:
        from scipy.fft import dct as _dct
        c = _dct(x, type=2, norm="ortho")
    except ImportError:  # sin scipy: DCT-II manual (n pequeno, vale)
        k = np.arange(n)[:, None]
        m = np.arange(n)[None, :]
        c = (x[None, :] * np.cos(np.pi * (2 * m + 1) * k / (2 * n))).sum(
            axis=1) * np.sqrt(2.0 / n)
        c[0] /= np.sqrt(2.0)
    mitad = n // 2
    return float(np.sum(c[mitad:] ** 2))


def correlacion_senal(feat: np.ndarray, residuo: np.ndarray) -> float:
    """corr(|feat|, |residuo|); NaN/constantes -> 0.0 declarado."""
    f = np.abs(np.asarray(feat, dtype=float))
    r = np.abs(np.asarray(residuo, dtype=float))
    ok = np.isfinite(f) & np.isfinite(r)
    if ok.sum() < 3 or np.std(f[ok]) == 0 or np.std(r[ok]) == 0:
        return 0.0
    return float(np.corrcoef(f[ok], r[ok])[0, 1])


def _load_ecmwf_proxy(data: Path, era: pd.DataFrame,
                      ecmwf_cols: dict) -> pd.DataFrame:
    """Proxy NWP reindexado a `era` (mismo arbol que entreno el v2 cloud).

    Coacciona a float: un mes vacio (object 100 % nulo, como 2024-01)
    contagia el dtype del concat y revienta np.isfinite; los huecos
    quedan NaN y los excluye el llamador (declarado, no rellenado).
    """
    ecw = {}
    for col_era5, tag in ecmwf_cols.items():
        parts = []
        for y in (2024, 2025):
            for mm in range(1, 13):
                p = Path(data) / "ecmwf" / f"ecmwf_{y}_{mm:02d}.parquet"
                if p.exists():
                    parts.append(pd.read_parquet(p)[[col_era5]])
        df = pd.concat(parts)
        df = df[~df.index.duplicated()].sort_index()
        ecw[tag] = pd.to_numeric(df[col_era5], errors="coerce").reindex(
            era.index)
    return pd.DataFrame(ecw)


def main() -> int:
    ap = argparse.ArgumentParser(description="Probe 5.2 intermitencia.")
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--max-ventanas", type=int, default=400)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    data = Path(args.data_dir)
    era_p = data / "era5_v3.parquet"
    if not era_p.exists():
        raise SystemExit(
            f"Sin datos: falta {era_p} (no hay red: usa --data-dir local).")

    import lightgbm as lgb  # noqa: E402
    from optimization.prediction.mos_forecaster import (  # noqa: E402
        MOSClimateForecaster, _V2_FEATS, _sol_geo,
    )
    from optimization.prediction.mos.train_mos_v2 import _pers_idx  # noqa: E402

    era = pd.read_parquet(era_p)
    era.index = pd.to_datetime(era.index)

    # proxy NWP completo (mismo arbol que entreno el v2 cloud)
    ecmwf_cols = {"shortwave_radiation": "ghi", "cloud_cover": "nubes",
                  "temperature_2m": "temp", "wind_speed_10m": "viento",
                  "relative_humidity_2m": "rh",
                  "surface_pressure": "pres"}
    ecw = _load_ecmwf_proxy(data, era, ecmwf_cols)

    a = pd.Timestamp("2025-07-01")
    b = pd.Timestamp("2025-12-31") + pd.Timedelta(hours=23)
    if era.index.tz is not None:
        a, b = a.tz_localize(era.index.tz), b.tz_localize(era.index.tz)
    idxs = np.array([i for i in range(L, len(era) - L - H)
                     if a <= era.index[i + L]
                     and era.index[i + L + H - 1] <= b])
    rng = np.random.default_rng(args.seed)
    idxs = rng.choice(idxs, size=min(args.max_ventanas, len(idxs)),
                      replace=False)

    site = {"latitude": 1.2136, "longitude": -77.2811,
            "timezone": "America/Bogota"}
    prov = MOSClimateForecaster(site_cfg=dict(site))
    prov._load_lazy()
    assert (prov._booster_ver.get("cloud_cover") == "v2"
            and prov._lgbm["cloud_cover"].num_feature() == 8), \
        "el booster cloud cambio: revisa _V2_FEATS antes de comparar"
    feat_names = list(_V2_FEATS["cloud_cover"])
    lat = float(site["latitude"])
    # contexto completo como en produccion (las 10 + direccion de viento;
    # _v1_phys necesita todas para los TRANSFORMS y las 33 FEATURES)
    from optimization.prediction.forecaster import (  # noqa: E402
        WEATHER_VARIABLES,
    )
    ctx_cols = list(WEATHER_VARIABLES) + ["wind_direction_100m"]

    feats, resids = [], []
    for ii in idxs:
        i = int(ii)
        hist = ecw["nubes"].values[i + L - N_HORAS_CONTEXTO:i + L]
        if not np.isfinite(hist).all():
            continue  # hueco declarado por exclusion
        feats.append(dct_hf_energy(hist))
        ctx = era[ctx_cols].iloc[i + L - L:i + L]
        fut_toa, _ = _sol_geo(
            pd.date_range(era.index[i + L], periods=H, freq="h",
                          tz=era.index.tz),
            lat)
        v1 = prov._v1_phys(ctx, pd.date_range(
            era.index[i + L], periods=H, freq="h", tz=era.index.tz))
        pers_h = np.array([era["cloud_cover"].values[_pers_idx(i, hh)]
                           for hh in range(H)])
        X = np.nan_to_num(np.stack([
            ecw["nubes"].values[i + L:i + L + H],
            np.asarray(v1["cloud_cover"], dtype=float),
            pers_h, fut_toa,
            np.array([t.hour for t in era.index[i + L:i + L + H]],
                     dtype=float),
            ecw["nubes"].values[i + L:i + L + H],
            ecw["temp"].values[i + L:i + L + H],
            ecw["viento"].values[i + L:i + L + H],
        ], axis=1), nan=0.0)
        cols = {n: X[:, k] for k, n in enumerate(feat_names)}
        pred = prov._predict_var("cloud_cover", cols)
        real = era["cloud_cover"].values[i + L:i + L + H]
        resids.append(float(np.mean(np.abs(real - pred))))
    feats = np.array(feats)
    resids = np.array(resids)
    corr = correlacion_senal(feats, resids)
    veredicto = "HAY SENAL -> rama (a)" if corr >= UMBRAL_SENAL \
        else "SIN SENAL -> rama (b)"
    print(json.dumps({
        "corr_abs": round(corr, 4), "n": int(len(feats)),
        "ventana": "jul-dic 2025 (misma que T4)",
        "umbral": UMBRAL_SENAL, "veredicto": veredicto}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
