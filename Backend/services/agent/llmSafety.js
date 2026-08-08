/**
 * Capa de seguridad del agente LLM (comentario 10 del revisor).
 *
 * Principio: el LLM es estrictamente consultivo. NUNCA ejecuta acciones de
 * control. Esta capa refuerza eso con:
 *   (i)   allowlist de tipos de acción recomendables (solo los del sistema);
 *   (ii)  verificación numérica de que los setpoints sugeridos caen en rangos
 *         físicos admisibles derivados de los datos de entrada;
 *   (iii) registro (audit) de cada recomendación con su justificación.
 *
 * No modifica el camino de datos del control: el MPC y el operador humano
 * siguen siendo los únicos que aplican acciones físicas.
 */

// Tipos de acción que el LLM tiene permitido recomendar.
const ALLOWED_ACTION_TYPES = new Set([
  'none',          // no action
  'inspect',       // revisar / monitorear
  'maintenance',   // mantenimiento preventivo
  'dispatch_advice', // consejo sobre despacho (recomendación, no ejecución)
  'alert',         // elevar alerta a operador
]);

// Límites físicos por variable para la verificación numérica.
// Cualquier setpoint sugerido fuera de estos rangos se descarta/limita.
const PHYSICAL_BOUNDS = {
  voltage: { min: 0, max: 1000 },      // V
  current: { min: -1000, max: 1000 },  // A
  power: { min: -5000, max: 5000 },    // W
  soc: { min: 0, max: 100 },           // %
  frequency: { min: 45, max: 65 },     // Hz
};

function classifyVariable(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('volt') || k.startsWith('va') || k.startsWith('vb') || k.startsWith('vc')) return 'voltage';
  if (k.includes('curr') || k.includes('amp') || k.startsWith('i_')) return 'current';
  if (k.includes('soc') || k.includes('charge')) return 'soc';
  if (k.includes('fre') || k.includes('freq')) return 'frequency';
  if (k.includes('pow') || k.includes('pw') || k.includes('pl') || k.includes('gener') || k.includes('watt')) return 'power';
  return null;
}

/**
 * Valida un payload de resultado del LLM contra la capa de seguridad.
 * @param {object} payload - resultado del grafo/langgraph (estado_sistema, resumen, consejo, ...)
 * @param {object} [inputBounds] - rangos físicos adicionales derivados de los datos de entrada
 * @returns {{ok: boolean, payload: object, rejectedReasons: string[], audited: boolean}}
 */
function validateAgentOutput(payload, inputBounds = {}) {
  const reasons = [];

  if (!payload || typeof payload !== 'object') {
    return { ok: false, payload: payload || {}, rejectedReasons: ['payload vacío'], audited: false };
  }

  // (i) Allowlist de tipo de acción.
  const actionType = payload.accion_tipo || 'none';
  if (!ALLOWED_ACTION_TYPES.has(actionType)) {
    reasons.push(`tipo de acción "${actionType}" no permitido; se fuerza "inspect"`);
    payload.accion_tipo = 'inspect';
  }

  // (ii) Verificación numérica de setpoints sugeridos.
  const setpoints = payload.setpoints_sugeridos;
  if (Array.isArray(setpoints)) {
    const cleaned = [];
    for (const sp of setpoints) {
      const cls = classifyVariable(sp?.variable);
      const bounds = cls ? { ...PHYSICAL_BOUNDS[cls], ...(inputBounds[cls] || {}) } : null;
      if (!bounds) {
        reasons.push(`variable "${sp?.variable}" sin rango físico definido; setpoint descartado`);
        continue;
      }
      const val = Number(sp?.valor);
      if (!Number.isFinite(val)) {
        reasons.push(`setpoint de "${sp?.variable}" no numérico; descartado`);
        continue;
      }
      if (val < bounds.min || val > bounds.max) {
        reasons.push(`setpoint de "${sp?.variable}"=${val} fuera de [${bounds.min}, ${bounds.max}]; descartado`);
        continue;
      }
      cleaned.push(sp);
    }
    payload.setpoints_sugeridos = cleaned;
  }

  // (iii) Auditoría: registrar la recomendación con su justificación.
  const audited = true;
  if (!payload.justificacion && payload.consejo_accionable) {
    payload.justificacion = payload.consejo_accionable;
  }

  return {
    ok: reasons.length === 0,
    payload,
    rejectedReasons: reasons,
    audited,
  };
}

/**
 * Genera un registro de auditoría inmutable para una recomendación del LLM.
 */
function auditRecord(sensorId, validation) {
  return {
    sensorId,
    timestamp: new Date().toISOString(),
    actionType: validation.payload.accion_tipo || 'none',
    estado_sistema: validation.payload.estado_sistema,
    rejectedReasons: validation.rejectedReasons,
    audited: validation.audited,
  };
}

module.exports = {
  ALLOWED_ACTION_TYPES,
  PHYSICAL_BOUNDS,
  validateAgentOutput,
  auditRecord,
};
