const ThresholdStrategy = require('./strategies/ThresholdStrategy');
const RateOfChangeStrategy = require('./strategies/RateOfChangeStrategy');
const ZScoreStrategy = require('./strategies/ZScoreStrategy');

let registryInstance = null;

class StrategyRegistry {
  constructor() {
    this.strategies = [
      new ThresholdStrategy(),
      new RateOfChangeStrategy(),
      new ZScoreStrategy(),
    ];
  }

  runAll(sensorPayload, history, sensorType) {
    const results = [];
    let totalAnomalies = 0;

    for (const strategy of this.strategies) {
      try {
        const result = strategy.analyze(sensorPayload, history, sensorType);
        results.push(result);
        if (result.anomalia_detectada) {
          totalAnomalies++;
        }
      } catch (err) {
        console.error(`StrategyRegistry: Error en ${strategy.name}:`, err.message);
        results.push({
          estrategia: strategy.name,
          anomalia_detectada: false,
          error: err.message,
        });
      }
    }

    return {
      anomalia: totalAnomalies > 0,
      total_estrategias: this.strategies.length,
      estrategias_con_anomalia: totalAnomalies,
      nivel_alerta: totalAnomalies >= 2 ? 'critico' : totalAnomalies === 1 ? 'advertencia' : 'normal',
      detalles: results,
    };
  }
}

const getStrategyRegistry = () => {
  if (!registryInstance) {
    registryInstance = new StrategyRegistry();
  }
  return registryInstance;
};

module.exports = { StrategyRegistry, getStrategyRegistry };
