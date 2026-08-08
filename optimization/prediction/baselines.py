# -*- coding: utf-8 -*-
"""Baselines clasicos de forecasting para la tabla de la tesis (Fase 2b).

Comparacion honesta contra el forecast operativo (Open-Meteo NWP) y los
foundation models (TimesFM 2.5 / PatchTST) — HANDOFF_TECNICO.md sec 9.2.
Referencia HO2: GHI MAE ~26-30 W/m2 (TimesFM), temp ~0.5 C.

Baselines implementados (todos sobre el CONTRATO de 10 vars):
  - persistence : el valor de hoy = valor de hace 'lag' horas (climatologico
                  diurno: mismo paso del dia anterior)
  - climatology  : media por hora-del-dia y dia-del-ano (ventana train)
  - arima        : ARIMA(p,d,q) univariante por variable (statsmodels),
                   con seleccion conservadora (p,d,q)=(2,1,2) por defecto
  - chronos      : (opcional, requiere torch) zero-shot con Chronos-Bolt
"""
from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("optimization.prediction.baselines")


# --------------------------------------------------------------------------- #
def persistence_forecast(train: pd.DataFrame, horizon_h: int,
                         lag_h: int = 24) -> pd.DataFrame:
    """Forecast por persistencia diurna: mismo paso del dia anterior.

    Para lag_h=24, la hora futura t se predice con el valor de t-24h (mismo
    paso del dia anterior). Si t-24h no existe (inicio de serie), cae a la
    persistencia de 1 paso (hora previa) y rellena con ffill.
    """
    idx = pd.date_range(train.index[-1] + pd.Timedelta(hours=1),
                        periods=horizon_h, freq="h")
    out = pd.DataFrame(index=idx, columns=train.columns, dtype=float)
    for ts in idx:
        src = ts - pd.Timedelta(hours=lag_h)
        if src in train.index:
            out.loc[ts] = train.loc[src]
        else:
            prev = ts - pd.Timedelta(hours=1)
            if prev in train.index:
                out.loc[ts] = train.loc[prev]
    return out.ffill()


# --------------------------------------------------------------------------- #
def climatology_forecast(train: pd.DataFrame, horizon_h: int) -> pd.DataFrame:
    """Climatologia: media de la variable por (hora-del-dia, dia-del-ano).

    El forecast de la hora futura t se arma reutilizando las medias
    historicas de esa misma combinacion hora+doy.
    """
    if train.empty:
        raise ValueError("train vacio para climatologia")
    hour = train.index.hour
    doy = train.index.dayofyear
    stats = train.copy()
    stats["_h"] = hour
    stats["_d"] = doy
    means = stats.groupby(["_h", "_d"]).mean(numeric_only=True)

    idx = pd.date_range(train.index[-1] + pd.Timedelta(hours=1),
                        periods=horizon_h, freq="h")
    rows = []
    for ts in idx:
        key = (ts.hour, ts.dayofyear)
        if key in means.index:
            rows.append(means.loc[key])
        else:
            # sin registro del dia: cae a la media por hora del dia
            hmean = stats[stats["_h"] == ts.hour].mean(numeric_only=True)
            rows.append(hmean)
    return pd.DataFrame(rows, index=idx)[train.columns]


# --------------------------------------------------------------------------- #
def arima_forecast(train: pd.DataFrame, horizon_h: int,
                   order=(2, 1, 2)) -> pd.DataFrame:
    """ARIMA univariante por variable (statsmodels). Lento; cache por var.

    Devuelve el pronostico puntual y propaga NaN si la estimacion falla
    (series con muchos ceros nocturnos, e.g. GHI).
    """
    from statsmodels.tsa.arima.model import ARIMA

    idx = pd.date_range(train.index[-1] + pd.Timedelta(hours=1),
                        periods=horizon_h, freq="h")
    out = pd.DataFrame(index=idx, columns=train.columns, dtype=float)
    for col in train.columns:
        y = train[col].dropna()
        if len(y) < 24:
            continue
        try:
            model = ARIMA(y, order=order).fit()
            fc = model.forecast(steps=horizon_h)
            out[col] = np.asarray(fc, dtype=float)
        except Exception as exc:  # noqa: BLE001 - estimacion inestable en ceros
            logger.debug("ARIMA %s fallo: %s", col, exc)
            out[col] = float("nan")
    return out


# --------------------------------------------------------------------------- #
def chronos_forecast(train: pd.DataFrame, horizon_h: int,
                     model_name: str = "amazon/chronos-t5-small") -> Optional[pd.DataFrame]:
    """Chronos zero-shot (transformers) — solo si torch esta disponible."""
    try:
        import torch  # noqa: F401
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError:
        logger.warning("Chronos requiere torch+transformers; se omite")
        return None

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    idx = pd.date_range(train.index[-1] + pd.Timedelta(hours=1),
                        periods=horizon_h, freq="h")
    out = pd.DataFrame(index=idx, columns=train.columns, dtype=float)
    for col in train.columns:
        y = train[col].dropna().values
        if len(y) < 16:
            continue
        try:
            tokens = tokenizer(y, return_tensors="pt")
            with torch.no_grad():
                pred = model.generate(
                    **tokens, max_new_tokens=horizon_h, num_return_sequences=1)
            fc = tokenizer.batch_decode(pred, skip_special_tokens=True)
            out[col] = [float(v) for v in fc[0]]
        except Exception as exc:  # noqa: BLE001
            logger.debug("Chronos %s fallo: %s", col, exc)
    return out


# --------------------------------------------------------------------------- #
BASELINES = {
    "persistence": persistence_forecast,
    "climatology": climatology_forecast,
    "arima": arima_forecast,
    "chronos": chronos_forecast,
}


def run_baseline(name: str, train: pd.DataFrame, horizon_h: int,
                 **kwargs) -> pd.DataFrame:
    if name not in BASELINES:
        raise KeyError(f"Baseline desconocido: {name}")
    return BASELINES[name](train, horizon_h, **kwargs)


def baseline_mae(name: str, train: pd.DataFrame, actual: pd.DataFrame,
                 horizon_h: int | None = None, **kwargs) -> pd.DataFrame:
    """MAE por variable del baseline 'name' contra el set actual."""
    horizon_h = horizon_h or len(actual)
    fc = run_baseline(name, train, horizon_h, **kwargs)
    fc = fc.reindex(actual.index)
    errors = (fc - actual).abs()
    return errors.mean(numeric_only=True).rename(name).to_frame().T