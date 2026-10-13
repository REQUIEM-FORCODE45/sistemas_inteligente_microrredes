import {
  Sun,
  Zap,
  Battery,
  Building,
  Radio,
  Power,
  ArrowLeftRight,
  Fuel,
  Wind,
  Minus,
} from 'lucide-react';

export const CURRENT_TYPE = {
  AC: 'AC',
  DC: 'DC',
};

export const DEVICE_CATEGORIES = {
  SOURCES: 'sources',
  CONVERSION: 'conversion',
  STORAGE: 'storage',
  LOADS: 'loads',
  SENSORS: 'sensors',
  BUSES: 'buses',
};

export const DEVICE_TYPE = {
  SOLAR_PANEL: 'solar_panel',
  SOLAR_PANEL_AC: 'solar_panel_ac',
  DIESEL_GENERATOR: 'diesel_generator',
  WIND_TURBINE: 'wind_turbine',
  GRID: 'grid',
  INVERTER: 'inverter',
  BATTERY: 'battery',
  LOAD: 'load',
  SENSOR: 'sensor_iot',
  AC_BUS: 'ac_bus',
};

export const BITRATE = {
  SOURCE: 'source',
  SINK: 'sink',
  BIDIRECCIONAL: 'bidirectional',
};

export const CATEGORY_META = {
  [DEVICE_CATEGORIES.SOURCES]: {
    label: 'Fuentes',
    icon: Zap,
    color: 'var(--chart-4)',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
    textClass: 'text-amber-700 dark:text-amber-300',
      types: [DEVICE_TYPE.SOLAR_PANEL, DEVICE_TYPE.SOLAR_PANEL_AC, DEVICE_TYPE.DIESEL_GENERATOR, DEVICE_TYPE.WIND_TURBINE, DEVICE_TYPE.GRID],
  },
  [DEVICE_CATEGORIES.CONVERSION]: {
    label: 'Conversión',
    icon: ArrowLeftRight,
    color: 'var(--chart-3)',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-700 dark:text-blue-300',
    types: [DEVICE_TYPE.INVERTER],
  },
  [DEVICE_CATEGORIES.STORAGE]: {
    label: 'Almacenamiento',
    icon: Battery,
    color: 'var(--chart-2)',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    types: [DEVICE_TYPE.BATTERY],
  },
  [DEVICE_CATEGORIES.LOADS]: {
    label: 'Cargas',
    icon: Building,
    color: 'var(--foreground)',
    bgClass: 'bg-muted dark:bg-muted/30',
    borderClass: 'border-border',
    textClass: 'text-foreground',
    types: [DEVICE_TYPE.LOAD],
  },
  [DEVICE_CATEGORIES.SENSORS]: {
    label: 'Sensores IoT',
    icon: Radio,
    color: 'var(--chart-5)',
    bgClass: 'bg-purple-50 dark:bg-purple-950/30',
    borderClass: 'border-purple-200 dark:border-purple-800',
    textClass: 'text-purple-700 dark:text-purple-300',
    types: [DEVICE_TYPE.SENSOR],
  },
  [DEVICE_CATEGORIES.BUSES]: {
    label: 'Buses',
    icon: Minus,
    color: 'var(--foreground)',
    bgClass: 'bg-muted dark:bg-muted/30',
    borderClass: 'border-border',
    textClass: 'text-foreground',
    types: [DEVICE_TYPE.AC_BUS],
  },
};

export const SOLVER_CATEGORY = {
  SOURCES: 'sources',
  STORAGE: 'storage',
  LOADS: 'loads',
  GRID: 'grid',
  CONVERSION: 'conversion',
};

