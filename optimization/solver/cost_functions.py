"""Funciones de costo por tipo de equipo en la microrred.

Cada funcion devuelve una expresion compatible con Pyomo:
  cost = c + b*P + a*P²  para diesel
  cost = fixed + variable*P  para grid
  cost = degradation * |P|  para bateria
"""

from typing import Any


def diesel_cost(pyomo, device: dict, power_var: Any) -> Any:
    """Costo cuadratico de generador diesel/hibrido.
    device: { cost_a, cost_b, cost_c, fuel_cost }
    Formula: (c + b*P + a*P²) * C_fuel
    """
    a = device.get("cost_a", 0.001)
    b = device.get("cost_b", 0.5)
    c = device.get("cost_c", 0.5)
    fuel = device.get("fuel_cost", 100)
    return (c + b * power_var + a * power_var ** 2) * fuel


def grid_import_cost(pyomo, grid_params: dict, power_import_var: Any) -> Any:
    """Costo de importar energia de la red principal.
    Formula: costo_fijo + costo_variable * P_import
    """
    fixed = grid_params.get("cost_fixed", 40)
    variable = grid_params.get("cost_variable", 60)
    return fixed + variable * power_import_var


def grid_export_revenue(pyomo, grid_params: dict, power_export_var: Any) -> Any:
    """Ingreso por exportar energia a la red (valor negativo = ganancia).
    Formula: -tarifa_exportacion * P_export (0 si no se paga inyeccion).
    """
    tariff = grid_params.get("export_tariff", 0.0)
    return -tariff * power_export_var


def battery_degradation_cost(pyomo, device: dict, charge_var: Any, discharge_var: Any) -> Any:
    """Costo de degradacion por ciclos de carga/descarga.
    Formula: degradation_rate * (P_charge + P_discharge)
    """
    rate = device.get("degradation_cost_per_kwh", 30.0)
    return rate * (charge_var + discharge_var)


def no_cost(pyomo, *args) -> Any:
    """Costo cero para fuentes renovables (solar)."""
    return 0.0
