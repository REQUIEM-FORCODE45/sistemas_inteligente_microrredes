"""
Script de INFERENCIA para el servidor — PatchTST de Pasto (72h).

Carga el modelo entrenado + specs + stats y emite un forecast de 10
variables para las próximas 72 horas a partir de datos recientes de
Open-Meteo.

USO (en el servidor):
    pip install pandas numpy torch requests pyyaml
    python predict_72h.py                      # predice con datos recientes
    python predict_72h.py --date 2026-08-10    # contexto termina en esa fecha
    python predict_72h.py --out forecast.json  # guarda el JSON en otro archivo

SALIDA (JSON):
    {
      "site": "pasto_narino",
      "emitted_at": "2026-08-07T23:00:00",
      "horizon_hours": 72,
      "quantiles": [0.1, 0.5, 0.9],
      "timestamps": ["2026-08-08T00:00:00", ...],
      "series": {
        "shortwave_radiation": {"p10": [...], "p50": [...], "p90": [...]},
        "temperature_2m":      {"p10": [...], "p50": [...], "p90": [...]},
        ... 10 variables en total, unidades físicas (W/m², °C, %, m/s, hPa, mm)
      }
    }
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import torch
import yaml

# ---------------------------------------------------------------- rutas
# El script asume que los archivos del paquete están en el mismo directorio.
HERE = Path(__file__).resolve().parent
CKPT = HERE / "patchtst_best.pt"
SPECS = HERE / "target_specs.json"
STATS = HERE / "norm_stats.csv"
SITE_CFG = HERE / "pasto_narino.yaml"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ---------------------------------------------------------------- modelo
def build_model(ckpt: dict):
    """Reconstruye la arquitectura exacta desde el checkpoint (autocontenido)."""
    from patchtst import PatchTST  # importa el archivo del paquete

    feature_cols = ckpt["feature_cols"]
    fcfg = ckpt["config"]["forecast"]
    mcfg = ckpt["config"]["patchtst"]
    model = PatchTST(
        context_length=fcfg["context_length"], horizon=fcfg["horizon"],
        n_channels=len(feature_cols), quantiles=fcfg["quantiles"],
        patch_len=mcfg["patch_len"], stride=mcfg["stride"],
        d_model=mcfg["d_model"], n_heads=mcfg["n_heads"],
        e_layers=mcfg["e_layers"], d_ff=mcfg["d_ff"], dropout=mcfg["dropout"],
        target_idx=ckpt["target_idx"],
    ).to(DEVICE)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model, feature_cols, fcfg


# ---------------------------------------------------------------- datos
def fetch_recent(cfg: dict, days: int) -> pd.DataFrame:
    """Descarga los últimos `days` días desde Open-Meteo (ERA5)."""
    site, om = cfg["site"], cfg["open_meteo"]
    end = date.today()
    start = end - timedelta(days=days)
    r = requests.get(om["archive_url"], params={
        "latitude": site["latitude"], "longitude": site["longitude"],
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "hourly": ",".join(om["hourly_vars"]),
        "timezone": site["timezone"], "wind_speed_unit": "ms",
    }, timeout=120)
    r.raise_for_status()
    h = r.json()["hourly"]
    df = pd.DataFrame(h)
    df["time"] = pd.to_datetime(df["time"])
    return df.rename(columns={"time": "timestamp"})


def add_features(df: pd.DataFrame, lat: float) -> pd.DataFrame:
    """Feature engineering (idéntico al entrenamiento)."""
    ts = pd.to_datetime(df["timestamp"])
    doy = ts.dt.dayofyear.values
    hour = ts.dt.hour.values + ts.dt.minute.values / 60.0
    decl = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + doy) / 365.0))
    omega = np.deg2rad(15 * (hour - 12))
    lat_r = np.deg2rad(lat)
    sin_elev = np.clip(np.sin(lat_r) * np.sin(decl)
                       + np.cos(lat_r) * np.cos(decl) * np.cos(omega), 0, None)
    e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * doy / 365.0))
    ghi_toa = 1367.0 * e0 * sin_elev

    out = df.copy()
    out["ghi_toa"] = ghi_toa
    out["sin_elev"] = sin_elev
    out["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    out["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.0)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.0)
    out["kt"] = np.where(ghi_toa > 10, out["shortwave_radiation"] / ghi_toa, 0.0)
    out["kt"] = out["kt"].clip(0, 1.2)
    wd = np.deg2rad(out["wind_direction_100m"])
    out["wind_u_100m"] = -out["wind_speed_100m"] * np.sin(wd)
    out["wind_v_100m"] = -out["wind_speed_100m"] * np.cos(wd)
    out["wind_power_proxy"] = out["wind_speed_100m"] ** 3
    out["cloud_delta_1h"] = out["cloud_cover"].diff().fillna(0)
    out["kt_roll3h"] = out["kt"].rolling(3, min_periods=1).mean()
    return out


def apply_transforms(df: pd.DataFrame, specs: dict) -> pd.DataFrame:
    """Aplica las transformaciones kt/anomalía (idéntico al entrenamiento)."""
    df = df.copy()
    for var, spec in specs.items():
        col = f"{var}__tr"
        if spec["type"] == "divide":
            denom = df[spec["denom"]].values
            min_d = {"ghi_toa": 10.0, "sin_elev": 0.1}.get(spec["denom"], 1.0)
            df[col] = np.where(denom > min_d,
                               df[var].values / np.maximum(denom, min_d), 0.0)
        elif spec["type"] == "anomaly":
            cl = np.asarray(spec["climatology"])
            hour = pd.to_datetime(df["timestamp"]).dt.hour.values
            df[col] = df[var].values - cl[hour]
        else:
            df[col] = df[var].values
    return df


# ---------------------------------------------------------------- decode
def decode(pred_tr: np.ndarray, spec: dict,
            denom: np.ndarray | None = None,
            hours: np.ndarray | None = None) -> np.ndarray:
    """Decodifica la transformada a unidades físicas."""
    pred = np.asarray(pred_tr, dtype=float)
    if spec["type"] == "divide":
        d = np.asarray(denom, dtype=float)
        while d.ndim < pred.ndim:
            d = d[..., None]
        return pred * d
    if spec["type"] == "anomaly":
        cl = np.asarray(spec["climatology"])
        add = cl[np.asarray(hours, dtype=int)]
        while add.ndim < pred.ndim:
            add = add[..., None]
        return pred + add
    return pred


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Forecast 72h PatchTST (Pasto)")
    ap.add_argument("--date", default=None,
                    help="fecha ISO en que termina el contexto (default: hoy)")
    ap.add_argument("--days", type=int, default=25, help="días de contexto a descargar")
    ap.add_argument("--out", default="forecast_72h.json", help="archivo JSON de salida")
    args = ap.parse_args()

    # 1. cargar modelo + metadatos
    print(f"[1/4] Cargando modelo desde {CKPT.name}...")
    ckpt = torch.load(CKPT, map_location=DEVICE, weights_only=False)
    model, feature_cols, fcfg = build_model(ckpt)
    specs = json.loads(SPECS.read_text(encoding="utf-8"))
    stats = pd.read_csv(STATS, index_col=0)
    print(f"      targets: {ckpt['target_names']} | device: {DEVICE}")

    # 2. descargar datos recientes + features + transforms
    print(f"[2/4] Descargando {args.days} días de Open-Meteo...")
    cfg = yaml.safe_load(SITE_CFG.read_text(encoding="utf-8"))
    site = cfg["site"]
    df = fetch_recent(cfg, args.days)
    df = add_features(df, site["latitude"])
    df = apply_transforms(df, specs)
    print(f"      {len(df)} h ({df['timestamp'].iloc[0]} → {df['timestamp'].iloc[-1]})")

    # 3. preparar ventana de contexto
    L = fcfg["context_length"]
    H = fcfg["horizon"]
    if args.date:
        end_ts = pd.Timestamp(args.date)
        ctx_end = df.index[df["timestamp"] <= end_ts].max()
        ctx_end = df.index.get_loc(ctx_end)
    else:
        ctx_end = len(df) - 1
    ctx_start = ctx_end - L + 1
    if ctx_start < 0:
        raise SystemExit(f"Faltan datos de contexto: se necesitan {L} h, "
                         f"solo hay {ctx_end + 1}")

    mean = stats.loc[feature_cols, "mean"].values
    std = stats.loc[feature_cols, "std"].values + 1e-8
    window = df[feature_cols].values[ctx_start: ctx_end + 1]
    x = ((window - mean) / std).astype(np.float32)

    # 4. predecir + decodificar
    print(f"[4/4] Prediciendo {H}h...")
    with torch.no_grad():
        pred_z = model(torch.from_numpy(x).unsqueeze(0).to(DEVICE)).cpu().numpy()[0]

    target_cols = ckpt.get("target_cols", ckpt["target_names"])
    tmean = stats.loc[target_cols, "mean"].values
    tstd = stats.loc[target_cols, "std"].values + 1e-8
    pred = pred_z * tstd[None, :, None] + tmean[None, :, None]

    # geometría solar para el horizonte (denominadores deterministas)
    fc_times = pd.date_range(df["timestamp"].iloc[ctx_end] + pd.Timedelta(hours=1),
                             periods=H, freq="h")
    geo_df = add_features(
        pd.DataFrame({"timestamp": fc_times,
                      **{v: 0.0 for v in cfg["open_meteo"]["hourly_vars"]}}),
        site["latitude"])
    hours_fc = fc_times.hour.values

    for c, name in enumerate(ckpt["target_names"]):
        spec = specs.get(name)
        if not spec:
            continue
        if spec["type"] == "divide":
            d = geo_df[spec["denom"]].values[:H]
            pred[:, c, :] = decode(pred[:, c, :], spec, denom=d)
        elif spec["type"] == "anomaly":
            pred[:, c, :] = decode(pred[:, c, :], spec, hours=hours_fc)

    # restricciones físicas
    for c, name in enumerate(ckpt["target_names"]):
        if name in ("shortwave_radiation", "direct_normal_irradiance",
                    "diffuse_radiation", "wind_speed_100m", "wind_speed_10m",
                    "precipitation"):
            pred[:, c, :] = np.clip(pred[:, c, :], 0, None)

    # 5. JSON de salida
    series = {}
    for c, name in enumerate(ckpt["target_names"]):
        series[name] = {
            f"p{int(q * 100)}": [round(float(v), 3) for v in pred[:, c, i]]
            for i, q in enumerate(fcfg["quantiles"])
        }
    out = {
        "site": site["id"],
        "emitted_at": df["timestamp"].iloc[ctx_end].isoformat(),
        "horizon_hours": H,
        "quantiles": fcfg["quantiles"],
        "timestamps": [t.isoformat() for t in fc_times],
        "series": series,
    }
    Path(args.out).write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\n✅ Forecast guardado en: {Path(args.out).resolve()}")
    for name in ckpt["target_names"][:3]:
        p50 = pred[:, c if False else ckpt["target_names"].index(name),
                   fcfg["quantiles"].index(0.5)]
        print(f"   {name}: media P50 = {p50.mean():.1f}")


if __name__ == "__main__":
    main()
