"""
MOS-STACKING MULTIVARIABLE — LightGBM MOS por variable
======================================================
Extiende el MOS de GHI a las demás variables. Para cada target:
  Features (8): proxy_ecmwf (variable pronosticada por ECMWF), ghi_v1,
                pers_h24, ghi_toa, hora, nubes_ecmwf, temp_ecmwf, viento_ecmwf
  Target: variable ERA5. Train 2024, test jul-dic 2025.
Variables: GHI, DNI, DHI, temp, RH, nubes, viento100, viento10, presión, precip.
Proxies ECMWF: GHI→ghi, DNI/DHI→ghi, temp→temp, RH→rh, nubes→nubes,
viento10→viento, viento100→viento*1.3, presión→pres, precip→0.
"""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import lightgbm as lgb

ROOT = Path(__file__).resolve().parents[1]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

SITE = {"lat": 1.2136, "lon": -77.2811, "tz": "America/Bogota"}
L, H, Q = 512, 72, [0.1, 0.5, 0.9]
MCFG = dict(d_model=128, n_heads=8, e_layers=3, d_ff=256, dropout=0.2)
TARGETS = ["shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation",
           "temperature_2m", "relative_humidity_2m", "cloud_cover",
           "wind_speed_100m", "wind_speed_10m", "surface_pressure", "precipitation"]
TRANSFORMS = {
    "shortwave_radiation": {"type": "divide", "denom": "ghi_toa"},
    "direct_normal_irradiance": {"type": "divide", "denom": "sin_elev"},
    "diffuse_radiation": {"type": "divide", "denom": "ghi_toa"},
    "temperature_2m": {"type": "anomaly"},
    "relative_humidity_2m": {"type": "anomaly"},
    "cloud_cover": {"type": "anomaly"},
    "wind_speed_100m": {"type": "anomaly"},
    "wind_speed_10m": {"type": "anomaly"},
    "surface_pressure": {"type": "anomaly"},
    "precipitation": {"type": "none"},
}
PROXY = {"shortwave_radiation": "ghi", "direct_normal_irradiance": "ghi",
         "diffuse_radiation": "ghi", "temperature_2m": "temp",
         "relative_humidity_2m": "rh", "cloud_cover": "nubes",
         "wind_speed_100m": "viento", "wind_speed_10m": "viento",
         "surface_pressure": "pres", "precipitation": "ghi"}
PROXY_SCALE = {"wind_speed_100m": 1.3, "precipitation": 0.0}

era = pd.read_parquet(ROOT / "experimentos_kaggle" / "04_itransformer" / "resultados_v3" / "era5_v3.parquet")
era.index = pd.to_datetime(era.index)
if "time" in era.columns:
    era = era.drop(columns=["time"])

ts = pd.to_datetime(era.index)
doy = ts.dayofyear.values
hour = ts.hour.values + ts.minute.values / 60.0
decl = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + doy) / 365.0))
omega = np.deg2rad(15 * (hour - 12))
lat_r = np.deg2rad(SITE["lat"])
sin_elev = np.clip(np.sin(lat_r) * np.sin(decl) + np.cos(lat_r) * np.cos(decl) * np.cos(omega), 0, None)
e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * doy / 365.0))
ghi_toa = 1367.0 * e0 * sin_elev
era["ghi_toa"] = ghi_toa
era["sin_elev"] = sin_elev
era["hour_sin"] = np.sin(2 * np.pi * hour / 24)
era["hour_cos"] = np.cos(2 * np.pi * hour / 24)
era["doy_sin"] = np.sin(2 * np.pi * doy / 365.0)
era["doy_cos"] = np.cos(2 * np.pi * doy / 365.0)
era["kt"] = np.where(ghi_toa > 10, era["shortwave_radiation"] / ghi_toa, 0.0).clip(0, 1.2)
era["kt_roll3h"] = era["kt"].rolling(3, min_periods=1).mean()
wd = np.deg2rad(era["wind_direction_100m"])
era["wind_u_100m"] = -era["wind_speed_100m"] * np.sin(wd)
era["wind_v_100m"] = -era["wind_speed_100m"] * np.cos(wd)
era["wind_power_proxy"] = era["wind_speed_100m"] ** 3
era["cloud_delta_1h"] = era["cloud_cover"].diff().fillna(0)

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
        mind = {"ghi_toa": 10.0, "sin_elev": 0.1}.get(sp["denom"], 1.0)
        era[f"{var}__tr"] = np.where(d > mind, era[var].values / np.maximum(d, mind), 0.0)
    elif sp["type"] == "anomaly":
        era[f"{var}__tr"] = era[var].values - clim[var][pd.to_datetime(era.index).hour.values]
    else:
        era[f"{var}__tr"] = era[var].values

