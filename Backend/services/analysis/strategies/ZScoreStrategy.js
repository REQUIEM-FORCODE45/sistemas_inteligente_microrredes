const BaseStrategy = require('./BaseStrategy');

class ZScoreStrategy extends BaseStrategy {
  constructor(windowSize = null, zScoreThreshold = null) {
    super();
    this.windowSize = windowSize || parseInt(process.env.ANALYSIS_WINDOW_SIZE, 10) || 30;
    this.zScoreThreshold = zScoreThreshold || parseFloat(process.env.ZSCORE_THRESHOLD) || 3.0;
  }

  _computeStats(values) {
    const n = values.length;
    if (n === 0) return { mean: 0, std: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    return { mean, std };
  }

  analyze(sensorPayload, history = []) {
    const relevantHistory = history.slice(0, this.windowSize);

    if (relevantHistory.length < 5) {
      return this.formatResult(false, {
        mensaje: `Insuficientes datos históricos para Z-Score (${relevantHistory.length} < 5 requeridos)`,
        ventana: this.windowSize,
      });
    }

    const anomalies = [];
    let totalChecked = 0;

    for (const [key, currentRaw] of Object.entries(sensorPayload)) {
      if (key === 'createAt' || key === '_id' || key === 'timestamp' || key === 'sensorId') continue;

      const currentVal = this.safeNumeric(currentRaw);
      if (currentVal === null) continue;

      const historicalValues = [];
      for (const doc of relevantHistory) {
        const val = this.safeNumeric(doc[key]);
        if (val !== null) historicalValues.push(val);
      }

      if (historicalValues.length < 5) continue;
      totalChecked++;

      const { mean, std } = this._computeStats(historicalValues);
      if (std === 0) continue;

      const zScore = Math.abs((currentVal - mean) / std);

      if (zScore > this.zScoreThreshold) {
        anomalies.push({
          variable: key,
          valor_actual: currentVal,
          media_historica: Math.round(mean * 100) / 100,
          desviacion_std: Math.round(std * 100) / 100,
          z_score: Math.round(zScore * 100) / 100,
        });
      }
    }

    if (!anomalies.length) {
      return this.formatResult(false, {
        mensaje: `No se detectaron anomalías contextuales en ${totalChecked} variables (|z| < ${this.zScoreThreshold})`,
        umbral: this.zScoreThreshold,
        ventana: this.windowSize,
        variables_analizadas: totalChecked,
      });
    }

    return this.formatResult(true, {
      anomalias: anomalies,
      severidad: anomalies.length > 2 ? 'alta' : 'media',
      mensaje: `${anomalies.length} variable(s) con desviación contextual significativa (|z| > ${this.zScoreThreshold})`,
      umbral: this.zScoreThreshold,
      ventana: this.windowSize,
    });
  }
}

module.exports = ZScoreStrategy;
