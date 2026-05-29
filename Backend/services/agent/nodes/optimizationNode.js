const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { createLLM } = require('../llmFactory');

const buildOptimizationPrompt = (state) => {
  const { sensorName, sensorType, datosActuales } = state;

  const datosRelevantes = Object.entries(datosActuales)
    .filter(([k]) => !['createAt', '_id', 'timestamp', 'sensorId'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  const tipoContexto = {
    solar: 'panel solar fotovoltaico',
    inverter: 'inversor de corriente',
    battery: 'banco de baterías',
    meter: 'medidor de red',
    microgrid: 'punto de acople de microrred',
  };

  return [
    new SystemMessage(
      'Eres un ingeniero de eficiencia energética especializado en microrredes con fuentes renovables. ' +
      'Tu tarea es sugerir optimizaciones operativas para mejorar el rendimiento y la eficiencia de la microrred. ' +
      'Responde con un breve resumen del estado actual y un consejo accionable orientado a eficiencia, ' +
      'almacenamiento de energía o distribución de carga.'
    ),
    new HumanMessage(
      `Sensor: ${sensorName} · Tipo: ${tipoContexto[sensorType] || sensorType}\n` +
      `Datos actuales (sin anomalías detectadas): ${datosRelevantes}\n\n` +
      'Genera:\n' +
      '1. resumen_analisis: Describe en 1-3 frases el comportamiento normal del sensor y la microrred en este momento.\n' +
      '2. consejo_accionable: Recomienda una acción proactiva para mejorar la eficiencia energética (p. ej. ' +
      'ajustar carga, almacenar excedentes, programar mantenimiento preventivo, balancear fases).'
    ),
  ];
};

const optimizationNode = async (state) => {
  const llm = createLLM();

  if (!llm) {
    return {
      resultadoFinalRaw: {
        estado_sistema: 'normal',
        resumen_analisis: `Operación normal en sensor ${state.sensorName}. Todas las variables dentro de parámetros esperados.`,
        consejo_accionable: 'Continuar monitoreo regular y verificar tendencias a largo plazo.',
      },
    };
  }

  try {
    const messages = buildOptimizationPrompt(state);
    const response = await llm.invoke(messages);
    const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const resumenMatch = text.match(/resumen_analisis[:=]\s*["']?(.+?)["']?(?:\n|$)/is);
    const consejoMatch = text.match(/consejo_accionable[:=]\s*["']?(.+?)["']?(?:\n|$)/is);

    const resumen = resumenMatch?.[1]?.trim() || text.slice(0, 300);
    const consejo = consejoMatch?.[1]?.trim() || text.slice(resumen.length + 20, 500) || 'Mantener la configuración actual y monitorear.';

    return {
      resultadoFinalRaw: {
        estado_sistema: 'normal',
        resumen_analisis: resumen,
        consejo_accionable: consejo,
      },
    };
  } catch (err) {
    console.error('OptimizationNode: Error del LLM:', err.message);
    return {
      resultadoFinalRaw: {
        estado_sistema: 'normal',
        resumen_analisis: `Sensor ${state.sensorName} operando normalmente.`,
        consejo_accionable: 'Continuar monitoreo y programar revisión preventiva semanal.',
      },
    };
  }
};

module.exports = { optimizationNode };
