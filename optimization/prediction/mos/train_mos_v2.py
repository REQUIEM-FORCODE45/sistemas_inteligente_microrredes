# -*- coding: utf-8 -*-
"""Reentrena SOLO cloud_cover y wind_speed_100m (sprint-1 5.7/T3).

Replica EXACTA del protocolo de la linea base
(`integracion_plataforma/cambio_01_mos_forecaster/reference/
mos_multivariable.py`): mismas ventanas (train 2024, test jul-dic 2025,
mismas seeds), mismos hiperparametros, mismo v1 del iTransformer.
Diferencias, solo las de 5.7:
  - cloud_cover: las mismas 8 features que los demas (sale del pass-through)
  - wind_speed_100m: [wind10_ecmwf crudo SIN x1.3, pers_h24, hora]
    (sin el wind100 del NWP)
  - nombres _v2, nunca sobrescribe; LF normalizado (CRLF rompe sha256);
    manifiesto sha256 de los 4 (2 nuevos + 2 viejos); tabla T4.

Uso:
  python3 -m optimization.prediction.mos.train_mos_v2 --data-dir DIR
DIR contiene: era5_v3.parquet + ecmwf/ecmwf_{YYYY}_{MM}.parquet
(NO versionados; sin ellos falla con mensaje claro, no inventa datos).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

import lightgbm as lgb  # noqa: E402
import torch  # noqa: E402
import torch.nn as nn  # noqa: E402

from optimization.prediction.mos_forecaster import _V2_FEATS  # noqa: E402

SITE = {"lat": 1.2136, "lon": -77.2811, "tz": "America/Bogota"}
L, H, Q = 512, 72, [0.1, 0.5, 0.9]
TARGETS_V2 = ["cloud_cover", "wind_speed_100m"]
TRANSFORMS = {
    "shortwave_radiation": {"type": "divide", "denom": "ghi_toa"}
    , "direct_normal_irradiance": {"type": "divide", "denom": "sin_elev"}
    , "diffuse_radiation": {"type": "divide", "denom": "ghi_toa"}
    , "temperature_2m": {"type": "anomaly"}
    , "relative_humidity_2m": {"type": "anomaly"}
    , "cloud_cover": {"type": "anomaly"}
    , "wind_speed_100m": {"type": "anomaly"}
    , "wind_speed_10m": {"type": "anomaly"}
    , "surface_pressure": {"type": "anomaly"}
    , "precipitation": {"type": "none"}
}
MIND = {"ghi_toa": 10.0, "sin_elev": 0.1}
HP = dict(n_estimators=500, learning_rate=0.04, num_leaves=63,
          min_child_samples=30, subsample=0.8, colsample_bytree=0.7,
          random_state=42)


def _engineer(era: pd.DataFrame) -> pd.DataFrame:
    ts = pd.to_datetime(era.index)
    doy, hour = ts.dayofyear.values, ts.hour.values + ts.minute.values / 60.0
    decl = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + doy) / 365.0))
    omega = np.deg2rad(15 * (hour - 12))
    lat_r = np.deg2rad(SITE["lat"])
    sin_elev = np.clip(np.sin(lat_r) * np.sin(decl)
                       + np.cos(lat_r) * np.cos(decl) * np.cos(omega), 0, None)
    e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * doy / 365.0))
    era["ghi_toa"] = 1367.0 * e0 * sin_elev
    era["sin_elev"] = sin_elev
    era["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    era["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    era["doy_sin"] = np.sin(2 * np.pi * doy / 365.0)
    era["doy_cos"] = np.cos(2 * np.pi * doy / 365.0)
    era["kt"] = np.where(era["ghi_toa"] > 10,
                         era["shortwave_radiation"] / era["ghi_toa"],
                         0.0).clip(0, 1.2)
    era["kt_roll3h"] = era["kt"].rolling(3, min_periods=1).mean()
    wd = np.deg2rad(era["wind_direction_100m"])
    era["wind_u_100m"] = -era["wind_speed_100m"] * np.sin(wd)
    era["wind_v_100m"] = -era["wind_speed_100m"] * np.cos(wd)
    era["wind_power_proxy"] = era["wind_speed_100m"] ** 3
    era["cloud_delta_1h"] = era["cloud_cover"].diff().fillna(0)
    return era


def _pers_idx(i, hh):
    """Indice causal de pers_h24 (5.8/T3): ultimo dia del contexto
    [i+L-24, i+L-1] con la misma hora que t_idx=i+L+hh. Dia 1 coincide
    con t_idx-24; dias 2-3 usan la ultima observacion antes del anchor.
    Prohibido leer >= i + L (seria futuro)."""
    p_idx = int(i) + L - 24 + (int(hh) % 24)
    assert p_idx < int(i) + L, \
        f"Fuga temporal en pers_h24: {p_idx} >= {int(i) + L}"
    return p_idx


def _row_for(var, i, hh, era, ecw, v1_all):
    """Una fila (X-dict, y) para `var` en la ventana i, hora hh."""
    i = int(i)
    t_idx = i + L + hh
    v1 = v1_all[var][hh]
    pers = float(era[var].values[_pers_idx(i, hh)])
    if var == "wind_speed_100m":
        # 5.7/T2: viento10 crudo SIN escala + pers + hora.
        X = {"wind10_ecmwf": float(ecw["viento"].values[t_idx]),
             "pers_h24": pers,
             "hora": float(era.index[t_idx].hour)}
    else:
        # 5.7/T1: cloud como los demas (8 features).
        X = {"proxy_ecmwf": float(ecw["nubes"].values[t_idx]),
             "v1": float(v1),
             "pers_h24": pers,
             "ghi_toa": float(era["ghi_toa"].values[t_idx]),
             "hora": float(era.index[t_idx].hour),
             "nubes_ecmwf": float(ecw["nubes"].values[t_idx]),
             "temp_ecmwf": float(ecw["temp"].values[t_idx]),
             "viento_ecmwf": float(ecw["viento"].values[t_idx])}
    return X, float(era[var].values[t_idx])


def main() -> int:
    ap = argparse.ArgumentParser(description="Reentrena cloud+wind v2 (5.7).")
    ap.add_argument("--data-dir", required=True,
                    help="dir con era5_v3.parquet + ecmwf/ecmwf_YYYY_MM.parquet")
    ap.add_argument("--outdir", default=None,
                    help="default: optimization/prediction/mos/models/")
    args = ap.parse_args()
    data = Path(args.data_dir)
    era_p = data / "era5_v3.parquet"
    if not era_p.exists():
        raise SystemExit(
            f"Sin datos: falta {era_p}. Los parquet de entrenamiento no "
            "estan en el repo; indica --data-dir con era5_v3.parquet + "
            "ecmwf/ecmwf_YYYY_MM.parquet (no se inventan datos).")
    ecmwf_dir = data / "ecmwf"

    era = pd.read_parquet(era_p)
    era.index = pd.to_datetime(era.index)
    if "time" in era.columns:
        era = era.drop(columns=["time"])
    era = _engineer(era)

    i_tr = int(len(era) * 0.666)
    clim = {}
    for var, sp in TRANSFORMS.items():
        if sp["type"] == "anomaly":
            tr = era.iloc[:i_tr + 1]
            hh = pd.to_datetime(tr.index).hour
            clim[var] = tr[var].groupby(hh).mean().values
    for var, sp in TRANSFORMS.items():
        if sp["type"] == "divide":
            d = era[sp["denom"]].values
            mind = MIND.get(sp["denom"], 1.0)
            era[f"{var}__tr"] = np.where(
                d > mind, era[var].values / np.maximum(d, mind), 0.0)
        elif sp["type"] == "anomaly":
            era[f"{var}__tr"] = (era[var].values
                                 - clim[var][pd.to_datetime(era.index).hour.values])
        else:
            era[f"{var}__tr"] = era[var].values

    itr_dir = REPO / "optimization" / "prediction" / "mos" / "itransformer"
    cfg = json.loads((itr_dir / "config_modelos.json").read_text())
    features, stats = list(cfg["FEATURES"]), cfg["stats"]
    tgt_idx = [features.index(f"{t}__tr") for t in
               ["shortwave_radiation", "direct_normal_irradiance",
                "diffuse_radiation", "temperature_2m",
                "relative_humidity_2m", "cloud_cover",
                "wind_speed_100m", "wind_speed_10m",
                "surface_pressure", "precipitation"]]
    Xg = era[features].values.astype(np.float32)
    for c, col in enumerate(features):
        m, s = stats[col]
        Xg[:, c] = (Xg[:, c] - m) / s

    class _IT(nn.Module):
        def __init__(self, n_channels):
            super().__init__()
            self.embed = nn.Linear(L, 128)
            self.variable_embed = nn.Parameter(torch.randn(1, n_channels, 128) * 0.02)
            enc = nn.TransformerEncoderLayer(d_model=128, nhead=8,
                                             dim_feedforward=256, dropout=0.0,
                                             batch_first=True, activation="gelu")
            self.encoder = nn.TransformerEncoder(enc, 3)
            self.head = nn.Linear(128, H * 3)
            self.register_buffer("tgt_idx",
                                 torch.tensor(tgt_idx, dtype=torch.long))

        def forward(self, x):
            mean = x.mean(dim=1, keepdim=True)
            std = x.std(dim=1, keepdim=True) + 1e-6
            x = (x - mean) / std
            z = self.embed(x.permute(0, 2, 1)) + self.variable_embed
            z = self.encoder(z)
            out = self.head(z).view(x.shape[0], x.shape[2], H, 3)
            out = out.permute(0, 2, 1, 3)
            return (out * std.unsqueeze(-1)
                    + mean.unsqueeze(-1)).index_select(2, self.tgt_idx)

    model = _IT(len(features))
    sd = torch.load(itr_dir / "modelo_b.pt", map_location="cpu")
    if isinstance(sd, dict) and "state_dict" in sd:
        sd = sd["state_dict"]
    model.load_state_dict({k.replace("model.", ""): v for k, v in sd.items()},
                          strict=True)
    model.eval()

    def v1_phys(i):
        x = torch.tensor(Xg[i:i + L], dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            pr = model(x).cpu().numpy()[0]
        hrs = pd.to_datetime(era.index[i + L:i + L + H]).hour.values
        out = {}
        for ti, var in enumerate(["shortwave_radiation",
                                  "direct_normal_irradiance",
                                  "diffuse_radiation", "temperature_2m",
                                  "relative_humidity_2m", "cloud_cover",
                                  "wind_speed_100m", "wind_speed_10m",
                                  "surface_pressure", "precipitation"]):
            m, s = stats[f"{var}__tr"]
            p_tr = pr[..., ti, 1] * s + m
            tr_ = TRANSFORMS[var]
            if tr_["type"] == "divide":
                out[var] = p_tr * era[tr_["denom"]].values[i + L:i + L + H]
            elif tr_["type"] == "anomaly":
                out[var] = p_tr + clim[var][hrs]
            else:
                out[var] = p_tr
        return out

    ecmwf_cols = {"shortwave_radiation": "ghi", "cloud_cover": "nubes",
                  "temperature_2m": "temp", "wind_speed_10m": "viento",
                  "relative_humidity_2m": "rh", "surface_pressure": "pres"}
    ecw = {}
    for col_era5, tag in ecmwf_cols.items():
        parts, ok = [], True
        for y in (2024, 2025):
            for mm in range(1, 13):
                p = ecmwf_dir / f"ecmwf_{y}_{mm:02d}.parquet"
                if not p.exists():
                    ok = False
                    break
                parts.append(pd.read_parquet(p)[[col_era5]])
            if not ok:
                break
        if not ok or not parts:
            raise SystemExit(f"Sin datos: falta {ecmwf_dir}/ecmwf_YYYY_MM.parquet")
        df = pd.concat(parts)
        df = df[~df.index.duplicated()].sort_index()
        s = df[col_era5].reindex(era.index).fillna(df[col_era5].median())
        ecw[tag] = s
    ecw = pd.DataFrame(ecw)

    def idxs_full(m0, m1, year):
        a = pd.Timestamp(f"{year}-{m0:02d}-01")
        b = (pd.Timestamp(f"{year}-{m1:02d}-01")
             + pd.offsets.MonthEnd(1)) + pd.Timedelta(hours=23)
        if era.index.tz is not None:
            a, b = a.tz_localize(era.index.tz), b.tz_localize(era.index.tz)
        return np.array([i for i in range(L, len(era) - L - H)
                         if a <= era.index[i + L]
                         and era.index[i + L + H - 1] <= b])

    idx_tr = np.random.default_rng(5).choice(
        np.concatenate([idxs_full(m, m, 2024) for m in range(1, 13)]),
        size=2500, replace=False)
    idx_te = np.random.default_rng(0).choice(
        idxs_full(7, 12, 2025), size=400, replace=False)

    outdir = Path(args.outdir) if args.outdir else (
        REPO / "optimization" / "prediction" / "mos" / "models")
    outdir.mkdir(parents=True, exist_ok=True)
    t4 = {}
    for var in TARGETS_V2:
        feat = list(_V2_FEATS[var])
        for split, idxs in (("tr", idx_tr), ("te", idx_te)):
            Xs, ys = [], []
            for i in idxs:
                v1_all = v1_phys(int(i))
                for hh in range(H):
                    Xd, y = _row_for(var, i, hh, era, ecw, v1_all)
                    Xs.append([Xd[c] for c in feat])
                    ys.append(y)
            if split == "tr":
                Xtr, ytr = (np.nan_to_num(np.array(Xs), nan=0.0),
                            np.array(ys))
            else:
                Xte, yte = (np.nan_to_num(np.array(Xs), nan=0.0),
                            np.array(ys))
        dtr = None  # (se entrena con la API sklearn, DataFrame con nombres)
        reg = lgb.LGBMRegressor(verbose=-1, **HP)
        reg.fit(pd.DataFrame(Xtr, columns=feat), ytr)
        pred = reg.predict(pd.DataFrame(Xte, columns=feat))
        mae = float(np.mean(np.abs(pred - yte)))
        std_p, mean_p = float(np.std(pred)), float(np.mean(pred))
        corr = (float(np.corrcoef(pred, yte)[0, 1])
                if np.std(pred) > 0 and np.std(yte) > 0 else 0.0)
        base = float(np.mean(ytr))  # media de train (skill 0.0 por def.)
        mae_base = float(np.mean(np.abs(base - yte)))
        skill = round(1 - mae / mae_base, 4) if mae_base else None
        t4[var] = {"n_test": int(len(yte)), "MAE": round(mae, 4),
                   "corr": round(corr, 4), "std": round(std_p, 4),
                   "media": round(mean_p, 4), "skill": skill,
                   "baseline_media_train": round(base, 4),
                   "baseline_MAE": round(mae_base, 4)}
        if var == "cloud_cover":
            const = float(np.mean(np.abs(100.0 - yte)))
            t4[var]["baseline_constante_100_MAE"] = round(const, 4)
        dest = outdir / f"lgbm_mos_{var}_v2.txt"
        reg.booster_.save_model(str(dest))
        raw = dest.read_bytes().replace(b"\r\n", b"\n")  # CRLF->LF
        dest.write_bytes(raw)
        # el booster recargado del .txt normalizado debe predecir igual
        b2 = lgb.Booster(model_file=str(dest))
        assert b2.num_feature() == len(feat)
        assert np.allclose(b2.predict(pd.DataFrame(Xte[:8], columns=feat)),
                           reg.predict(pd.DataFrame(Xte[:8], columns=feat)))
        print(f"{var:<18} MAE {mae:.4f} corr {corr:.3f} "
              f"std {std_p:.2f} media {mean_p:.2f} skill {skill} "
              f"(base {mae_base:.4f}) -> {dest.name}")
    verdict = {
        "wind_speed_100m_MAE<=1.0": t4["wind_speed_100m"]["MAE"] <= 1.0,
        "cloud_cover_reportado": True,
    }
    manifest = {
        "script": "optimization/prediction/mos/train_mos_v2.py",
        "data_dir": str(data), "targets": TARGETS_V2,
        "features": {v: list(_V2_FEATS[v]) for v in TARGETS_V2},
        "hyperparams": HP, "seeds": {"train": 5, "test": 0},
        "ventanas": {"train": "2024 (2500)", "test": "jul-dic 2025 (400)"},
        "tabla_T4": t4, "veredicto": verdict, "archivos": {},
    }
    models_repo = (REPO / "optimization" / "prediction" / "mos" / "models")
    for v in TARGETS_V2:
        for tag, p in (("nuevo", outdir / f"lgbm_mos_{v}_v2.txt"),
                       ("viejo", models_repo / f"lgbm_mos_{v}.txt")):
            h = hashlib.sha256(p.read_bytes()).hexdigest()
            manifest["archivos"][f"{v}_{tag}"] = {"path": str(p), "sha256": h,
                                                  "bytes": p.stat().st_size}
    mp = outdir / "mos_v2_manifiesto.json"
    mp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"manifiesto: {mp}")
    print("veredicto:", verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
