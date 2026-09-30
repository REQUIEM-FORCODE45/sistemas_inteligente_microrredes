"""¿Qué tan confiable es NASA POWER? Contraste empirico contra ERA5 en el sitio.

No se responde con opinion: se compara la climatologia mensual de NASA POWER
(ALLSKY_SFC_SW_DWN y CLOUD_AMT) contra la de ERA5 en el mismo punto
(era5_v3: 2020-2025), y se contrasta la diferencia entre fuentes con la
variabilidad interanual del propio ERA5 (para saber si la fuente importa mas
o menos que el ruido natural).

Salida: reports/evolutivo/indices/verificacion_power.json + tabla en consola
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "evolutivo" / "indices"
OUT.mkdir(parents=True, exist_ok=True)
LAT, LON = 1.2136, -77.2811
MESES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
         "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

# ---------------------------------------------------------- NASA POWER
url = ("https://power.larc.nasa.gov/api/temporal/climatology/point?"
       f"parameters=ALLSKY_SFC_SW_DWN,CLOUD_AMT&community=RE"
       f"&longitude={LON}&latitude={LAT}&format=JSON")
with urllib.request.urlopen(url, timeout=60) as r:
    pw = json.load(r)["properties"]["parameter"]
power_ghi = np.array([pw["ALLSKY_SFC_SW_DWN"][m] for m in MESES])      # kWh/m2/dia
power_cld = np.array([pw["CLOUD_AMT"][m] for m in MESES])              # %
power_ann = (pw["ALLSKY_SFC_SW_DWN"]["ANN"], pw["CLOUD_AMT"]["ANN"])
print(f"NASA POWER (periodo del producto: {pw['ALLSKY_SFC_SW_DWN'].get('ANN')} anual)")
print(f"  GHI anual : {power_ann[0]:.2f} kWh/m2/dia")
print(f"  nubosidad : {power_ann[1]:.1f} %")

# ---------------------------------------------------------- ERA5 (nuestro)
v3 = pd.read_parquet(
    ROOT / "experimentos_kaggle/04_itransformer/resultados_v3/era5_v3.parquet")
v3.index = pd.to_datetime(v3.index)
dia = v3[["shortwave_radiation", "cloud_cover"]].resample("D").mean()
dia["ghi"] = dia["shortwave_radiation"] * 24.0 / 1000.0                # W/m2 -> kWh/m2/dia
era_mes = dia.groupby(dia.index.month).agg(ghi=("ghi", "mean"),
                                           cld=("cloud_cover", "mean"))
era_anio = dia.groupby(dia.index.year).agg(ghi=("ghi", "mean"),
                                           cld=("cloud_cover", "mean"))
era_ghi_anual = dia["ghi"].mean()
era_cld_anual = dia["cloud_cover"].mean()

# ---------------------------------------------------------- contraste
print(f"\nERA5 en el punto (nuestro, 2020-2025, {len(dia)} dias)")
print(f"  GHI anual : {era_ghi_anual:.2f} kWh/m2/dia")
print(f"  nubosidad : {era_cld_anual:.1f} %")

dif_mes = power_ghi - era_mes["ghi"].values
print(f"\n{'mes':<5}{'POWER':>9}{'ERA5':>9}{'dif':>9}{'%':>8}   "
      f"{'POWER nub':>10}{'ERA5 nub':>10}{'dif':>7}")
for i, m in enumerate(MESES):
    print(f"{m:<5}{power_ghi[i]:9.2f}{era_mes['ghi'].values[i]:9.2f}"
          f"{dif_mes[i]:+9.2f}{100*dif_mes[i]/era_mes['ghi'].values[i]:+7.1f}%   "
          f"{power_cld[i]:10.1f}{era_mes['cld'].values[i]:10.1f}"
          f"{power_cld[i]-era_mes['cld'].values[i]:+7.1f}")

r_mes = float(np.corrcoef(power_ghi, era_mes["ghi"].values)[0, 1])
print(f"\nRESUMEN")
print(f"  GHI anual: POWER {power_ann[0]:.2f} vs ERA5 {era_ghi_anual:.2f} "
      f"-> dif {power_ann[0]-era_ghi_anual:+.2f} kWh/m2/dia "
      f"({100*(power_ann[0]-era_ghi_anual)/era_ghi_anual:+.1f} %)")
print(f"  ciclo anual: correlacion de los 12 meses r = {r_mes:.4f}")
print(f"  sesgo medio mensual: {dif_mes.mean():+.2f} kWh/m2/dia "
      f"(|sesgo| medio {np.abs(dif_mes).mean():.2f}, max {np.abs(dif_mes).max():.2f})")
print(f"  nubosidad anual: POWER {power_ann[1]:.1f} % vs ERA5 {era_cld_anual:.1f} % "
      f"-> dif {power_ann[1]-era_cld_anual:+.1f} puntos")

# variabilidad interanual del propio ERA5 (el "ruido natural" de fondo)
inter = era_anio["ghi"]
print(f"\n  variabilidad INTERANUAL de ERA5 (2020-2025): "
      f"{inter.min():.2f} a {inter.max():.2f} kWh/m2/dia "
      f"(rango {inter.max()-inter.min():.2f}, sd {inter.std():.3f})")
print(f"  => |diferencia entre fuentes| {np.abs(dif_mes).mean():.2f} vs "
      f"rango interanual {inter.max()-inter.min():.2f}")

json.dump({
    "power": {"ghi_anual_kwh_m2_dia": float(power_ann[0]),
              "nubosidad_pct": float(power_ann[1]), "ghi_mensual": power_ghi.tolist(),
              "nubes_mensual": power_cld.tolist()},
    "era5_punto": {"ghi_anual_kwh_m2_dia": float(era_ghi_anual),
                   "nubosidad_pct": float(era_cld_anual),
                   "ghi_mensual": era_mes["ghi"].tolist(),
                   "nubes_mensual": era_mes["cld"].tolist(),
                   "por_anio": inter.to_dict(), "dias": int(len(dia))},
    "contraste": {"dif_anual_kwh": float(power_ann[0] - era_ghi_anual),
                  "dif_anual_pct": float(100 * (power_ann[0] - era_ghi_anual) / era_ghi_anual),
                  "corr_ciclo_anual": r_mes,
                  "sesgo_medio_mensual": float(dif_mes.mean()),
                  "abs_medio_mensual": float(np.abs(dif_mes).mean()),
                  "abs_max_mensual": float(np.abs(dif_mes).max()),
                  "dif_nubosidad_puntos": float(power_ann[1] - era_cld_anual),
                  "interanual_min": float(inter.min()), "interanual_max": float(inter.max()),
                  "interanual_sd": float(inter.std())},
}, open(OUT / "verificacion_power.json", "w"), indent=2)
print(f"\n  -> {OUT / 'verificacion_power.json'}")
