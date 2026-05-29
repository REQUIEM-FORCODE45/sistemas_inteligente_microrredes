import {
  Sun,
  Zap,
  Battery,
  Building,
  Radio,
  Power,
  ArrowLeftRight,
  Fuel,
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
};

export const DEVICE_TYPE = {
  SOLAR_PANEL: 'solar_panel',
  DIESEL_GENERATOR: 'diesel_generator',
  GRID: 'grid',
  INVERTER: 'inverter',
  BATTERY: 'battery',
  LOAD: 'load',
  SENSOR: 'sensor_iot',
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
      types: [DEVICE_TYPE.SOLAR_PANEL, DEVICE_TYPE.DIESEL_GENERATOR, DEVICE_TYPE.GRID],
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
};

export const SOLVER_CATEGORY = {
  SOURCES: 'sources',
  STORAGE: 'storage',
  LOADS: 'loads',
  GRID: 'grid',
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
      costA: 0.001,
      costB: 0.5,
      costC: 0.5,
      fuelCost: 100,
    },
    dimension: { width: 195, height: 115 },
    solverCategory: SOLVER_CATEGORY.SOURCES,
    solverType: 'diesel',
    dispatchTypes: [
      { type: 'diesel', color: '#3b82f6', label: 'Diesel' },
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
    defaultParams: {
      maxCapacity: 10000,
      efficiency: 0.95,
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
