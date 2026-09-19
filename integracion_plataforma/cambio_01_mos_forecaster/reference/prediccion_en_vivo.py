"""
PREDICCIÓN EN VIVO CORREGIDA — MOS + iTransformer con contexto 2026 real
========================================================================
Contexto: ERA5 de open-meteo archive 2026 (jul-25 → ago-31) para el
iTransformer y persistencia. Forecast: ECMWF IFS en vivo (v1/forecast) 7 días.

Pipeline por variable:
  1. Cargar contexto 2026 → construir features completas del era (igual train)
  2. iTransformer predice 72h desde la última hora del contexto
  3. Descargar forecast ECMWF 7 días en vivo
  4. Construir features MOS por hora futura
  5. Aplicar LightGBM MOS

Horizonte: 7 días ECMWF. El iTransformer solo aporta 72h; más allá del
horizonte 72h usamos la persistencia + ECMWF (sin v1). Se documenta.
"""
import json
import sys
import numpy as np
import pandas as pd
import requests
import torch
import torch.nn as nn
import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
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

# ══════════ CONTEXTO 2026 (open-meteo archive reciente) ══════════
ctx = pd.read_parquet(ROOT / "data" / "recientes" / "contexto_2026.parquet")
ctx.index = pd.to_datetime(ctx.index)
ctx = ctx[~ctx.index.duplicated()].sort_index()
# construir características completas (igual que entrenamiento v1)
ts_c = ctx.index
doy = ts_c.dayofyear.values
hour = ts_c.hour.values + ts_c.minute.values / 60.0
decl = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + doy) / 365.0))
omega = np.deg2rad(15 * (hour - 12))
lat_r = np.deg2rad(SITE["lat"])
sin_elev = np.clip(np.sin(lat_r) * np.sin(decl) + np.cos(lat_r) * np.cos(decl) * np.cos(omega), 0, None)
e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * doy / 365.0))
ghi_toa = 1367.0 * e0 * sin_elev
ctx["ghi_toa"] = ghi_toa
ctx["sin_elev"] = sin_elev
ctx["hour_sin"] = np.sin(2 * np.pi * hour / 24)
ctx["hour_cos"] = np.cos(2 * np.pi * hour / 24)
ctx["doy_sin"] = np.sin(2 * np.pi * doy / 365.0)
ctx["doy_cos"] = np.cos(2 * np.pi * doy / 365.0)
ctx["kt"] = np.where(ghi_toa > 10, ctx["shortwave_radiation"] / ghi_toa, 0.0).clip(0, 1.2)
ctx["kt_roll3h"] = ctx["kt"].rolling(3, min_periods=1).mean()
wd = np.deg2rad(ctx["wind_direction_100m"])
ctx["wind_u_100m"] = -ctx["wind_speed_100m"] * np.sin(wd)
ctx["wind_v_100m"] = -ctx["wind_speed_100m"] * np.cos(wd)
ctx["wind_power_proxy"] = ctx["wind_speed_100m"] ** 3
ctx["cloud_delta_1h"] = ctx["cloud_cover"].diff().fillna(0)

# clima/transform del entrenamiento v1 (del config)
CFG = json.load(open(ROOT / "modelos_itransformer" / "config_modelos.json", encoding="utf-8"))
FEATURES = CFG["FEATURES"]
TARGET_COLS = [f"{t}__tr" for t in TARGETS]
tgt_idx = [FEATURES.index(c) for c in TARGET_COLS]
stats = {k: tuple(v) for k, v in CFG["stats"].items()}
# clim horario del train v1 (cargar del dataset de entrenamiento estándar)
era = pd.read_parquet(ROOT / "experimentos_kaggle" / "04_itransformer" / "resultados_v3" / "era5_v3.parquet")
era.index = pd.to_datetime(era.index)
if "time" in era.columns:
    era = era.drop(columns=["time"])
