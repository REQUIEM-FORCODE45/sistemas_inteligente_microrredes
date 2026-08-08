const BaseStrategy = require('./BaseStrategy');

// Umbrales por tipo de variable con justificación física.
// Se emparejan por subcadena en la clave de la lectura (en minúsculas).
//   rel : umbral de cambio relativo (fracción) cuando la lectura base es significativa.
//   abs : umbral de cambio absoluto usado como respaldo cuando la base es ~0
//         (evita la división por cero y las falsas alarmas de noche, p.ej. PV = 0).
const VARIABLE_THRESHOLDS = {
  voltage: { rel: 0.10, abs: 0.5 },   // regulación de tensión ±10%; respaldo 0.5 V
  power:   { rel: 0.50, abs: 50 },    // rampas normales de PV/demanda ±50%; respaldo 50 W
  current: { rel: 0.50, abs: 5 },     // ±50%; respaldo 5 A
  soc:     { rel: 0.20, abs: 5 },     // limitado por el BMS ±20%; respaldo 5 %
};

// Base por debajo de la cual el cambio relativo deja de ser confiable
// (evita |x_t - x_{t-1}| / x_{t-1} con x_{t-1} = 0).
const ZERO_EPS = 1e-6;

// Umbral relativo por defecto para variables no clasificadas.
const DEFAULT_RELATIVE = 0.5;
const DEFAULT_ABSOLUTE = 100;

function classifyVariable(key) {
  const k = String(key).toLowerCase();
  if (k.includes('volt') || k.includes('va') || k.includes('vb') || k.includes('vc')) return 'voltage';
  if (k.includes('curr') || k.includes('amp') || k.startsWith('i_')) return 'current';
  if (k.includes('soc') || k.includes('charge')) return 'soc';
  if (k.includes('pow') || k.includes('pw') || k.includes('pl') || k.includes('gener') || k.includes('watt')) return 'power';
  return null;
}

function thresholdFor(key) {
  const cls = classifyVariable(key);
  if (cls) return VARIABLE_THRESHOLDS[cls];
  return { rel: DEFAULT_RELATIVE, abs: DEFAULT_ABSOLUTE };
}

class RateOfChangeStrategy extends BaseStrategy {
  constructor(threshold = null) {
    super();
    // Umbral relativo por defecto (configurable vía env o argumento).
    this.defaultRelative = threshold || parseFloat(process.env.RATE_OF_CHANGE_THRESHOLD) || DEFAULT_RELATIVE;
  }

  analyze(sensorPayload, history = [], sensorType = 'meter') {
    if (!history?.length) {
      return this.formatResult(false, { mensaje: 'Sin historial suficiente para calcular tasa de cambio' });
    }

    const current = { ...sensorPayload };
    const previous = { ...history[0] };

    const cambios = [];

    for (const [key, currentRaw] of Object.entries(current)) {
      if (key === 'createAt' || key === '_id' || key === 'timestamp' || key === 'sensorId') continue;

      const currentVal = this.safeNumeric(currentRaw);
      if (currentVal === null) continue;

      const previousRaw = previous[key];
      if (previousRaw === undefined) continue;
      const previousVal = this.safeNumeric(previousRaw);
      if (previousVal === null) continue;

      const cfg = thresholdFor(key);
      const relThreshold = cfg.rel;
      const absThreshold = cfg.abs;

      const delta = currentVal - previousVal;

      // Protección contra división por cero: si la base es ~0 usamos cambio
      // absoluto contra el umbral absoluto de la variable. Esto evita las
      // falsas alarmas cuando la variable arranca desde 0 (p.ej. PV de noche).
      if (Math.abs(previousVal) < ZERO_EPS) {
        if (Math.abs(delta) > absThreshold) {
          cambios.push({
            variable: key,
            modo: 'absoluto',
            valor_anterior: previousVal,
            valor_actual: currentVal,
            absoluto: Math.round(delta * 1000) / 1000,
            umbral_absoluto: absThreshold,
            mensaje: 'Cambio absoluto sobre línea base nula',
          });
        }
        continue;
      }

      const relativeChange = Math.abs(delta / previousVal);

      if (relativeChange > relThreshold) {
        cambios.push({
          variable: key,
          modo: 'relativo',
          valor_anterior: previousVal,
          valor_actual: currentVal,
          cambio_relativo: Math.round(relativeChange * 1000) / 1000,
          absoluto: Math.round(delta * 1000) / 1000,
          umbral_relativo: relThreshold,
        });
      }
    }

    if (!cambios.length) {
      return this.formatResult(false, {
        mensaje: 'Todas las variables muestran una tasa de cambio estable',
        umbral_relativo_defecto: this.defaultRelative,
      });
    }

    return this.formatResult(true, {
      cambios,
      severidad: cambios.length > 2 ? 'alta' : cambios.length > 1 ? 'media' : 'baja',
      mensaje: `${cambios.length} variable(s) con cambio brusco`,
      umbral_relativo_defecto: this.defaultRelative,
    });
  }
}

module.exports = RateOfChangeStrategy;