export const DEVICE_DEFINITIONS = {
  [DEVICE_TYPE.SOLAR_PANEL]: {
    type: DEVICE_TYPE.SOLAR_PANEL,
    category: DEVICE_CATEGORIES.SOURCES,
    label: 'Panel Solar',
    icon: Sun,
    currentType: CURRENT_TYPE.DC,
    bitrate: BITRATE.SOURCE,
    defaultParams: {
      maxCapacity: 5000,
      efficiency: 0.21,
    },
    dimension: { width: 180, height: 110 },
    solverCategory: SOLVER_CATEGORY.SOURCES,
    solverType: 'solar',
    dispatchTypes: [
      { type: 'solar', color: '#f59e0b', label: 'Solar' },
    ],
  },
  [DEVICE_TYPE.SOLAR_PANEL_AC]: {
    type: DEVICE_TYPE.SOLAR_PANEL_AC,
    category: DEVICE_CATEGORIES.SOURCES,
    label: 'Panel Solar AC',
    icon: Sun,
    // Con microinversor integrado: la conversion DC->AC la hace el propio panel,
    // por eso su salida ya es AC y puede ir directo a una carga AC.
    currentType: CURRENT_TYPE.AC,
    bitrate: BITRATE.SOURCE,
    defaultParams: {
      maxCapacity: 5000,
      efficiency: 0.21,
      invEfficiency: 0.95,
    },
    dimension: { width: 185, height: 110 },
    solverCategory: SOLVER_CATEGORY.SOURCES,
    solverType: 'solar',
    dispatchTypes: [
      { type: 'solar', color: '#f59e0b', label: 'Solar' },
    ],
  },
  [DEVICE_TYPE.DIESEL_GENERATOR]: {
    type: DEVICE_TYPE.DIESEL_GENERATOR,
    category: DEVICE_CATEGORIES.SOURCES,
    label: 'Generador Diésel',
    icon: Fuel,
    currentType: CURRENT_TYPE.AC,
    bitrate: BITRATE.SOURCE,
    defaultParams: {
      maxCapacity: 300000,
      minCapacity: 50000,
      // Cambio 11: Willans de la tesis (a2/a1/a0). fuelCost null = del sitio
      // (Pasto 2,782 COP/L, CREG 2026-10); solo se envia si el operador lo edita.
      costA: 0.0012,
      costB: 0.24,
      costC: 1.8,
      fuelCost: null,
      // Cambio 10.1: null = NO declarada (nunca 0 silencioso).
      rampKwPerH: null,
      // Cambio 08.4: costo de arranque/parada (COP por evento), mismo criterio.
      startCostCop: null,
      stopCostCop: null,
    },
    dimension: { width: 195, height: 115 },
    solverCategory: SOLVER_CATEGORY.SOURCES,
    solverType: 'diesel',
    dispatchTypes: [
      { type: 'diesel', color: '#3b82f6', label: 'Diesel' },
    ],
  },
  [DEVICE_TYPE.WIND_TURBINE]: {
    type: DEVICE_TYPE.WIND_TURBINE,
    category: DEVICE_CATEGORIES.SOURCES,
    label: 'Aerogenerador',
    icon: Wind,
    currentType: CURRENT_TYPE.AC,
    bitrate: BITRATE.SOURCE,
    defaultParams: {
      maxCapacity: 100000,
      efficiency: 0.4,
    },
    dimension: { width: 185, height: 110 },
    solverCategory: SOLVER_CATEGORY.SOURCES,
    solverType: 'wind',
    dispatchTypes: [
      { type: 'wind', color: '#14b8a6', label: 'Eólica' },
    ],
  },
  [DEVICE_TYPE.GRID]: {
    type: DEVICE_TYPE.GRID,
    category: DEVICE_CATEGORIES.SOURCES,
    label: 'Red Eléctrica',
    icon: Power,
    currentType: CURRENT_TYPE.AC,
    bitrate: BITRATE.SOURCE,
    defaultParams: {
      maxCapacity: 100000,
      voltage: 220,
      // Cambio 10.3: null en ToU = sin declarar (escalar costVariable).
      costFixed: 40,
      costVariable: 60,
      tariffMode: 'hora',
      maxExportKw: null,
      touValley: null,
      touMedia: null,
      touPeak: null,
    },
    dimension: { width: 180, height: 110 },
    solverCategory: SOLVER_CATEGORY.GRID,
    solverType: 'grid',
    dispatchTypes: [
      { type: 'grid_import', color: '#10b981', label: 'Red (import)' },
      { type: 'grid_export', color: '#ef4444', label: 'Red (export)' },
    ],
  },
  [DEVICE_TYPE.INVERTER]: {
    type: DEVICE_TYPE.INVERTER,
    category: DEVICE_CATEGORIES.CONVERSION,
    label: 'Inversor',
    icon: ArrowLeftRight,
    currentType: CURRENT_TYPE.AC,
    bitrate: BITRATE.BIDIRECCIONAL,
    convertsFrom: CURRENT_TYPE.DC,
    convertsTo: CURRENT_TYPE.AC,
    // Cambio 13.1: con modelo en el solver (P_ac = eta*P_dc, tope P_ac_max).
    // Punto 3 (auditoria 13, decision del autor 2026-10-12): el default 0.97
    // es REFERENCIA declarada (no dato de placa) — canonica en
    // optimization/experiments/config.py ["eta_fuente"]; PENDIENTE el dato de
    // placa del sitio. efficiency vacia/0 => eta no declarada => NO convierte
    // (C3, prohibido inventar). bidirectional/busDc opt-in (default false).
    solverCategory: SOLVER_CATEGORY.CONVERSION,
    solverType: 'inverter',
    dispatchTypes: [
      { type: 'inverter', color: '#3b82f6', label: 'Inversor' },
    ],
    defaultParams: {
      maxCapacity: 10000,
      efficiency: 0.97,
      bidirectional: false,
      busDc: false,
    },
    dimension: { width: 200, height: 120 },
  },
  [DEVICE_TYPE.BATTERY]: {
    type: DEVICE_TYPE.BATTERY,
    category: DEVICE_CATEGORIES.STORAGE,
    label: 'Batería',
    icon: Battery,
    currentType: CURRENT_TYPE.DC,
    bitrate: BITRATE.BIDIRECCIONAL,
    defaultParams: {
      capacity: 10000,
      chargeLevel: 80,
      voltage: 48,
      // Cambio 10.2: default 30 = valor actual (tesis sugiere ~200, solo nota).
      degradationCost: 30,
    },
    dimension: { width: 190, height: 115 },
    solverCategory: SOLVER_CATEGORY.STORAGE,
    solverType: 'battery',
    dispatchTypes: [
      { type: 'battery_charge', color: '#8b5cf6', label: 'Bat (Carga)' },
      { type: 'battery_discharge', color: '#6366f1', label: 'Bat (Descarga)' },
    ],
  },
  [DEVICE_TYPE.LOAD]: {
    type: DEVICE_TYPE.LOAD,
    category: DEVICE_CATEGORIES.LOADS,
    label: 'Carga / Edificio',
    icon: Building,
    currentType: CURRENT_TYPE.AC,
    bitrate: BITRATE.SINK,
    defaultParams: {
      maxLoad: 3000,
      consumption: 0,
      loadSource: 'static', // 'mat' -> perfil modular Consumo.mat | 'static' -> fija
    },
    dimension: { width: 180, height: 110 },
    solverCategory: SOLVER_CATEGORY.LOADS,
    solverType: 'load',
    dispatchTypes: [
      { type: 'load', color: '#111827', label: 'Carga' },
    ],
  },
  [DEVICE_TYPE.SENSOR]: {
    type: DEVICE_TYPE.SENSOR,
    category: DEVICE_CATEGORIES.SENSORS,
    label: 'Sensor IoT',
    icon: Radio,
    currentType: null,
    bitrate: null,
    defaultParams: {
      metric: 'Voltaje',
      interval: 5000,
    },
    dimension: { width: 150, height: 80 },
  },
  [DEVICE_TYPE.AC_BUS]: {
    type: DEVICE_TYPE.AC_BUS,
    category: DEVICE_CATEGORIES.BUSES,
    label: 'Barra AC',
    icon: Minus,
    currentType: CURRENT_TYPE.AC,
    bitrate: null,
    // Cambio 12.4: decorativa — sin solverCategory ni solverType: no va al job,
    // no entra al eco ni al pre-flight. Solo dibujo (barra del unifilar).
    decorative: true,
    defaultParams: {
      voltage: 220,
      frequency: 60,
    },
    // Ancho de la referencia (variante B, ~880 px): la barra abarca las
    // derivaciones para lectura de unifilar (nota c del cierre 12.4).
    dimension: { width: 880, height: 64 },
  },
};

