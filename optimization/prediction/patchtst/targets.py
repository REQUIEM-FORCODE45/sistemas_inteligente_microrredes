"""
Transformaciones de targets: el truco 'kt' generalizado a todas las variables.

Principio: separar lo DETERMINISTA (fórmula exacta / climatología) de lo
IMPREPREDECIBLE (anomalía). El modelo predice la anomalía y la parte
determinista se re-agrega al reconstruir.

Tipos de transformación:
  - divide : y_t = y / denom            (denom = columna determinista, ej. ghi_toa)
  - anomaly: y_t = y - climatologia(hora)   (ciclo diario medio del train)
  - none   : y_t = y                    (directa)

Cadena completa por variable:
  y_original → encode (divide/anomaly) → z-score (train) → MODELO → z-score⁻¹
  → y_transformada → decode (× denom / + climatología) → y_original

El decode necesita datos del horizonte:
  - divide : denom se calcula por geometría solar (ghi_toa, sin_elev) — disponible
             incluso para el futuro (fórmula exacta)
  - anomaly: climatología horaria (24 valores) guardada del train — sin leakage
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

MIN_DENOM = {"ghi_toa": 10.0, "sin_elev": 0.1}   # umbrales para evitar división por ~0


# ---------------------------------------------------------------- encode
def encode_targets(df: pd.DataFrame, specs: dict) -> pd.DataFrame:
    """
    Añade columnas '<var>__tr' (transformadas) al DataFrame.
    specs: {var: {"type": ..., "denom": ...}}
    """
    df = df.copy()
    for var, spec in specs.items():
        t = spec["type"]
        col = f"{var}__tr"
        if t == "divide":
            denom = df[spec["denom"]].values
            min_d = MIN_DENOM.get(spec["denom"], 1.0)
            y = df[var].values
            df[col] = np.where(denom > min_d, y / np.maximum(denom, min_d), 0.0)
        elif t == "anomaly":
            # climatología horaria: la calcula build_dataset y viene en spec
            cl = np.asarray(spec["climatology"], dtype=float)   # 24 valores
            hour = pd.to_datetime(df.index).hour.values if hasattr(df.index, "hour") \
                else pd.to_datetime(df["timestamp"]).dt.hour.values
            df[col] = df[var].values - cl[hour]
        else:  # none
            df[col] = df[var].values
    return df


def decode_predictions(pred_tr: np.ndarray, var: str, spec: dict,
                       denom_vals: np.ndarray | None = None,
                       hours: np.ndarray | None = None) -> np.ndarray:
    """
    Vuelve la predicción (en unidades de la transformada) a unidades reales.
    pred_tr: (..., H, Q) o (H, Q)
    denom_vals: (H,) valores de la columna denom en el horizonte (solo divide)
    hours: (H,) hora del día en el horizonte (solo anomaly)
    """
    t = spec["type"]
    pred = np.asarray(pred_tr, dtype=float)
    if t == "divide":
        d = np.asarray(denom_vals, dtype=float)
        while d.ndim < pred.ndim:          # (H,) -> (H,1) para (H,Q); (B,H)->(B,H,1)
            d = d[..., None]
        return pred * d
    if t == "anomaly":
        cl = np.asarray(spec["climatology"], dtype=float)
        add = cl[np.asarray(hours, dtype=int)]
        while add.ndim < pred.ndim:
            add = add[..., None]
        return pred + add
    return pred


# ---------------------------------------------------------------- persistencia
def save_specs(specs: dict, site_id: str) -> None:
    out = Path("data/processed") / site_id / "target_specs.json"
    clean = {v: {k: (val.tolist() if isinstance(val, np.ndarray) else val)
                 for k, val in s.items()} for v, s in specs.items()}
    out.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    print(f"  transforms guardados: {out}")


def load_specs(site_id: str) -> dict:
    path = Path("data/processed") / site_id / "target_specs.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    specs = {}
    for var, s in raw.items():
        specs[var] = dict(s)
        if "climatology" in s:
            specs[var]["climatology"] = np.asarray(s["climatology"])
    return specs