CFG = json.load(open(ROOT / "modelos_itransformer" / "config_modelos.json", encoding="utf-8"))
FEATURES = CFG["FEATURES"]
TARGET_COLS = [f"{t}__tr" for t in TARGETS]
tgt_idx = [FEATURES.index(c) for c in TARGET_COLS]
stats = {k: tuple(v) for k, v in CFG["stats"].items()}
Xg = era[FEATURES].values.astype(np.float32)
for c, col in enumerate(FEATURES):
    m, s = stats[col]
    Xg[:, c] = (Xg[:, c] - m) / s


class iTransformer(nn.Module):
    def __init__(self, n_channels):
        super().__init__()
        self.embed = nn.Linear(L, MCFG["d_model"])
        self.variable_embed = nn.Parameter(torch.randn(1, n_channels, MCFG["d_model"]) * 0.02)
        enc = nn.TransformerEncoderLayer(d_model=MCFG["d_model"], nhead=MCFG["n_heads"],
                                         dim_feedforward=MCFG["d_ff"], dropout=0.0,
                                         batch_first=True, activation="gelu")
        self.encoder = nn.TransformerEncoder(enc, MCFG["e_layers"])
        self.head = nn.Linear(MCFG["d_model"], H * len(Q))
        self.register_buffer("tgt_idx", torch.tensor(tgt_idx, dtype=torch.long))

    def forward(self, x):
        B, Lc, C = x.shape
        mean = x.mean(dim=1, keepdim=True); std = x.std(dim=1, keepdim=True) + 1e-6
        x = (x - mean) / std
        z = self.embed(x.permute(0, 2, 1)) + self.variable_embed
        z = self.encoder(z)
        out = self.head(z).view(B, C, H, len(Q)).permute(0, 2, 1, 3)
        return (out * std.unsqueeze(-1) + mean.unsqueeze(-1)).index_select(2, self.tgt_idx)


model = iTransformer(len(FEATURES)).to(DEVICE)
sd = torch.load(ROOT / "modelos_itransformer" / "modelo_b.pt", map_location=DEVICE)
if isinstance(sd, dict) and "state_dict" in sd:
    sd = sd["state_dict"]
model.load_state_dict({k.replace("model.", ""): v for k, v in sd.items()}, strict=False)
model.eval()


def v1_predict_phys(i):
    x = torch.tensor(Xg[i:i + L], dtype=torch.float32).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        pr = model(x).cpu().numpy()[0]
    hrs = pd.to_datetime(era.index[i + L:i + L + H]).hour.values
    out = {}
    for ti, var in enumerate(TARGETS):
        m, s = stats[TARGET_COLS[ti]]
        p_tr = pr[..., ti, 1] * s + m
        tr_ = TRANSFORMS[var]
        if tr_["type"] == "divide":
            d = era[tr_["denom"]].values[i + L:i + L + H]
            out[var] = p_tr * d
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
    parts = [pd.read_parquet(f"data/ecmwf/ecmwf_{y}_{m:02d}.parquet")[[col_era5]]
             for y in [2024, 2025] for m in range(1, 13)]
    df = pd.concat(parts)
    df = df[~df.index.duplicated()].sort_index()
    s = df[col_era5].reindex(era.index)
    # rellenar None/NaN con la mediana de la serie (evita float(None))
    s = s.fillna(s.median())
    ecw[tag] = s
