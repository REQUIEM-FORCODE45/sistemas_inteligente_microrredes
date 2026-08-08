const { getAgentGraph } = require('./agentGraph');
const { findDeviceById } = require('../../helpers/deviceLookup');

const runAgent = async (io, analysisResult) => {
  const { sensor_id, sensor_nombre, sensor_tipo, timestamp, ...analisis } = analysisResult;

  if (!sensor_id) {
    console.warn('LangGraphService: Resultado de análisis sin sensor_id, se omite');
    return null;
  }

  const sensorMeta = sensor_tipo && sensor_nombre
    ? { type: sensor_tipo, name: sensor_nombre }
    : await findDeviceById(sensor_id);

  const contexto = `Sensor ${sensor_nombre || sensorMeta?.name || 'desconocido'} ` +
    `(${sensor_tipo || sensorMeta?.type || 'meter'}) en ${new Date(timestamp).toLocaleString()}. ` +
    `Nivel de alerta: ${analisis.nivel_alerta}, ` +
    `Estrategias con anomalía: ${analisis.estrategias_con_anomalia}/${analisis.total_estrategias}.`;

  let datosActuales = {};
  try {
    const { fetchLatestSnapshotsForSensors } = require('../sensorDataService');
    const snapshots = await fetchLatestSnapshotsForSensors([sensor_id], { limit: 1 });
    if (snapshots[sensor_id]?.length) {
      const doc = snapshots[sensor_id][0];
      delete doc._id;
      datosActuales = doc;
    }
  } catch (err) {
    console.error('LangGraphService: Error obteniendo datos actuales:', err.message);
  }

  const initialState = {
    sensorId: sensor_id,
    sensorName: sensor_nombre || sensorMeta?.name || 'Sensor desconocido',
    sensorType: sensor_tipo || sensorMeta?.type || 'meter',
    datosActuales,
    analisisPrevio: {
      anomalia: analisis.anomalia,
      nivel_alerta: analisis.nivel_alerta,
      detalles: analisis.detalles,
    },
    contexto,
  };

  try {
    const graph = getAgentGraph();
    const result = await graph.invoke(initialState);

    const finalPayload = result.resultadoFinal || result;

    io.to(sensor_id).emit('agent_result', {
      sensor_id,
      sensor_nombre: initialState.sensorName,
      sensor_tipo: initialState.sensorType,
      timestamp: timestamp || new Date().toISOString(),
      ...finalPayload,
    });

    console.log(
      `LangGraphService: Agente completado para "${initialState.sensorName}" → ` +
      `estado=${finalPayload.estado_sistema}, ` +
      `puntos_visualizacion=${finalPayload.datos_visualizacion?.length || 0}`
    );

    return finalPayload;
  } catch (err) {
    console.error('LangGraphService: Error ejecutando el agente:', err.message);

    const fallbackPayload = {
      estado_sistema: analisis.nivel_alerta === 'critico' ? 'critico' : 'advertencia',
      resumen_analisis: `El agente IA encontró un error al procesar los datos del sensor ${initialState.sensorName}. Los análisis estadísticos detectaron nivel "${analisis.nivel_alerta}".`,
      consejo_accionable: 'Revisar las lecturas manualmente en el panel de monitoreo y verificar la conexión con el agente IA.',
      datos_visualizacion: [],
    };

    io.to(sensor_id).emit('agent_result', {
      sensor_id,
      sensor_nombre: initialState.sensorName,
      sensor_tipo: initialState.sensorType,
      timestamp: timestamp || new Date().toISOString(),
      ...fallbackPayload,
    });

    return fallbackPayload;
  }
};

module.exports = { runAgent };
