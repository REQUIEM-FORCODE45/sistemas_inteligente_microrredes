# -*- coding: utf-8 -*-
"""Configuracion de la microred y tarifas para los experimentos de la tesis.

Tarifas de red (perfil ToU horario, documentado — reemplaza las fijas 40/60):
  - Valle  (00-05): 45  [COP/kWh]
  - Media  (06-18, 22-23): 80  [COP/kWh]
  - Pico   (19-21): 140  [COP/kWh]
  - costo fijo de conexion: 40 [COP/h] (igual que en produccion)

El costo del diesel usa la formula cuadratica real (c + b*P + a*P^2)*C_comb
con C_comb = 100 [unidades de combustible] y a=0.001, b=0.5, c=0.5.
"""
from __future__ import annotations

import pandas as pd

TZ = "America/Bogota"
SITE_ID = "pasto_narino"

# --------------------------------------------------------------------------- #
# Microred (mismos valores que el diagrama de produccion + artefactos calibrados)
# --------------------------------------------------------------------------- #
MICROGRID = {
    "pv": {
        "sensor_id": "pasto_solar_pv",
        "type": "solar",
        "capacity_kwp": 50.0,
    },
    "load": {
        "sensor_id": "pasto_load",
        "type": "load",
    },
    "battery": {
        "id": "battery_1",
        "capacity_kwh": 200.0,
        "max_charge_kw": 50.0,
        "max_discharge_kw": 50.0,
        "soc_min": 0.2,
        "soc_max": 0.95,
        "initial_soc": 0.65,
        "charge_efficiency": 0.95,
        "discharge_efficiency": 0.95,
        "degradation_cost_per_kwh": 50.0,
    },
    "diesel": {
        "id": "diesel_1",
        "min_kw": 50.0,
        "max_kw": 300.0,
        "cost_a": 0.001,
        "cost_b": 0.5,
        "cost_c": 0.5,
        "fuel_cost": 100.0,
    },
    "grid": {
        "max_import_kw": 30.0,
        "min_import_kw": -300.0,
        "cost_fixed": 40.0,
        "export_tariff": 0.0,
        "ens_penalty_cop_kwh": 5000.0,
    },
}

# Perfil ToU horario (hora 0..23) — documentado en la seccion de resultados.
_TOU_VARIABLE = [
    45, 45, 45, 45, 45, 45,          # 00-05 valle
    80, 80, 80, 80, 80, 80,          # 06-11 media
    80, 80, 80, 80, 80, 80,          # 12-17 media
    80, 140, 140, 140, 80, 80,       # 18 media, 19-21 pico, 22-23 media
]
assert len(_TOU_VARIABLE) == 24

LOAD_MAT_PEAK_KW = 80.0

# Umbrales de la regla heuristica (documentados):
HEUR = {
    "peak_tariff": 100.0,   # si tarifa >= este valor -> bateria descarga primero
    "valley_tariff": 50.0,  # si tarifa <= este valor -> cargar con excedente PV
    "soc_discharge_floor": 0.35,  # no descargar por debajo
    "soc_charge_ceiling": 0.90,   # no cargar por encima
}


def tou_variable_tariff(index: pd.DatetimeIndex) -> pd.Series:
    """Tarifa variable horaria [COP/kWh] segun el perfil ToU."""
    return pd.Series([_TOU_VARIABLE[int(h) % 24] for h in index.hour],
                     index=index, dtype=float)


def diesel_marginal_cost(power_kw: float, d: dict | None = None) -> float:
    """Costo marginal del diesel en un punto de operacion (derivada de la
    formula cuadratica): (b + 2*a*P) * C_comb."""
    d = d or MICROGRID["diesel"]
    return (d["cost_b"] + 2 * d["cost_a"] * power_kw) * d["fuel_cost"]


def diesel_total_cost(power_kw: float, d: dict | None = None) -> float:
    """(c + b*P + a*P^2) * C_comb — formula exacta del paper."""
    d = d or MICROGRID["diesel"]
    if power_kw <= 0:
        return 0.0
    return (d["cost_c"] + d["cost_b"] * power_kw
            + d["cost_a"] * power_kw ** 2) * d["fuel_cost"]
