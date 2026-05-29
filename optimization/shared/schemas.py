from dataclasses import dataclass
from typing import Optional


@dataclass
class DeviceSource:
    id: str
    type: str  # solar, diesel, grid, battery, inverter, load
    max_kw: float
    min_kw: float = 0.0
    efficiency: float = 1.0
    cost_a: float = 0.0  # coeficiente cuadratico
    cost_b: float = 0.0  # coeficiente lineal
    cost_c: float = 0.0  # coeficiente fijo
    fuel_cost: float = 0.0  # C_fuel

    # bateria especifico
    capacity_kwh: Optional[float] = None
    max_charge_kw: Optional[float] = None
    max_discharge_kw: Optional[float] = None
    soc_min: Optional[float] = 0.2
    soc_max: Optional[float] = 0.95
    initial_soc: Optional[float] = None
    charge_efficiency: Optional[float] = 0.95
    discharge_efficiency: Optional[float] = 0.95

    # inverter especifico
    ac_side: Optional[str] = None  # 'ac' o 'dc'


@dataclass
class GridParams:
    max_import_kw: float
    max_export_kw: float
    cost_fixed: float = 40.0
    cost_variable: float = 60.0


@dataclass
class ScenarioDef:
    name: str
    probability: float
    factor_pv: float  # multiplicador de irradiancia para este escenario


@dataclass
class OptimizationInput:
    job_id: str
    horizon: int  # numero de horas
    time_step_minutes: int
    sources: list[DeviceSource]
    storage: list[DeviceSource]
    converters: list[DeviceSource]
    loads: list[DeviceSource]
    grid: GridParams
    predictions_solar: list[float]
    predictions_load: list[list[float]]
    scenarios: list[ScenarioDef]


@dataclass
class DispatchEntry:
    device_id: str
    device_type: str
    hour: int
    scenario: str
    power_kw: float
    cost: float


@dataclass
class OptimizationResult:
    job_id: str
    status: str
    objective_value: Optional[float] = None
    dispatch_plan: Optional[list[DispatchEntry]] = None
    cost_breakdown: Optional[dict] = None
    scenario_results: Optional[dict] = None
    battery_soc_evolution: Optional[dict] = None
    total_hours: int = 24
    error: Optional[str] = None
