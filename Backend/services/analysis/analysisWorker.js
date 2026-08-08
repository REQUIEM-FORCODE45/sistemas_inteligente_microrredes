const { findDeviceById } = require('../../helpers/deviceLookup');
const { getStrategyRegistry } = require('./strategyRegistry');
const { fetchLatestSnapshotsForSensors } = require('../sensorDataService');
const { runAgent } = require('../agent/langgraphService');

const createAnalysisWorker = (io) => {
  return async (job) => {
    const { sensorId, payload, timestamp } = job.data;

    if (!sensorId || !payload) {
      console.warn('AnalysisWorker: Job sin sensorId o payload, se omite');
      return { omitido: true, motivo: 'datos insuficientes' };
    }

    const sensorMeta = await findDeviceById(sensorId);
    const sensorType = sensorMeta?.type || 'meter';
    const sensorName = sensorMeta?.name || 'Sensor desconocido';

    const snapshots = await fetchLatestSnapshotsForSensors([sensorId], {
      limit: parseInt(process.env.ANALYSIS_WINDOW_SIZE, 10) || 30,
    });
    const history = snapshots[sensorId] || [];

    const registry = getStrategyRegistry();
    const analisis = registry.runAll(payload, history, sensorType);

    const analysisResult = {
      sensor_id: sensorId,
      sensor_nombre: sensorName,
      sensor_tipo: sensorType,
      timestamp: timestamp || new Date().toISOString(),
      ...analisis,
    };

    io.to(sensorId).emit('agent_analisis', analysisResult);

    console.log(
      `AnalysisWorker: Sensor "${sensorName}" (${sensorType}) → nivel=${analisis.nivel_alerta}, ` +
      `estrategias=${analisis.estrategias_con_anomalia}/${analisis.total_estrategias}`
    );

    try {
      await runAgent(io, analysisResult);
    } catch (agentErr) {
      console.error(`AnalysisWorker: Error en LangGraph agent para ${sensorName}:`, agentErr.message);
    }

    return analysisResult;
  };
};

module.exports = { createAnalysisWorker };
