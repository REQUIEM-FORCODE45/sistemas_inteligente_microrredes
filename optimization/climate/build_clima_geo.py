"""A5 — Mapa de calor de Narino (precómputo OFFLINE, una sola vez).

Baja el poligono de Narino (GADM 4.1), arma una rejilla ERA5 28 km (0.25°)
sobre su bbox y por celda consulta la nubosidad diaria (Open-Meteo archive,
ERA5) con peticiones multi-coordenada. NO hay periodo fijo: se usa todo el
historico disponible y se anota el periodo efectivo por celda.

Dos capas conmutables:
  1. superficie   = nubosidad media por celda (%).
  2. teleconexion = Spearman r(Nino 4 <-> nubosidad local) por celda.

Salida: data/clima/clima_geo/<AAAA-MM>_<sha16>.json + manifest.json con el
MISMO esquema de Backend/services/climateStoreService.js (append-only: nunca
sobrescribe; cada corrida crea version nueva). El endpoint /front/climate/geo
lee ese manifest.

Solo stdlib + numpy/pandas/scipy/matplotlib/requests (sin geopandas/shapely).

Uso:  python3 -m climate.build_clima_geo   (desde optimization/)
       CLIMA_GEO_STEP=0.25 CLIMA_GEO_BATCH=20 python3 -m climate.build_clima_geo
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import time
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from matplotlib.path import Path as MplPath
from scipy import stats

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "clima" / "clima_geo"
MANIFEST = ROOT / "data" / "clima" / "manifest.json"
CACHE = Path(__file__).resolve().parent / ".cache_clima_geo"

GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_COL_1.json.zip"
NINO_URL = "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

STEP = float(os.environ.get("CLIMA_GEO_STEP", "0.25"))
BATCH = int(os.environ.get("CLIMA_GEO_BATCH", "8"))
UA = {"User-Agent": "microrred/1.0"}


def bajar(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as h:
        return h.read()


def poligono_narino() -> list:
    print("  GADM COL nivel-1 ...", flush=True)
    raw = bajar(GADM_URL)
    fc = json.loads(zipfile.ZipFile(io.BytesIO(raw)).read("gadm41_COL_1.json"))
    feat = [f for f in fc["features"] if f["properties"].get("NAME_1") == "Nariño"][0]
    g = feat["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    print(f"  Narino: {len(polys)} poligonos", flush=True)
    return polys  # lista de poligonos; cada uno = lista de anillos [[lon,lat],...]


def dentro(polys: list, lon: float, lat: float) -> bool:
    for poly in polys:
        if MplPath(np.asarray(poly[0])).contains_point((lon, lat)):
            return True
    return False


def nino4_mensual() -> pd.Series:
    txt = bajar(NINO_URL).decode("utf-8", errors="replace")
    filas = {}
    for ln in txt.splitlines():
        p = ln.split()
        if len(p) == 10 and p[0].isdigit():
            try:
                filas[pd.Timestamp(int(p[0]), int(p[1]), 1)] = float(p[7])
            except ValueError:
                pass
    return pd.Series(filas, name="nino4").sort_index()


def nube_rejilla(celdas: list) -> dict:
    # Llamadas multi-coordenada por decada, en LOTES chicos: 40 ubicaciones
    # en una sola llamada dispara 429. Lote por defecto 8 + espera larga.
    hoy = date.today()
    s = requests.Session()
    series = {c: [] for c in celdas}
    lotes = [celdas[i:i + BATCH] for i in range(0, len(celdas), BATCH)]
    CACHE.mkdir(exist_ok=True)
    for y0 in range(1950, hoy.year + 1, 10):
        y1 = min(y0 + 9, hoy.year)
        for li, lote in enumerate(lotes):
            tag = f"{y0}-{y1}_l{li}.json"
            if not all(len(series[c]) for c in lote) and (CACHE / tag).exists():
                try:
                    cached = json.loads((CACHE / tag).read_text())
                    for c, loc in zip(lote, cached):
                        d = loc["daily"]
                        t = pd.Series(d["cloud_cover_mean"],
                                      index=pd.to_datetime(d["time"]), name="nubes")
                        series[c].append(t)
                    print(f"  decada {y0}-{y1} lote {li + 1}/{len(lotes)}: CACHE",
                          flush=True)
                    continue
                except (json.JSONDecodeError, KeyError, ValueError):
                    pass
            lats = ",".join(f"{la:.4f}" for la, _ in lote)
            lons = ",".join(f"{lo:.4f}" for _, lo in lote)
            q = {"latitude": lats, "longitude": lons,
                 "start_date": f"{y0}-01-01", "end_date": f"{y1}-12-31",
                 "daily": "cloud_cover_mean", "timezone": "America/Bogota"}
            for intento in range(6):
                try:
                    r = s.get(ARCHIVE, params=q, headers=UA, timeout=300)
                    r.raise_for_status()
                    payload = r.json()
                    (CACHE / tag).write_text(json.dumps(payload))
                    for c, loc in zip(lote, payload):
                        d = loc["daily"]
                        t = pd.Series(d["cloud_cover_mean"],
                                      index=pd.to_datetime(d["time"]), name="nubes")
                        series[c].append(t)
                    print(f"  decada {y0}-{y1} lote {li + 1}/{len(lotes)}: OK",
                          flush=True)
                    break
                except Exception as e:
                    espera = 15.0 * (intento + 1)
                    print(f"  decada {y0}-{y1} lote {li + 1} reintento {intento + 1} "
                          f"(espera {espera:.0f}s): {str(e)[:100]}", flush=True)
                    time.sleep(espera)
            time.sleep(6.0)
    out = {}
    for c, trozos in series.items():
        out[c] = (pd.concat(trozos).sort_index().dropna() if trozos
                  else pd.Series(dtype=float))
    return out


def main() -> None:
    polys = poligono_narino()
    xs = [c[0] for poly in polys for ring in poly for c in ring]
    ys = [c[1] for poly in polys for ring in poly for c in ring]
    lon0, lon1, lat0, lat1 = min(xs), max(xs), min(ys), max(ys)
    lons = np.arange(np.floor(lon0 / STEP) * STEP, lon1 + STEP / 2, STEP).round(4)
    lats = np.arange(np.floor(lat0 / STEP) * STEP, lat1 + STEP / 2, STEP).round(4)
    celdas = [(float(la), float(lo)) for la in lats for lo in lons
              if dentro(polys, float(lo), float(la))]
    print(f"  rejilla {STEP}°: {len(lons)}x{len(lats)}, {len(celdas)} celdas en Narino",
          flush=True)

    nino4 = nino4_mensual()
    print(f"  Nino4: {len(nino4)} meses ({nino4.index.min():%Y-%m}->{nino4.index.max():%Y-%m})",
          flush=True)

    rejilla = nube_rejilla(celdas)
    sup, tel, per = [], [], []
    for (la, lo) in celdas:
        d = rejilla[(la, lo)]
        if len(d) < 120:
            sup.append(None); tel.append(None); per.append(None)
            continue
        m = d.resample("MS").mean()
        m.index = pd.to_datetime(m.index)
        sup.append(round(float(m.mean()), 2))
        com = pd.DataFrame({"nubes": m}).join(nino4, how="inner").dropna()
        per.append(f"{com.index.min():%Y-%m}..{com.index.max():%Y-%m}" if len(com) >= 60 else None)
        if len(com) < 60:
            tel.append(None)
        else:
            r, _ = stats.spearmanr(com["nino4"], com["nubes"])
            tel.append(round(float(r), 3))

    nlat, nlon = len(lats), len(lons)
    idx = {(la, lo): k for k, (la, lo) in enumerate(celdas)}
    grid_sup = [[sup[idx[(float(la), float(lo))]]
                 if (float(la), float(lo)) in idx else None
                 for lo in lons] for la in lats]
    grid_tel = [[tel[idx[(float(la), float(lo))]]
                 if (float(la), float(lo)) in idx else None
                 for lo in lons] for la in lats]
    per_ok = [p for p in per if p]
    periodo = (f"{min(p[:7] for p in per_ok)}..{max(p[-7:] for p in per_ok)}"
               if per_ok else None)

    datos = {
        "poligono": [[[round(float(c[0]), 4), round(float(c[1]), 4)]
                       for c in ring] for poly in polys for ring in [poly[0]]],
        "lat": [float(v) for v in lats],
        "lon": [float(v) for v in lons],
        "capas": {
            "nubosidad": {"valor": grid_sup, "unidad": "%",
                          "rango": [round(float(np.nanmin(np.array(grid_sup, dtype=float))), 1),
                                    round(float(np.nanmax(np.array(grid_sup, dtype=float))), 1)]},
            "teleconexion_nino4": {"valor": grid_tel, "unidad": "r",
                                   "rango": [round(float(np.nanmin(np.array(grid_tel, dtype=float))), 2),
                                             round(float(np.nanmax(np.array(grid_tel, dtype=float))), 2)]},
        },
        "periodo_efectivo": periodo,
        "rejilla_grados": STEP,
        "n_celdas": len(celdas),
    }
    sha = hashlib.sha256(json.dumps(datos, sort_keys=True).encode()).hexdigest()[:16]
    STORE.mkdir(parents=True, exist_ok=True)
    nombre = f"{date.today():%Y-%m}_{sha}.json"
    cuerpo = {"meta": {
        "_id": sha, "familia": "clima_geo",
        "archivo": f"clima_geo/{nombre}",
        "descargado_en": pd.Timestamp.now(tz="America/Bogota").isoformat(),
        "cobertura": f"rejilla {STEP}° Narino, {len(celdas)} celdas, {periodo}",
        "sha256": sha,
        "fuente": "GADM 4.1 (poligono) · ERA5 via Open-Meteo archive (nubosidad) · CPC/NOAA (Nino 4)",
        "licencia": "GADM uso academico con cita; Open-Meteo CC-BY 4.0; CPC dominio publico",
    }, "datos": datos}
    (STORE / nombre).write_text(json.dumps(cuerpo))
    cuerpo["meta"]["bytes"] = (STORE / nombre).stat().st_size
    (STORE / nombre).write_text(json.dumps(cuerpo))
    man = {"versiones": []}
    if MANIFEST.exists():
        try:
            man = json.loads(MANIFEST.read_text())
        except json.JSONDecodeError:
            man = {"versiones": []}
    if not any(v.get("sha256") == sha and v.get("familia") == "clima_geo"
               for v in man["versiones"]):
        man["versiones"].append({k: v for k, v in cuerpo["meta"].items()})
        MANIFEST.write_text(json.dumps(man, indent=2))
    print(f"  -> {STORE / nombre} ({cuerpo['meta']['bytes']} bytes, sha {sha})")


if __name__ == "__main__":
    main()
