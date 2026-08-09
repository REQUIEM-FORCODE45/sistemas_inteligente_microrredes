"""Generacion de escenarios estocasticos climaticos para la optimizacion.

Metodo documentado (requisito del Comentario 1 del revisor):
S = 3 escenarios, anclados a las curvas de cuantiles P10/P50/P90 del
pronostico calibrado (PatchTST + ajuste de datos):

  - Soleado (prob 0.2): curva P90 (optimista)
  - Nublado (prob 0.6): curva P50 (base)
  - Lluvia  (prob 0.2): curva P10 (pesimista, peor caso)

Cada escenario usa la curva del cuantil correspondiente (factor_pv = 1.0).
Cuando no hay banda de cuantiles (solo perfil kW), se aplica el factor
multiplicativo por escenario; para el viento el factor por escenario es
factor_wind = 1.0 / 0.85 / 0.7.
"""

from typing import Any


DEFAULT_SCENARIOS = [
    {"name": "Soleado", "probability": 0.20, "quantile": "P90",
     "factor_pv": 1.0, "factor_wind": 1.0},
    {"name": "Nublado", "probability": 0.60, "quantile": "P50",
     "factor_pv": 1.0, "factor_wind": 0.85},
    {"name": "Lluvia",  "probability": 0.20, "quantile": "P10",
     "factor_pv": 1.0, "factor_wind": 0.7},
]


def build_scenarios(input_scenarios: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Devuelve lista de escenarios validados.
    Si no se proveen, usa los defaults anclados a cuantiles.
    """
    if input_scenarios is None or len(input_scenarios) == 0:
        return DEFAULT_SCENARIOS
    scenarios = []
    for s in input_scenarios:
        scenarios.append({
            "name": s.get("name", "Escenario"),
            "probability": float(s.get("probability", 1.0)),
            "quantile": s.get("quantile"),
            "factor_pv": float(s.get("factor_pv", 1.0)),
            "factor_wind": float(s.get("factor_wind", 1.0)),
        })
    total_prob = sum(s["probability"] for s in scenarios)
    if abs(total_prob - 1.0) > 0.01:
        factor = 1.0 / total_prob
        for s in scenarios:
            s["probability"] *= factor
    return scenarios
