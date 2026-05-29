class BaseStrategy {
  get name() {
    return this.constructor.name;
  }

  analyze(sensorPayload, history, sensorType) {
    throw new Error(`La estrategia "${this.name}" debe implementar el método analyze()`);
  }

  safeNumeric(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.-]+/g, '');
      const parsed = parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  formatResult(isAnomaly, details = {}) {
    return {
      estrategia: this.name,
      anomalia_detectada: isAnomaly,
      ...details,
    };
  }
}

module.exports = BaseStrategy;
