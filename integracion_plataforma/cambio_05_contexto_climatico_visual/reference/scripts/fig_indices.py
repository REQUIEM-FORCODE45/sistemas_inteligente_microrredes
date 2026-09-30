"""Figuras A1 y A3 del PLAN_GRAFICAS_EVOLUTIVO — contexto climatico.

  A1: serie del ONI 1950->hoy, con las bandas +-0.5 y el modo vigente marcado.
  A3: panel de indices (ONI, SOI, Nino3.4, PDO) de los ultimos 36 meses.

Salida: reports/evolutivo/indices/fig_A1_oni.png (+ .svg)
        reports/evolutivo/indices/fig_A3_indices.png (+ .svg)
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
IND = ROOT / "data" / "indices" / "indices_mensual.parquet"
OUT = ROOT / "reports" / "evolutivo" / "indices"
OUT.mkdir(parents=True, exist_ok=True)

C_NINO, C_NINA, C_NEU = "#D32F2F", "#1565C0", "#616161"
df = pd.read_parquet(IND)
df.index = pd.to_datetime(df.index)


def modo(v):
    if pd.isna(v):
        return "neutral"
    return "Nino" if v >= 0.5 else ("Nina" if v <= -0.5 else "neutral")


# ═══════════════════════════════════════════════ A1: SERIE DEL ONI
s = df["oni"].dropna()
s = s[s.index >= "1950-01-01"]
fig, ax = plt.subplots(figsize=(12.5, 4.6))
ax.axhline(0, color="#424242", lw=1.0)
for y in (0.5, -0.5):
    ax.axhline(y, color="#9E9E9E", lw=0.9, ls="--")
ax.fill_between(s.index, 0.5, s, where=(s >= 0.5), color=C_NINO, alpha=0.55, lw=0)
ax.fill_between(s.index, -0.5, s, where=(s <= -0.5), color=C_NINA, alpha=0.55, lw=0)
ax.plot(s.index, s, color="#212121", lw=1.1)
# eventos ancla
for etq, mes in [("1997-98", "1997-12"), ("2010-11", "2010-11"),
                 ("2015-16", "2015-12"), ("2020-22", "2020-11")]:
    t = pd.Timestamp(mes)
    if t in s.index:
        ax.annotate(etq, (t, s.loc[t]), textcoords="offset points",
                    xytext=(0, 9 if s.loc[t] > 0 else -16), ha="center",
                    fontsize=8, color="#424242")
# modo vigente
ult = s.index[-1]
val = s.iloc[-1]
ax.plot([ult], [val], "o", ms=8, mfc=C_NINO if val >= 0.5 else C_NINA, mec="white", mew=1.2,
        zorder=6)
ax.annotate(f"hoy: {val:+.2f}", (ult, val), textcoords="offset points", xytext=(-6, 14),
            ha="right", fontsize=10, fontweight="bold",
            color=C_NINO if val >= 0.5 else C_NINA)
ax.set_ylabel("ONI (°C, anomalía SST Niño 3.4)")
ax.set_title("ONI — el régimen climático del sistema", fontsize=12)
ax.set_ylim(-2.9, 3.1)
ax.grid(alpha=0.25)
ax.xaxis.set_major_locator(mdates.YearLocator(5))
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
fig.text(0.99, 0.01, "Fuente: CPC/NOAA · ONI (media móvil de 3 meses)",
         ha="right", fontsize=7.5, color="#757575")
fig.tight_layout()
fig.savefig(OUT / "fig_A1_oni.png", dpi=150)
fig.savefig(OUT / "fig_A1_oni.svg")
plt.close(fig)
print(f"  A1 -> {OUT / 'fig_A1_oni.png'}")

# ═══════════════════════════════════════════════ A3: PANEL DE INDICES (36 meses)
d3 = df[(df.index >= df.index.max() - pd.DateOffset(months=35))]
paneles = [("oni", "ONI", "°C"), ("soi", "SOI", "índice"),
           ("nino34", "Niño 3.4", "°C"), ("pdo", "PDO", "índice")]
fig, axes = plt.subplots(4, 1, figsize=(11.5, 8.2), sharex=True)
for ax, (col, nombre, unidad) in zip(axes, paneles):
    v = d3[col]
    ax.axhline(0, color="#424242", lw=0.9)
    if col in ("oni", "nino34"):
        for y in (0.5, -0.5):
            ax.axhline(y, color="#BDBDBD", lw=0.8, ls="--")
        ax.fill_between(v.index, 0.5, v, where=(v >= 0.5), color=C_NINO, alpha=0.50, lw=0)
        ax.fill_between(v.index, -0.5, v, where=(v <= -0.5), color=C_NINA, alpha=0.50, lw=0)
    ax.plot(v.index, v, color="#212121", lw=1.5, marker="o", ms=3.4)
    u = v.dropna()
    if len(u):
        ax.plot([u.index[-1]], [u.iloc[-1]], "o", ms=7,
                color=C_NINO if u.iloc[-1] >= 0.5 else (C_NINA if u.iloc[-1] <= -0.5 else C_NEU),
                mec="white", mew=1.0, zorder=5)
        ax.annotate(f"{u.iloc[-1]:+.2f}", (u.index[-1], u.iloc[-1]),
                    textcoords="offset points", xytext=(5, 2), fontsize=9,
                    fontweight="bold", color="#212121")
    ax.set_ylabel(f"{nombre}\n({unidad})", fontsize=9)
    ax.grid(alpha=0.25)
axes[0].set_title("Índices climáticos — últimos 36 meses", fontsize=12)
axes[-1].xaxis.set_major_locator(mdates.MonthLocator(interval=3))
axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%b\n%Y"))
fig.text(0.99, 0.005, "Fuente: CPC/NOAA (ONI, SOI, Niño 3.4) · NCEI (PDO)",
         ha="right", fontsize=7.5, color="#757575")
fig.tight_layout()
fig.savefig(OUT / "fig_A3_indices.png", dpi=150)
fig.savefig(OUT / "fig_A3_indices.svg")
plt.close(fig)
print(f"  A3 -> {OUT / 'fig_A3_indices.png'}")

# resumen en consola (cifras de la figura)
print(f"\n  Modo vigente: {df['oni'].dropna().iloc[-1]:+.2f} "
      f"-> {modo(df['oni'].dropna().iloc[-1])}")
r = df.iloc[-4]
print(f"  Detalle 2026-05: ONI {r['oni']:+.2f} · SOI {r['soi']:+.2f} · "
      f"N3.4 {r['nino34']:+.2f} · N1+2 {r['nino12']:+.2f} · PDO {r['pdo']:+.2f}")