i_tr = int(len(era) * 0.666)
clim = {}
for var, sp in TRANSFORMS.items():
    if sp["type"] == "anomaly":
        tr = era.iloc[:i_tr + 1]
        hh = pd.to_datetime(tr.index).hour
        clim[var] = tr[var].groupby(hh).mean().values
# transform contexto → __tr
for var, sp in TRANSFORMS.items():
    if sp["type"] == "divide":
        d = ctx[sp["denom"]].values
        mind = {"ghi_toa": 10.0, "sin_elev": 0.1}.get(sp["denom"], 1.0)
        ctx[f"{var}__tr"] = np.where(d > mind, ctx[var].values / np.maximum(d, mind), 0.0)
    elif sp["type"] == "anomaly":
        hrs = ctx.index.hour.values
        ctx[f"{var}__tr"] = ctx[var].values - clim[var][hrs]
    else:
        ctx[f"{var}__tr"] = ctx[var].values

# normalizar features del contexto
Xc = np.zeros((len(ctx), len(FEATURES)), dtype=np.float32)
for c, col in enumerate(FEATURES):
    m, s = stats.get(col, (0.0, 1.0))
    Xc[:, c] = (np.nan_to_num(ctx[col].values) - m) / s


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

# ══════════ FUNCIÓN: geometría solar futura (denominadores divide) ══════════
def sol_geo(time_idx):
    """Devuelve (ghi_toa, sin_elev) para un array de Timestamps."""
    d = np.array([t.dayofyear for t in time_idx])
    h = np.array([t.hour + t.minute / 60.0 for t in time_idx])
    dec = np.deg2rad(23.45) * np.sin(np.deg2rad(360 * (284 + d) / 365.0))
    om = np.deg2rad(15 * (h - 12))
    sine = np.clip(np.sin(lat_r) * np.sin(dec) + np.cos(lat_r) * np.cos(dec) * np.cos(om), 0, None)
    e0 = 1 + 0.033 * np.cos(np.deg2rad(360 * d / 365.0))
    gtoa = 1367.0 * e0 * sine
    return gtoa, sine


# ══════════ 1) iTransformer: contexto = últimas L horas del contexto 2026 ══════════
n_ctx = len(ctx)
i0 = n_ctx - L   # ventana que termina en la última hora del contexto
last_t = ctx.index[-1]
print(f"[CONTEXTO] {len(ctx)}h | última {last_t}")
if i0 < 0:
    raise RuntimeError(f"Contexto insuficiente: {n_ctx}h < {L}h para el iTransformer")

x_in = torch.tensor(Xc[i0:i0 + L], dtype=torch.float32).unsqueeze(0).to(DEVICE)
with torch.no_grad():
    pr = model(x_in).cpu().numpy()[0]

# horizonte futuro: H horas después de last_t
fut_idx = [last_t + pd.Timedelta(hours=hh + 1) for hh in range(H)]
hrs_fut = np.array([t.hour for t in fut_idx])
fut_toa, fut_sin = sol_geo(fut_idx)
v1_phys = {}
for ti, var in enumerate(TARGETS):
    m, s = stats[TARGET_COLS[ti]]
    p_tr = pr[..., ti, 1] * s + m
    tr_ = TRANSFORMS[var]
    if tr_["type"] == "divide":
        den = fut_toa if tr_["denom"] == "ghi_toa" else fut_sin
        v1_phys[var] = p_tr * den
    elif tr_["type"] == "anomaly":
        v1_phys[var] = p_tr + clim[var][hrs_fut]
    else:
        v1_phys[var] = p_tr

print("[iTransformer] 72h predichas desde", fut_idx[0])

# ══════════ 2) DESCARGAR FORECAST ECMWF EN VIVO (7 días) ══════════
VARS = "shortwave_radiation,cloud_cover,temperature_2m,wind_speed_10m,relative_humidity_2m,surface_pressure"
r = requests.get("https://api.open-meteo.com/v1/forecast",
                 params=dict(latitude=SITE["lat"], longitude=SITE["lon"], models="ecmwf_ifs025",
                             hourly=VARS, forecast_days=7, timezone="America/Bogota"), timeout=90)