ecw = pd.DataFrame(ecw)


def build_var(idx_windows, var):
    """Features y target para UNA variable."""
    X, y = [], []
    for i in idx_windows:
        v1 = v1_predict_phys(i)
        t_idx = np.arange(i + L, i + L + H)
        h24 = t_idx - 24
        for hh in range(H):
            idx_t = t_idx[hh]
            proxy_tag = PROXY[var]
            proxy = ecw[proxy_tag].values[idx_t] if proxy_tag in ecw else 0.0
            if var in PROXY_SCALE:
                proxy = proxy * PROXY_SCALE[var]
            v1v = float(v1[var][hh])
            pers = float(era[var].values[h24[hh]]) if h24[hh] >= 0 else np.nan
            row = [
                proxy, v1v, pers,
                float(era["ghi_toa"].values[idx_t]),
                float(era.index[idx_t].hour),
                float(ecw["nubes"].values[idx_t]),
                float(ecw["temp"].values[idx_t]),
                float(ecw["viento"].values[idx_t]),
            ]
            X.append(row)
            y.append(float(era[var].values[idx_t]))
    return np.array(X), np.array(y)


def idxs_full(month0, month1, year):
    m0 = pd.Timestamp(f"{year}-{month0:02d}-01")
    m1 = (pd.Timestamp(f"{year}-{month1:02d}-01") + pd.offsets.MonthEnd(1)) + pd.Timedelta(hours=23)
    return np.array([i for i in range(L, len(era) - L - H)
                     if m0 <= era.index[i + L] and era.index[i + L + H - 1] <= m1])


idx_tr_all = np.concatenate([idxs_full(m, m, 2024) for m in range(1, 13)])
rng = np.random.default_rng(5)
idx_tr = rng.choice(idx_tr_all, size=min(2500, len(idx_tr_all)), replace=False)
idx_te = idxs_full(7, 12, 2025)
rng2 = np.random.default_rng(0)
idx_te = rng2.choice(idx_te, size=min(400, len(idx_te)), replace=False)

FEAT_NAMES = ["proxy_ecmwf", "v1", "pers_h24", "ghi_toa", "hora",
              "nubes_ecmwf", "temp_ecmwf", "viento_ecmwf"]


def mae(a, b):
    return float(np.mean(np.abs(a - b)))


OUT = ROOT / "reports" / "stacking"
OUT.mkdir(parents=True, exist_ok=True)
resultados = {}
print("\n" + "=" * 80)
print("MOS MULTIVARIABLE — test jul-dic 2025")
print("=" * 80)
print(f"{'variable':<28}{'v1 MAE':>10}{'MOS MAE':>10}{'Δ%':>9}")
for var in TARGETS:
    Xtr, ytr = build_var(idx_tr, var)
    Xte, yte = build_var(idx_te, var)
    Xtr = np.nan_to_num(Xtr, nan=0.0); Xte = np.nan_to_num(Xte, nan=0.0)
    # v1 es la col 1 (proxy, v1, pers...)
    pred_v1 = Xte[:, 1]
    lgbm = lgb.LGBMRegressor(n_estimators=500, learning_rate=0.04, num_leaves=63,
                             min_child_samples=30, subsample=0.8, colsample_bytree=0.7,
                             random_state=42, verbose=-1)
    lgbm.fit(Xtr, ytr)
    pred_mos = lgbm.predict(Xte)
    m_v1 = mae(pred_v1, yte)
    m_mos = mae(pred_mos, yte)
    d = 100 * (m_mos - m_v1) / m_v1
    resultados[var] = {"v1": m_v1, "mos": m_mos, "delta_pct": d}
    lgbm.booster_.save_model(str(OUT / f"lgbm_mos_{var}.txt"))
    print(f"{var:<28}{m_v1:>10.2f}{m_mos:>10.2f}{d:>9.1f}")

json.dump(resultados, open(OUT / "mos_multivariable.json", "w"), indent=2)
print(f"\n✅ {OUT / 'mos_multivariable.json'}")
print("[LISTO] MOS multivariable")