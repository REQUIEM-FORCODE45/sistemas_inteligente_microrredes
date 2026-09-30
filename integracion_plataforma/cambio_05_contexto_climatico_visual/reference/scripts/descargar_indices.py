"""Descarga y normaliza los INDICES CLIMATICOS que gobiernan el modo del sistema.

Fuentes (todas publicas, sin API key, verificadas):
  - ONI           : CPC/NOAA  oni.ascii.txt                (estacional, 1950->hoy)
  - SOI           : CPC/NOAA  soi                          (mensual)
  - Nino 1+2/3/4/3.4 : CPC/NOAA  ersst5.nino.mth.91-20.ascii (mensual)
  - PDO           : NCEI      ersst.v5.pdo.dat             (mensual)

Salida:
  data/indices/raw/*            (crudo tal cual, para auditoria)
  data/indices/indices_mensual.parquet   (una fila por mes, columnas por indice)

Uso:  python scripts/descargar_indices.py
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "indices"
RAW = OUT / "raw"
RAW.mkdir(parents=True, exist_ok=True)

FUENTES = {
    "oni":   "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
    "soi":   "https://www.cpc.ncep.noaa.gov/data/indices/soi",
    "nino":  "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii",
    "pdo":   "https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/index/ersst.v5.pdo.dat",
}

# la estacion ONI se etiqueta por el trimestre: DJF->ene ... NDJ->dic
EST_A_MES = {"DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4, "AMJ": 5, "MJJ": 6,
             "JJA": 7, "JAS": 8, "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12}


def bajar(nombre, url):
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    (RAW / f"{nombre}.txt").write_text(r.text, encoding="utf-8", errors="replace")
    print(f"  [{nombre:5}] HTTP {r.status_code} · {len(r.text):>7} chars -> raw/{nombre}.txt")
    return r.text


def parse_oni(txt):
    filas = {}
    for ln in txt.splitlines():
        p = ln.split()
        if len(p) >= 4 and p[0] in EST_A_MES:
            try:
                filas[pd.Timestamp(int(p[1]), EST_A_MES[p[0]], 1)] = float(p[3])
            except ValueError:
                pass
    return pd.Series(filas, name="oni").sort_index()


def parse_nino(txt):
    """El archivo trae pares (temperatura, anomalia): YR MON N1+2 ANOM N3 ANOM...
    nos quedamos con las ANOMALIAS (posiciones 3, 5, 7, 9)."""
    filas = {}
    for ln in txt.splitlines():
        p = ln.split()
        if len(p) == 10 and p[0].isdigit():
            try:
                filas[pd.Timestamp(int(p[0]), int(p[1]), 1)] = {
                    "nino12": float(p[3]), "nino3": float(p[5]),
                    "nino4": float(p[7]), "nino34": float(p[9])}
            except ValueError:
                pass
    df = pd.DataFrame.from_dict(filas, orient="index").sort_index()
    return df


def parse_soi(txt):
    filas = {}
    for ln in txt.splitlines():
        p = ln.split()
        if p and p[0].isdigit() and len(p[0]) == 4:
            try:
                for m in range(12):
                    filas[pd.Timestamp(int(p[0]), m + 1, 1)] = float(p[m + 1])
            except (ValueError, IndexError):
                pass
    return pd.Series(filas, name="soi").sort_index()


def parse_pdo(txt):
    filas = {}
    for ln in txt.splitlines():
        p = ln.split()
        if p and p[0].isdigit() and len(p[0]) == 4 and len(p) >= 13:
            try:
                for m in range(12):
                    v = float(p[m + 1])
                    if v < 90:                      # 99.99 = faltante
                        filas[pd.Timestamp(int(p[0]), m + 1, 1)] = v
            except ValueError:
                pass
    return pd.Series(filas, name="pdo").sort_index()


print("Descargando indices climaticos...")
txt = {k: bajar(k, u) for k, u in FUENTES.items()}

print("\nParseando...")
serie_oni = parse_oni(txt["oni"])
df = parse_nino(txt["nino"]).join(parse_pdo(txt["pdo"]), how="outer")
df = df.join(parse_soi(txt["soi"]), how="outer")
df = df.join(serie_oni, how="outer").sort_index()
df.index.name = "mes"
df = df[~df.index.duplicated()]
df.to_parquet(OUT / "indices_mensual.parquet")
print(f"  -> {OUT / 'indices_mensual.parquet'}  ({len(df)} meses, "
      f"{df.index.min():%Y-%m} -> {df.index.max():%Y-%m})")
print(f"  cobertura: " + " · ".join(f"{c}={df[c].notna().sum()}" for c in df.columns))


def clasificar(v):
    if pd.isna(v):
        return "?"
    return "Nino" if v >= 0.5 else ("Nina" if v <= -0.5 else "neutral")


# --- VERIFICACION contra eventos conocidos (ancla de credibilidad)
print("\nVerificacion contra eventos historicos conocidos:")
for etiqueta, mes, esperado in [("El Nino 1997-98 (fuerte)", "1997-12", "ONI >= +2"),
                                ("La Nina 2010-11 (fuerte)", "2010-11", "ONI <= -1"),
                                ("El Nino 2015-16 (fuerte)", "2015-12", "ONI >= +2"),
                                ("La Nina 2020-22 (doble dip)", "2020-11", "ONI <= -1")]:
    t = pd.Timestamp(mes)
    if t in df.index:
        r = df.loc[t]
        print(f"  {etiqueta:28} {mes}: ONI {r['oni']:+.2f}  N3.4 {r['nino34']:+.2f}  "
              f"SOI {r['soi']:+.2f}  [{esperado}]")

print("\nUltimos 8 meses:")
print("  mes       ONI    mod      SOI   N1+2   N3      N3.4   N4     PDO")
for t, r in df.tail(8).iterrows():
    print(f"  {t:%Y-%m}  {r['oni']:+5.2f}  {clasificar(r['oni']):<8} "
          f"{r['soi']:+5.2f}  {r['nino12']:+5.2f}  {r['nino3']:+5.2f}  "
          f"{r['nino34']:+5.2f}  {r['nino4']:+5.2f} {r['pdo']:+6.2f}")

# --- span de los datos del motor (para elegir ventanas REALES por modo)
print("\nSpan de los datos del motor de escenarios (para elegir ventanas):")
for f, col in [("datos_sinteticos_fase1.parquet", None),
               ("experimentos_kaggle/04_itransformer/resultados_v3/era5_v3.parquet", None)]:
    p = ROOT / f
    if p.exists():
        d = pd.read_parquet(p)
        ix = pd.to_datetime(d.index)
        print(f"  {f.split('/')[-1]:34} {ix.min():%Y-%m-%d} -> {ix.max():%Y-%m-%d} "
              f"({len(d)} filas)")
    else:
        print(f"  {f.split('/')[-1]:34} NO EXISTE en esta ruta")

# --- candidatos de ventana por modo (decision del autor: una ventana por modo)
print("\nCandidatos de ventana por modo (ONI, ultimos 8 anos):")
reciente = df[df.index >= "2018-01-01"]
for modo, cond in [("Nina", reciente["oni"] <= -0.7), ("neutral", reciente["oni"].abs() < 0.2),
                   ("Nino", reciente["oni"] >= 0.7)]:
    sub = reciente[cond]
    if len(sub):
        # mes con el ONI mas extremo de cada modo + su vecindario
        idx = sub["oni"].idxmin() if modo == "Nina" else sub["oni"].idxmax()
        print(f"  {modo:<8} ONI {sub.loc[idx,'oni']:+.2f} en {idx:%Y-%m}  "
              f"({len(sub)} meses en ese modo desde 2018)")