export function getDispatchChartInfo() {
  const colors = {};
  const labels = {};
  for (const def of Object.values(DEVICE_DEFINITIONS)) {
    if (def.dispatchTypes) {
      for (const dt of def.dispatchTypes) {
        colors[dt.type] = dt.color;
        labels[dt.type] = dt.label;
      }
    }
  }
  return { colors, labels };
}

export function getDeviceDispatchTypes(deviceType) {
  const def = DEVICE_DEFINITIONS[deviceType];
  return def?.dispatchTypes || [];
}

export function getNodeBadgeInfo(dispatchPlan, nodeId, deviceType) {
  if (!dispatchPlan || dispatchPlan.length === 0) return null;
  const types = getDeviceDispatchTypes(deviceType);
  if (types.length === 0) return null;
  if (deviceType === DEVICE_TYPE.GRID) {
    const imp = dispatchPlan.find((d) => d.device_id === 'grid' && d.device_type === 'grid_import');
    const exp = dispatchPlan.find((d) => d.device_id === 'grid' && d.device_type === 'grid_export');
    if (exp) return { label: `↑ ${Math.abs(exp.power_kw)}kW exp`, color: types.find((t) => t.type === 'grid_export')?.color };
    if (imp) return { label: `↓ ${imp.power_kw}kW imp`, color: types.find((t) => t.type === 'grid_import')?.color };
    return null;
  }
  if (deviceType === DEVICE_TYPE.BATTERY) {
    const dch = dispatchPlan.find((d) => d.device_id === nodeId && d.device_type === 'battery_discharge');
    const ch = dispatchPlan.find((d) => d.device_id === nodeId && d.device_type === 'battery_charge');
    if (dch) return { label: `−${dch.power_kw}kW`, color: types.find((t) => t.type === 'battery_discharge')?.color };
    if (ch) return { label: `+${ch.power_kw}kW`, color: types.find((t) => t.type === 'battery_charge')?.color };
    return null;
  }
  const primaryType = types[0].type;
  const entry = dispatchPlan.find((d) => d.device_id === nodeId && d.device_type === primaryType);
  if (!entry) return null;
  return { label: `${entry.power_kw}kW`, color: types[0].color };
}

