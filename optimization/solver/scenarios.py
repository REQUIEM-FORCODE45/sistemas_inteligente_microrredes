"""Generacion de escenarios estocasticos climaticos para la optimizacion.

Por defecto usa 3 escenarios:
  - Soleado (60%): factor_pv = 1.0
  - Nublado (30%): factor_pv = 0.5
  - Lluvia  (10%): factor_pv = 0.2
"""

from typing import Any


DEFAULT_SCENARIOS = [
    {"name": "Soleado", "probability": 0.60, "factor_pv": 1.0},
    {"name": "Nublado", "probability": 0.30, "factor_pv": 0.5},
    {"name": "Lluvia",  "probability": 0.10, "factor_pv": 0.2},
]


def build_scenarios(input_scenarios: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Devuelve lista de escenarios validados.
    Si no se proveen, usa los defaults.
    """
    if input_scenarios is None or len(input_scenarios) == 0:
        return DEFAULT_SCENARIOS
    scenarios = []
    for s in input_scenarios:
        scenarios.append({
            "name": s.get("name", "Escenario"),
            "probability": float(s.get("probability", 1.0)),
            "factor_pv": float(s.get("factor_pv", 1.0)),
        })
    total_prob = sum(s["probability"] for s in scenarios)
    if abs(total_prob - 1.0) > 0.01:
        factor = 1.0 / total_prob
        for s in scenarios:
            s["probability"] *= factor
    return scenarios