fc = r.json()["hourly"]
fct = pd.to_datetime(fc["time"])
ecw = {t: np.array(fc[col]) for col, t in [("shortwave_radiation", "ghi"),
                                           ("cloud_cover", "nubes"),
                                           ("temperature_2m", "temp"),
                                           ("wind_speed_10m", "viento"),
                                           ("relative_humidity_2m", "rh"),
                                           ("surface_pressure", "pres")]}
# geometría solar futura (días del forecast)
fc_ghi_toa, _ = sol_geo(fct)

# persistencia: para cada hora futura, la hora equivalente en el contexto 2026
# (misma hora de calendario, último día disponible del contexto)
pers = {}
pers_h = fct.hour.values
ctx_hour = ctx.index.hour.values
for var in TARGETS:
    arr = np.full(len(fct), np.nan)
    for ii in range(len(fct)):
        hr = pers_h[ii]
        # último valor del contexto a esa hora
        idx_cand = np.where(ctx_hour == hr)[0]
        if len(idx_cand):
            arr[ii] = ctx[var].values[idx_cand[-1]]
        # no coincide: climatología del train
        if np.isnan(arr[ii]):
            arr[ii] = clim[var][hr] if var in clim else 0.0
    pers[var] = arr

# ══════════ 3) APLICAR MOS POR VARIABLE (7 días = 168h) ══════════
OUT = ROOT / "reports" / "prediccion_en_vivo"
OUT.mkdir(parents=True, exist_ok=True)
predicciones = {}
corte_v1 = H  # el v1 solo aporta 72h

for var in TARGETS:
    proxy_tag = PROXY[var]
    proxy = ecw[proxy_tag].copy() if proxy_tag in ecw else np.zeros(len(fct))
    if var in PROXY_SCALE:
        proxy = proxy * PROXY_SCALE[var]
    # v1 del iTransformer (72h) → para toda la ventana, más allá de 72h usar media v1
    v1_full = np.full(len(fct), float(np.mean(v1_phys[var][:H]))) if var in v1_phys else np.zeros(len(fct))
    if var in v1_phys:
        v1_full[:corte_v1] = v1_phys[var][:corte_v1]
    # features MOS
    X = np.stack([proxy, v1_full, np.nan_to_num(pers[var], nan=0.0),
                  fc_ghi_toa, fct.hour.values,
                  np.nan_to_num(ecw["nubes"], nan=0.0),
                  np.nan_to_num(ecw["temp"], nan=0.0),
                  np.nan_to_num(ecw["viento"], nan=0.0)], axis=1)
    X = np.nan_to_num(X, nan=0.0)
    mdl = lgb.Booster(model_file=str(ROOT / "reports" / "stacking" / f"lgbm_mos_{var}.txt"))
    pred = mdl.predict(X)
    predicciones[var] = {"time": [str(t) for t in fct], "pred": [float(x) for x in pred],
                         "ghi_toa": [float(x) for x in fc_ghi_toa],
                         "v1_72h": [float(x) for x in v1_phys.get(var, [])[:H]]}

json.dump(predicciones, open(OUT / "prediccion_7dias.json", "w"), indent=2)
print(f"\n✅ Predicción 7 días → {OUT / 'prediccion_7dias.json'}")
print(f"Cobertura: {len(fct)}h ({fct.min()} → {fct.max()})")
# muestras GHI
g = predicciones["shortwave_radiation"]
print("\nGHI pronosticado diurno (W/m²) primeros días:")
for i, t in enumerate(g["time"][:24]):
    if int(t[11:13]) in (6, 12, 18):
        print(f"  {t}: {g['pred'][i]:.0f}")