export const EDGE_TYPES = {
  POWER: 'powerEdge',
};

// Cambio 12.4 — símbolo por tipo y acento de categoría, copiados de la
// referencia (simbolos.svg). Viven aquí (solo constantes) para la regla
// react-refresh/only-export-components.
export const SYMBOL_FOR_TYPE = {
  grid: 's-grid',
  solar_panel: 's-pv',
  solar_panel_ac: 's-pv',
  diesel_generator: 's-die',
  inverter: 's-inv',
  transformer: 's-trafo',
  battery: 's-batt',
  load: 's-load',
};

export const CATEGORY_ACCENT = {
  solar_panel: 'var(--pv, #10b981)',
  solar_panel_ac: 'var(--pv, #10b981)',
  grid: 'var(--grid, #f59e0b)',
  diesel_generator: 'var(--die, #64748b)',
  battery: 'var(--bat, #3b82f6)',
  load: 'var(--load, #8b5cf6)',
  inverter: 'var(--bat, #3b82f6)',
  wind_turbine: 'var(--grid, #f59e0b)',
  sensor_iot: 'var(--off, #94a3b8)',
};

// Cambio 12.4 — grosor de rama ∝ kW (proporción copiada de la referencia:
// red 6 px @10 kW, PV 3.5 px @4 kW, batería 2.5 px @1.5 kW).
export function flowWidthFor(kw) {
  const w = 1.8 + 0.42 * Math.abs(kw || 0);
  return Math.min(7, Math.max(1.5, w));
}

// Cambio 12.2 — claves de defaultParams que NO van al solver, cada una con su
// motivo. Sin esta lista, el test de cobertura (test_mapper_coverage) falla.
export const PARAMS_SOLO_UI = {
  'grid.voltage': 'parámetro de placa, no entra al modelo',
  'battery.voltage': 'parámetro de placa, no entra al modelo',
  // Cambio 13: inverter.maxCapacity/efficiency ELIMINADAS de esta lista —
  // desde el 13.1 tienen camino al job por el mapper (antes: 'tipo sin modelo
  // en el solver (ver cambio 13)'). Dejarlas seria declarar una mentira.
  'sensor_iot.metric': 'se enlaza por sensor_mappings, no entra al modelo eléctrico',
  'sensor_iot.interval': 'se enlaza por sensor_mappings, no entra al modelo eléctrico',
  'ac_bus.voltage': 'nodo decorativo (barra del unifilar), no entra al modelo',
  'ac_bus.frequency': 'nodo decorativo (barra del unifilar), no entra al modelo',
};

// Cambio 12.2 — tipos dibujables sin modelo en el solver (pre-flight + eco).
// Cambio 13: salio 'inverter' (ya modelado); queda solo el sensor.
export const UNSUPPORTED_SOLVER_TYPES = {
  sensor_iot: 'se enlaza por sensor_mappings, no entra al modelo eléctrico',
};

// Cambio 12.4 — migración legacy EXACTA. Solo actúa con coincidencia exacta con
// la tupla legacy conocida (0.001/0.5/0.5/100); nunca pisa un valor a propósito.
const LEGACY_DIESEL = { costA: 0.001, costB: 0.5, costC: 0.5, fuelCost: 100 };
const WILLANS_DIESEL = { costA: 0.0012, costB: 0.24, costC: 1.8, fuelCost: null };

export function migrateParams(deviceType, params) {
  const p = { ...(params || {}) };
  if (deviceType === DEVICE_TYPE.DIESEL_GENERATOR
      && p.costA === LEGACY_DIESEL.costA
      && p.costB === LEGACY_DIESEL.costB
      && p.costC === LEGACY_DIESEL.costC
      && p.fuelCost === LEGACY_DIESEL.fuelCost) {
    return { params: { ...p, ...WILLANS_DIESEL }, migrated: true };
  }
  return { params: p, migrated: false };
}
