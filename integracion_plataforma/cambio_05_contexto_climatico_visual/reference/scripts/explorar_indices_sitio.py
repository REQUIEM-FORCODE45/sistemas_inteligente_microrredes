"""EXPLORACION DE INDICES NOAA vs EL CLIMA DE PASTO (experimento, 1940-2025).

Por que la serie larga: con solo 2020-2025 (72 meses) una correlacion puede
quedar dominada por UN evento (La Nina 2020-22 o El Nino 2023-24) y concluir
de mas. Con 1940-2025 hay ~1.000 meses y la estadistica aguanta.

Que hace:
  1. completa los indices NOAA que faltaban: RONI (CPC) y MEI v2 (PSL)
  2. deriva TNI (Nino1+2 - Nino4) y el sabor EP/CP (Nino3 - Nino4)
  3. baja la serie LARGA del sitio con ERA5 (Open-Meteo archive, 1940->2025),
     nubosidad y radiacion diarias por decadas -> mensual
  4. correlaciona CADA indice contra nubosidad y GHI del sitio, con desfases
     0..3 meses (el ENSO no actua el mismo mes), y prueba de significancia
  5. compara la clasificacion de modo segun ONI vs segun RONI
  6. compuestos por modo (Nina / neutral / Nino) con su n

Salidas: data/indices/indices_mensual.parquet (ampliado)
         data/indices/sitio_pasto_1940_2025.parquet
         reports/evolutivo/indices/exploracion_indices.json
         reports/evolutivo/indices/fig_A4_puente.png
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
DIDX = ROOT / "data" / "indices"
OUT = ROOT / "reports" / "evolutivo" / "indices"
(OUT).mkdir(parents=True, exist_ok=True)
LAT, LON = 1.2136, -77.2811
EST_A_MES = {"DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4, "AMJ": 5, "MJJ": 6,
             "JJA": 7, "JAS": 8, "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12}


def bajar(url: str, nombre: str) -> str:
    r = urllib.request.Request(url, headers={"User-Agent": "tesis-microrred/1.0"})
    with urllib.request.urlopen(r, timeout=90) as h:
        t = h.read().decode("utf-8", errors="replace")
    (DIDX / "raw" / nombre).write_text(t, encoding="utf-8")
    print(f"  [indice] {nombre:22} {len(t):>8} chars")
    return t


# ══════════════════════════ 1-2. INDICES FALTANTES
print("Completando indices NOAA...")
ind = pd.read_parquet(DIDX / "indices_mensual.parquet")
ind.index = pd.to_datetime(ind.index)

txt = bajar("https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt", "RONI.ascii.txt")
roni = {}
for ln in txt.splitlines():
    p = ln.split()
    if len(p) >= 3 and p[0] in EST_A_MES:
        try:
            v = float(p[2] if len(p) == 3 else p[3])     # RONI: SEAS YR ANOM
            roni[pd.Timestamp(int(p[1]), EST_A_MES[p[0]], 1)] = v
        except ValueError:
            pass
ind["roni"] = pd.Series(roni).sort_index()

try:
    txt = bajar("https://psl.noaa.gov/enso/mei/data/meiv2.data", "meiv2.data")
    mei = {}
    for ln in txt.splitlines():
        p = ln.split()
        if p and p[0].isdigit() and len(p[0]) == 4 and len(p) >= 13:
            for m in range(12):
                try:
                    v = float(p[m + 1])
                    if v > -900:
                        mei[pd.Timestamp(int(p[0]), m + 1, 1)] = v
                except ValueError:
                    pass
    ind["mei"] = pd.Series(mei).sort_index()
except Exception as e:                                     # no bloquea
    print(f"  [aviso] MEI no disponible ({e})")
    ind["mei"] = np.nan

ind["tni"] = ind["nino12"] - ind["nino4"]                  # Trans-Nino Index
ind["ep_cp"] = ind["nino3"] - ind["nino4"]                 # sabor oriental vs central
ind = ind.sort_index()
ind.to_parquet(DIDX / "indices_mensual.parquet")
print(f"  indices ahora: {[c for c in ind.columns]}")

# ══════════════════════════ 3. SERIE LARGA DEL SITIO (ERA5 1940-2025)
SIT = DIDX / "sitio_pasto_1940_2025.parquet"
if SIT.exists():
    sit = pd.read_parquet(SIT)
    sit.index = pd.to_datetime(sit.index)
    print(f"  [sitio] cache: {len(sit)} dias ({sit.index.min():%Y}->{sit.index.max():%Y})")
else:
    print("Bajando serie larga del sitio (ERA5, por decadas)...")
    trozos = []
    for y0 in range(1940, 2026, 10):
        y1 = min(y0 + 9, 2025)
        q = urllib.parse.urlencode({
            "latitude": LAT, "longitude": LON,
            "start_date": f"{y0}-01-01", "end_date": f"{y1}-12-31",
            "daily": "cloud_cover_mean,shortwave_radiation_sum",
            "timezone": "America/Bogota"})
        url = f"https://archive-api.open-meteo.com/v1/archive?{q}"
        try:
            r = urllib.request.Request(url, headers={"User-Agent": "tesis-microrred/1.0"})
            with urllib.request.urlopen(r, timeout=180) as h:
                d = json.load(h)["daily"]
            t = pd.DataFrame({"nubes": d["cloud_cover_mean"],
                              "ghi_mj": d["shortwave_radiation_sum"]},
                             index=pd.to_datetime(d["time"]))
            trozos.append(t)
            print(f"    {y0}-{y1}: {len(t)} dias")
        except Exception as e:
            print(f"    {y0}-{y1}: FALLO ({e})")
        time.sleep(1.0)
    sit = pd.concat(trozos).sort_index()
    sit["ghi"] = sit["ghi_mj"] / 3.6                        # MJ/m2/dia -> kWh/m2/dia
    sit = sit[["nubes", "ghi"]].dropna()
    sit.to_parquet(SIT)

mes = sit.resample("MS").agg({"nubes": "mean", "ghi": "mean"})
mes.index = pd.to_datetime(mes.index)
print(f"  serie del sitio: {len(mes)} meses ({mes.index.min():%Y-%m}->{mes.index.max():%Y-%m})"
      f" | nubes {mes['nubes'].mean():.1f} % | GHI {mes['ghi'].mean():.2f} kWh/m2/dia")

# ══════════════════════════ 4. CORRELACIONES CON DESFASE
INDICES = ["oni", "roni", "soi", "nino12", "nino3", "nino34", "nino4",
           "tni", "pdo", "mei", "ep_cp"]
com = mes.join(ind, how="inner")
com = com[com.index >= "1950-01-01"]
print(f"\n  periodo comun: {len(com)} meses ({com.index.min():%Y-%m}->{com.index.max():%Y-%m})")

print("\nCorrelacion indice -> clima del sitio (|r| de Spearman, mejor desfase 0-3 meses)")
print(f"  {'indice':<8}{'vs nubosidad':>26}{'vs GHI':>26}")
print(f"  {'':<8}{'r':>9}{'lag':>5}{'p':>11}{'r':>10}{'lag':>5}{'p':>11}")
res = {}
for i in INDICES:
    fila = {}
    for var in ("nubes", "ghi"):
        mejor = None
        for lag in range(4):
            a = com[i].shift(lag)                     # el indice lidera al sitio
            b = com[var]
            m = ~(a.isna() | b.isna())
            if m.sum() < 60:
                continue
            r, p = stats.spearmanr(a[m], b[m])
            if mejor is None or abs(r) > abs(mejor[0]):
                mejor = (r, p, lag, int(m.sum()))
        fila[var] = mejor
    res[i] = fila
    r1, p1, l1, n1 = fila["nubes"]
    r2, p2, l2, n2 = fila["ghi"]
    print(f"  {i:<8}{r1:>+9.3f}{l1:>5}{p1:>11.1e}{r2:>+10.3f}{l2:>5}{p2:>11.1e}")

orden = sorted(INDICES, key=lambda i: -abs(res[i]["nubes"][0]))
print(f"\n  ranking por poder explicativo sobre la NUBOSIDAD de Pasto:")
for i in orden[:5]:
    r, p, l, n = res[i]["nubes"]
    print(f"    {i:<8} r={r:+.3f} (lag {l} m, p={p:.1e}, n={n})"
          f" -> {100*r*r:4.1f} % de varianza")

# ══════════════════════════ 5. ONI vs RONI: clasificacion
def modo(v):
    return np.where(pd.isna(v), "?", np.where(v >= 0.5, "Nino",
                  np.where(v <= -0.5, "Nina", "neutral")))


sub = ind[(ind.index >= "1950-01-01") & ind["roni"].notna()]
mo, mr = modo(sub["oni"].values), modo(sub["roni"].values)
dif = int((mo != mr).sum())
print(f"\nONI vs RONI (1950->hoy, {len(sub)} meses):")
print(f"  meses clasificados DISTINTO: {dif} ({100*dif/len(sub):.1f} %)")
for a in ("Nino", "neutral", "Nina"):
    for b in ("Nino", "neutral", "Nina"):
        if a != b:
            nn = int(((mo == a) & (mr == b)).sum())
            if nn:
                print(f"    ONI dice {a:<8} / RONI dice {b:<8}: {nn:4d} meses")

# ══════════════════════════ 6. COMPUESTOS POR MODO (con la mejor dupla)
print("\nCompuestos por modo (ONI, sobre el periodo comun):")
mm = modo(com["oni"].values)
for var, u in (("nubes", "%"), ("ghi", "kWh/m2/dia")):
    print(f"  {var} ({u}):")
    for a in ("Nino", "neutral", "Nina"):
        v = com[var].values[mm == a]
        v = v[~np.isnan(v)]
        if len(v) > 5:
            print(f"    {a:<8} {v.mean():8.2f}  ±{v.std(ddof=1):5.2f}"
                  f"  (n={len(v):3d})")
    a = com[var].values[mm == "Nino"]
    b = com[var].values[mm == "Nina"]
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    if len(a) > 5 and len(b) > 5:
        t, p = stats.ttest_ind(a, b, equal_var=False)
        d = (a.mean() - b.mean()) / np.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2)
        print(f"    Nino - Nina = {a.mean()-b.mean():+.2f} {u}  "
              f"(t={t:+.2f}, p={p:.3f}, d de Cohen={d:+.2f})")

json.dump({"periodo_comun": [str(com.index.min().date()), str(com.index.max().date())],
           "n_meses": int(len(com)),
           "correlaciones": {i: {v: (None if res[i][v] is None else
                                    {"r": float(res[i][v][0]), "p": float(res[i][v][1]),
                                     "lag_meses": int(res[i][v][2]), "n": int(res[i][v][3])})
                                for v in ("nubes", "ghi")} for i in INDICES},
           "oni_vs_roni": {"meses_distintos": dif, "n": int(len(sub)),
                           "pct": float(100 * dif / len(sub))},
           "sitio": {"nubes_media_pct": float(mes["nubes"].mean()),
                     "ghi_media_kwh_m2_dia": float(mes["ghi"].mean())}},
          open(OUT / "exploracion_indices.json", "w"), indent=2)
print(f"\n  -> {OUT / 'exploracion_indices.json'}")

# ══════════════════════════ figura
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

fig, axes = plt.subplots(1, 2, figsize=(14.5, 5.4))
from matplotlib.patches import Patch

# --- panel 1: ranking de correlaciones
ax = axes[0]
etiq = orden[::-1]
rs = [res[i]["nubes"][0] for i in etiq]
ps = [res[i]["nubes"][1] for i in etiq]
cols = ["#0D47A1" if p < 0.01 else ("#64B5F6" if p < 0.05 else "#BDBDBD") for p in ps]
ax.barh(etiq, rs, color=cols, height=0.72)
ax.axvline(0, color="#212121", lw=1)
lim = max(abs(min(rs)), abs(max(rs))) * 1.45          # margen para las etiquetas
ax.set_xlim(-lim, lim)
ax.set_xlabel("Spearman r con la nubosidad de Pasto")
ax.set_title("Qué índice explica la nubosidad local", fontsize=11.5)
off = 0.022 * lim
for k, (r, p) in enumerate(zip(rs, ps)):
    ax.text(r + (off if r >= 0 else -off), k, f"{r:+.2f}", va="center",
            ha="left" if r >= 0 else "right", fontsize=8.5)
ax.legend(handles=[Patch(color="#0D47A1", label="p < 0.01"),
                   Patch(color="#64B5F6", label="p < 0.05"),
                   Patch(color="#BDBDBD", label="no significativo")],
          fontsize=8, loc="lower right", frameon=False)
ax.grid(alpha=0.25, axis="x")

# --- panel 2: compuestos por modo (eje truncado, declarado)
ax = axes[1]
mm = modo(com["oni"].values)
NOM = {"Nina": "Niña", "neutral": "neutral", "Nino": "Niño"}
etq, yy, ee, nn = [], [], [], []
for a in ("Nina", "neutral", "Nino"):
    v = com["nubes"].values[mm == a]
    v = v[~np.isnan(v)]
    etq.append(NOM[a])
    yy.append(v.mean())
    ee.append(v.std(ddof=1) / np.sqrt(len(v)))
    nn.append(len(v))
bar = ax.bar(etq, yy, yerr=ee, capsize=6, width=0.6,
             color=["#1565C0", "#9E9E9E", "#D32F2F"])
for b_, y_, e_, n_ in zip(bar, yy, ee, nn):
    ax.text(b_.get_x() + b_.get_width() / 2, y_ + e_ + 0.10, f"{y_:.2f} %\nn={n_}",
            ha="center", fontsize=9, fontweight="bold")
ax.set_ylim(84, 91.5)                                  # truncado: se declara abajo
ax.set_ylabel("nubosidad media (%)")
ax.set_title("Nubosidad de Pasto por modo (ONI, 1950-2025)", fontsize=11.5)
ax.text(0.5, 0.02, "eje truncado (84–91 %)\nNiño − Niña = −1.96 pts · p = 0.002 · d = −0.29",
        transform=ax.transAxes, fontsize=8.2, color="#424242", ha="center", va="bottom")
ax.grid(alpha=0.25, axis="y")
fig.text(0.99, 0.01, "ERA5 (Open-Meteo) · ONI/índices: CPC · NCEI · PSL",
         ha="right", fontsize=7.5, color="#757575")
fig.tight_layout()
fig.savefig(OUT / "fig_A4_puente.png", dpi=150)
fig.savefig(OUT / "fig_A4_puente.svg")
plt.close(fig)
print(f"  -> {OUT / 'fig_A4_puente.png'}")
