const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { createLLM } = require('../llmFactory');

const buildAlertPrompt = (state) => {
  const { sensorName, sensorType, datosActuales, analisisPrevio } = state;
  const nivel = analisisPrevio?.nivel_alerta || 'critico';
  const detalles = analisisPrevio?.detalles || [];

  const violacionesResumen = detalles
    .filter((d) => d.anomalia_detectada)
    .map((d) => {
      if (d.violaciones) {
        return `${d.estrategia}: ${d.violaciones.map((v) => `${v.variable}=${v.valor} (${v.razon})`).join('; ')}`;
      }
      if (d.cambios) {
        return `${d.estrategia}: ${d.cambios.map((c) => c.variable).join(', ')} cambio brusco`;
      }
      if (d.anomalias) {
        return `${d.estrategia}: ${d.anomalias.map((a) => `${a.variable} Z=${a.z_score}`).join(', ')}`;
      }
      return `${d.estrategia}: sin detalles`;
    })
    .join(' | ');

  const datosRelevantes = Object.entries(datosActuales)
    .filter(([k]) => !['createAt', '_id', 'timestamp', 'sensorId'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return [
    new SystemMessage(
      'Eres un operador de microrredes eléctricas con formación en energías renovables. ' +
      'Tu tarea es redactar alertas y mitigaciones inmediatas ante anomalías en sensores de la microrred. ' +
      'Responde únicamente con estos dos campos: un resumen del problema y un consejo accionable claro y concreto.'
    ),
    new HumanMessage(
      `ALERTA NIVEL ${nivel.toUpperCase()} · Sensor: ${sensorName} (${sensorType})\n` +
      `Datos actuales: ${datosRelevantes}\n` +
      `Violaciones detectadas: ${violacionesResumen || 'Ver detalles completos en el análisis previo'}\n\n` +
      'Genera:\n' +
      '1. resumen_analisis: Explica en 2-3 frases qué está pasando con las variables críticas y por qué es preocupante.\n' +
      '2. consejo_accionable: Indica exactamente qué acción operativa tomar AHORA para mitigar el riesgo.'
    ),
  ];
};

const alertNode = async (state) => {
  const llm = createLLM();

  if (!llm) {
    return {
      resultadoFinalRaw: {
        estado_sistema: 'critico',
        resumen_analisis: `Alerta en sensor ${state.sensorName}: se detectaron anomalías en las estrategias de análisis.`,
        consejo_accionable: 'Revisar manualmente el sensor y verificar las lecturas en el panel de monitoreo.',
      },
    };
  }

  try {
    const messages = buildAlertPrompt(state);
    const response = await llm.invoke(messages);
    const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const resumenMatch = text.match(/resumen_analisis[:=]\s*["']?(.+?)["']?(?:\n|$)/is);
    const consejoMatch = text.match(/consejo_accionable[:=]\s*["']?(.+?)["']?(?:\n|$)/is);

    const resumen = resumenMatch?.[1]?.trim() || text.slice(0, 300);
    const consejo = consejoMatch?.[1]?.trim() || text.slice(resumen.length + 20, 500) || 'Verificar manualmente las lecturas.';

    return {
      resultadoFinalRaw: {
        estado_sistema: state.analisisPrevio?.nivel_alerta === 'critico' ? 'critico' : 'advertencia',
        resumen_analisis: resumen,
        consejo_accionable: consejo,
      },
    };
  } catch (err) {
    console.error('AlertNode: Error del LLM:', err.message);
    return {
      resultadoFinalRaw: {
        estado_sistema: 'critico',
        resumen_analisis: `Fallo al consultar el agente IA: ${err.message}. Sensor ${state.sensorName} con anomalías detectadas.`,
        consejo_accionable: 'Contactar al operador de turno y revisar el sensor manualmente en el tablero físico.',
      },
    };
  }
};

module.exports = { alertNode };
