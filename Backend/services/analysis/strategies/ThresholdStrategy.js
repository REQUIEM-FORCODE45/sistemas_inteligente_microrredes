const BaseStrategy = require('./BaseStrategy');

const DEFAULT_THRESHOLDS = {
  voltage:     { high: 132, low: 114 },
  current:     { high: 200 },
  power:       { high: 15000 },
  frequency:   { high: 62, low: 58 },
  temperature: { high: 50 },
};

const SENSOR_TYPE_OVERRIDES = {
  solar:     { voltage: { high: 250, low: 180 }, power: { high: 10000 }, temperature: { high: 65 } },
  inverter:  { voltage: { high: 135, low: 115 }, current: { high: 30 }, power: { high: 5000 }, temperature: { high: 55 } },
  battery:   { voltage: { high: 58, low: 44 }, current: { high: 100 }, temperature: { high: 45 } },
  meter:     { voltage: { high: 132, low: 114 }, current: { high: 200 }, frequency: { high: 62, low: 58 } },
  microgrid: { voltage: { high: 132, low: 114 }, current: { high: 150 }, frequency: { high: 62, low: 58 } },
};

const KEY_ALIASES = {
  VA:  'voltage', VB:  'voltage', VC:  'voltage',
  IA:  'current', IB:  'current', IC:  'current', IT: 'current',
  PA:  'power',   PB:  'power',   PC:  'power',   PT: 'power',
  QA:  'power',   QB:  'power',   QC:  'power',   QT: 'power',
  SA:  'power',   SB:  'power',   SC:  'power',   ST: 'power',
  Fre: 'frequency',
  FPA: 'power_factor', FPB: 'power_factor', FPC: 'power_factor', FPT: 'power_factor',
  v:   'voltage', c: 'current', p: 'power', e: 'energy', f: 'frequency',
  pf:  'power_factor', Temp: 'temperature', Pa: 'power', Pr: 'power',
};

class ThresholdStrategy extends BaseStrategy {
  constructor(customThresholds = {}) {
    super();
    this.customThresholds = customThresholds;
  }

  _getThresholds(sensorType) {
    const base = { ...DEFAULT_THRESHOLDS };
    if (sensorType && SENSOR_TYPE_OVERRIDES[sensorType]) {
      const overrides = SENSOR_TYPE_OVERRIDES[sensorType];
      for (const [metric, limits] of Object.entries(overrides)) {
        base[metric] = { ...(base[metric] || {}), ...limits };
      }
    }
    return { ...base, ...this.customThresholds };
  }

  analyze(sensorPayload, _history = [], sensorType = 'meter') {
    const thresholds = this._getThresholds(sensorType);
    const violations = [];

    for (const [rawKey, rawValue] of Object.entries(sensorPayload)) {
      if (['createAt', '_id', 'timestamp', 'sensorId'].includes(rawKey)) continue;

      const metricName = KEY_ALIASES[rawKey] || null;
      if (!metricName) continue;

      const limits = thresholds[metricName];
      if (!limits) continue;

      const value = this.safeNumeric(rawValue);
      if (value === null) continue;

      const violation = [];
      if (limits.high !== undefined && value > limits.high) {
        violation.push(`ALTO (${value} > ${limits.high})`);
      }
      if (limits.low !== undefined && value < limits.low) {
        violation.push(`BAJO (${value} < ${limits.low})`);
      }

      if (violation.length) {
        violations.push({
          variable: rawKey,
          metric: metricName,
          valor: value,
          umbrales: limits,
          razon: violation.join(', '),
        });
      }
    }

    if (!violations.length) {
      return this.formatResult(false, { mensaje: 'Todas las lecturas dentro de umbrales normales' });
    }

    return this.formatResult(true, {
      violaciones: violations,
      severidad: violations.length > 2 ? 'alta' : violations.length > 1 ? 'media' : 'baja',
      mensaje: `${violations.length} variable(s) fuera de rango en sensor tipo "${sensorType}"`,
    });
  }
}

module.exports = ThresholdStrategy;
