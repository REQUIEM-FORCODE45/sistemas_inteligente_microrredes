# -*- coding: utf-8 -*-
"""Modelo dinamico BESS — simulacion horaria/5min de SOC con eficiencias.

Port de HO#1 (seccion 7.3, VALIDADO):
  - simulate(power_kw): positivo = carga (consumo), negativo = descarga.
  - Eficiencias carga/descarga, limites de SOC, y reporta p_unmet (no atendido).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

logger = logging.getLogger("optimization.physics.bess")


@dataclass
class Bess:
    capacity_kwh: float = 200.0
    power_kw: float = 50.0
    soc_min: float = 0.10
    soc_max: float = 0.95
    init_soc: float = 0.30
    charge_efficiency: float = 0.95
    discharge_efficiency: float = 0.95

    def simulate(self, power_kw: pd.Series, dt_h: float = 1.0) -> pd.DataFrame:
        """Recorre la serie de potencia neta y evoluciona el SOC.

        power_kw > 0  -> carga (take de la red / generacion sobrante)
        power_kw < 0  -> descarga (entrega a la carga)
        Devuelve DataFrame con index = power_kw.index y columnas: soc_kwh,
        soc_pct, charged, discharged, p_unmet_kw (potencia que no cabe por
        limites de SoC o Pmax).
        """
        results = []
        soc = self.init_soc * self.capacity_kwh
        for t, p in enumerate(power_kw):
            p_cap = float(np.clip(p, -self.power_kw, self.power_kw))
            if p_cap >= 0:                      # cargar
                limit = (self.capacity_kwh * self.soc_max - soc) / \
                    (self.charge_efficiency * dt_h)
                p_cap = min(p_cap, max(limit, 0.0))
                soc += self.charge_efficiency * p_cap * dt_h
            else:                               # descargar
                available = (soc - self.capacity_kwh * self.soc_min) * \
                    self.discharge_efficiency / dt_h
                p_cap = max(p_cap, -available)
                soc += p_cap / self.discharge_efficiency * dt_h
            p_unmet = float(p) - p_cap          # no entregada por limites
            results.append({
                "t": t,
                "power_kw": p_cap,
                "soc_kwh": soc,
                "soc_pct": soc / self.capacity_kwh * 100.0,
                "p_unmet_kw": float(p_unmet),
            })
        return pd.DataFrame(results, index=power_kw.index)