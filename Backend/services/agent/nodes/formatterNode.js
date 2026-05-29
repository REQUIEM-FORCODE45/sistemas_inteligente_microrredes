const { z } = require('zod');
const { fetchLatestSnapshotsForSensors, parseNumericValue } = require('../../sensorDataService');

const outputSchema = z.object({
  estado_sistema: z.enum(['normal', 'advertencia', 'critico']),
  resumen_analisis: z.string().min(10).max(600),
  consejo_accionable: z.string().min(10).max(600),
  datos_visualizacion: z.array(
    z.object({
      timestamp: z.string(),
      valor_real: z.number(),
      valor_esperado: z.number(),
    })
  ).min(0).max(60),
});

const computeExpectedValue = (history, key) => {
  if (!history?.length || !key) return null;
  const values = history
    .map((doc) => parseNumericValue(doc[key]))
    .filter((v) => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const pickMainKey = (payload) => {
  const priority = ['PT', 'ST', 'VB', 'VA', 'VC', 'IT', 'Fre', 'p', 'v', 'c', 'e', 'Temp'];
  for (const key of priority) {
    if (key in payload && parseNumericValue(payload[key]) !== null) return key;
  }
  for (const key of Object.keys(payload)) {
    if (['createAt', '_id', 'timestamp', 'sensorId'].includes(key)) continue;
    if (parseNumericValue(payload[key]) !== null) return key;
  }
  return null;
};

const buildVisualizationData = (sensorId, payload, history) => {
  const mainKey = pickMainKey(payload);
  if (!mainKey || !history?.length) {
    return [
      {
        timestamp: new Date().toISOString(),
        valor_real: parseNumericValue(payload[mainKey]) || 0,
        valor_esperado: 0,
      },
    ];
  }

  const expected = computeExpectedValue(history, mainKey) || 0;

  const sorted = [...history]
    .filter((doc) => doc[mainKey] !== undefined)
    .sort((a, b) => new Date(a.createAt || 0) - new Date(b.createAt || 0))
    .slice(-30);

  return sorted.map((doc) => ({
    timestamp: (doc.createAt || new Date()).toISOString ? new Date(doc.createAt).toISOString() : new Date().toISOString(),
    valor_real: parseNumericValue(doc[mainKey]) || 0,
    valor_esperado: expected,
  }));
};

const formatterNode = async (state) => {
  const { sensorId, datosActuales, resultadoFinalRaw, analisisPrevio } = state;

  const estadoBase = resultadoFinalRaw?.estado_sistema ||
    (analisisPrevio?.anomalia ? (analisisPrevio.nivel_alerta === 'critico' ? 'critico' : 'advertencia') : 'normal');

  const resumen = resultadoFinalRaw?.resumen_analisis ||
    `Sensor ${state.sensorName || 'desconocido'}: operación en estado ${estadoBase}.`;

  const consejo = resultadoFinalRaw?.consejo_accionable ||
    'Monitorear el panel de control para revisar tendencias.';

  const mainKey = pickMainKey(datosActuales);

  let datosVisualizacion = [];
  try {
    const snapshots = await fetchLatestSnapshotsForSensors([sensorId], { limit: 30 });
    const history = snapshots[sensorId] || [];
    datosVisualizacion = buildVisualizationData(sensorId, datosActuales, history);
  } catch (err) {
    console.error('FormatterNode: Error obteniendo datos de visualización:', err.message);
    datosVisualizacion = [
      {
        timestamp: new Date().toISOString(),
        valor_real: 0,
        valor_esperado: 0,
      },
    ];
  }

  const resultado = {
    estado_sistema: estadoBase,
    resumen_analisis: resumen,
    consejo_accionable: consejo,
    variable_graficada: mainKey || undefined,
    datos_visualizacion: datosVisualizacion,
  };

  try {
    outputSchema.parse(resultado);
  } catch (validationErr) {
    console.error('FormatterNode: Esquema de salida inválido:', validationErr.message);
    return {
      resultadoFinal: {
        estado_sistema: estadoBase,
        resumen_analisis: resumen.slice(0, 600),
        consejo_accionable: consejo.slice(0, 600),
        datos_visualizacion: datosVisualizacion.slice(0, 60),
      },
    };
  }

  return { resultadoFinal: resultado };
};

module.exports = { formatterNode, outputSchema };
