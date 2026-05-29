const BaseStrategy = require('./BaseStrategy');

class RateOfChangeStrategy extends BaseStrategy {
  constructor(threshold = null) {
    super();
    this.threshold = threshold || parseFloat(process.env.RATE_OF_CHANGE_THRESHOLD) || 0.5;
  }

  analyze(sensorPayload, history = []) {
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

      if (previousVal === 0) {
        if (currentVal !== 0) {
          cambios.push({ variable: key, cambio_relativo: 1.0, absoluto: currentVal - previousVal });
        }
        continue;
      }

      const delta = currentVal - previousVal;
      const relativeChange = Math.abs(delta / previousVal);

      if (relativeChange > this.threshold) {
        cambios.push({
          variable: key,
          valor_anterior: previousVal,
          valor_actual: currentVal,
          cambio_relativo: Math.round(relativeChange * 1000) / 1000,
          absoluto: Math.round(delta * 1000) / 1000,
        });
      }
    }

    if (!cambios.length) {
      return this.formatResult(false, {
        mensaje: 'Todas las variables muestran una tasa de cambio estable',
        umbral: this.threshold,
      });
    }

    return this.formatResult(true, {
      cambios,
      severidad: cambios.length > 2 ? 'alta' : cambios.length > 1 ? 'media' : 'baja',
      mensaje: `${cambios.length} variable(s) con cambio brusco (>${Math.round(this.threshold * 100)}%)`,
      umbral: this.threshold,
    });
  }
}

module.exports = RateOfChangeStrategy;
