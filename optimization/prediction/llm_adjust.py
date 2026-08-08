# -*- coding: utf-8 -*-
"""Capa LLM de ajuste del forecast (Fase 7) — HO#3 / HANDOFF sec 9.7.

Idea del autor: un LLM ajusta el forecast de potencia con ALERTAS oficiales
(IDEAM, SINAC...) produciendo un JSON VALIDADO. Requisitos de diseno:
  - whitelist de fuentes (no se confia en alertas de origen desconocido)
  - esquema JSON estricto (pydantic): multiplicadores por hora [0.5, 2.0]
  - fallback RULE-BASED si el LLM no esta disponible (produccion sin LLM)

La funcion llm_fn es inyectable: en produccion se usa Groq/OpenAI (Backend
llmFactory), en tests un fake, y la CLI usa requests si GROQ_API_KEY existe.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Callable, List, Optional

import pandas as pd
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("optimization.prediction.llm_adjust")

# Fuentes de alertas confiables (whitelist).
ALERT_WHITELIST = {"IDEAM", "SINAC", "OFICIAL", "INVEMAR"}


class ForecastAdjustment(BaseModel):
    """Esquema estricto que el LLM debe respetar (JSON validado)."""
    source: str = Field(description="Fuente de la alerta (whitelist)")
    severity: str = Field(pattern="^(info|moderada|fuerte|extrema)$")
    reason: str = Field(min_length=5)
    multipliers: List[float] = Field(
        min_length=1, max_length=168,
        description="Factor multiplicador [0.5, 2.0] por hora del horizonte")

    @field_validator("multipliers")
    @classmethod
    def _validate_mult(cls, v):
        if any(not (0.5 <= m <= 2.0) for m in v):
            raise ValueError("multiplicadores fuera de [0.5, 2.0]")
        return v


# --------------------------------------------------------------------------- #
def check_alert_source(source: str) -> bool:
    return source.upper() in ALERT_WHITELIST


def _build_prompt(source: str, severity: str, reason: str, horizon_h: int) -> str:
    return (
        "Eres el modulo de ajuste de pronostico de una microrred solar (Pasto). "
        f"Alerta OFICIAL de {source} (severidad {severity}): {reason}. "
        f"El pronostico de potencia solar tiene {horizon_h} horas. "
        "Devuelve SOLO JSON: "
        '{"source": "<fuente>", "severity": "info|moderada|fuerte|extrema", '
        '"reason": "<explicacion breve>", '
        f'"multipliers": [<{horizon_h} numeros entre 0.5 y 2.0>]}}. '
        "Una alerta de lluvia fuerte reduce la generacion; soleado la mantiene."
    )


def rule_based_multipliers(severity: str, horizon_h: int) -> List[float]:
    """Fallback deterministico (sin LLM): derating conservador por severidad."""
    factors = {"info": 0.95, "moderada": 0.85, "fuerte": 0.70, "extrema": 0.55}
    f = factors.get(severity, 0.9)
    return [f] * horizon_h


def adjust_forecast_with_alert(band: pd.DataFrame, source: str, severity: str,
                               reason: str,
                               llm_fn: Optional[Callable[[str], str]] = None) -> pd.DataFrame:
    """Aplica la alerta al forecast de potencia (banda P10/P50/P90).

    Args:
        band: DataFrame P10/P50/P90 [kW] (horas x 3 cols).
        source/severity/reason: datos de la alerta oficial.
        llm_fn: fn(prompt:str) -> texto JSON; si None -> fallback rule-based.

    Returns: banda ajustada (mismo index/cols), clip >= 0.
    """
    if not check_alert_source(source):
        raise ValueError(
            f"Fuente de alerta no confiable: {source}. Whitelist: {ALERT_WHITELIST}")

    n = len(band)
    if llm_fn is not None:
        try:
            prompt = _build_prompt(source, severity, reason, n)
            raw = llm_fn(prompt)
            parsed = ForecastAdjustment(**json.loads(raw))
            if parsed.multipliers and len(parsed.multipliers) != n:
                raise ValueError("multipliers no coinciden con el horizonte")
            mult = parsed.multipliers
            logger.info("Ajuste LLM %s/%s aplicado (%s)", source, severity,
                        parsed.reason)
        except Exception as exc:
            logger.warning("LLM fallo (%s); fallback rule-based", exc)
            mult = rule_based_multipliers(severity, n)
    else:
        mult = rule_based_multipliers(severity, n)

    factors = pd.Series(mult, index=band.index, dtype=float)
    return band.mul(factors, axis=0).clip(lower=0.0)


# --------------------------------------------------------------------------- #
def groq_llm_fn() -> Optional[Callable[[str], str]]:
    """Llama a Groq vía HTTP si GROQ_API_KEY existe (sin dep langchain)."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    import requests

    def _call(prompt: str) -> str:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": "llama-3.3-70b-versatile",
                  "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0.0},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    return _call
