// forecastAdjustNode.js — Ajuste del forecast de potencia con alertas oficiales
// (Fase 7, HO#3 sec 9.7). Standalone: NO se engancha al grafo del dashboard para
// no alterar el flujo de analisis; se invoca desde donde se tenga el forecast.
//
//   const { adjustForecastWithAlert } = require('./forecastAdjustNode');
//   const ajustado = await adjustForecastWithAlert(band, {
//     source: 'IDEAM', severity: 'fuerte', reason: 'tormenta esperada'
//   });
const { createLLM } = require('../llmFactory');

const ALERT_WHITELIST = ['IDEAM', 'SINAC', 'OFICIAL', 'INVEMAR'];

function checkAlertSource(source) {
  return ALERT_WHITELIST.includes(String(source || '').toUpperCase());
}

const RULE_FACTORS = { info: 0.95, moderada: 0.85, fuerte: 0.70, extrema: 0.55 };

function ruleBasedMultipliers(severity, n) {
  const f = RULE_FACTORS[severity] || 0.9;
  return Array(n).fill(f);
}

async function adjustForecastWithAlert(band, alert) {
  const { source, severity = 'moderada', reason = 'alerta oficial' } = alert || {};
  if (!checkAlertSource(source)) {
    throw new Error(`Fuente de alerta no confiable: ${source}`);
  }

  const n = band.length;
  const llm = createLLM({ temperature: 0 });
  if (llm) {
    try {
      const prompt =
        `Pronostico de potencia solar (${n} h). Alerta oficial ${source} ` +
        `(severidad ${severity}): ${reason}. Devuelve SOLO JSON: ` +
        '{"severity":"info|moderada|fuerte|extrema","reason":"...",' +
        `"multipliers":[${n} numeros entre 0.5 y 2.0]}`;
      const res = await llm.invoke(prompt);
      const parsed = JSON.parse(res.content);
      if (Array.isArray(parsed.multipliers) && parsed.multipliers.length === n) {
        const mult = parsed.multipliers;
        return band.map((row, i) => ({
          ...row,
          P10: Math.max(0, row.P10 * mult[i]),
          P50: Math.max(0, row.P50 * mult[i]),
          P90: Math.max(0, row.P90 * mult[i]),
        }));
      }
    } catch (err) {
      console.warn('[forecastAdjust] LLM fallo, fallback rule-based:', err.message);
    }
  }

  const mult = ruleBasedMultipliers(severity, n);
  return band.map((row, i) => ({
    ...row,
    P10: Math.max(0, row.P10 * mult[i]),
    P50: Math.max(0, row.P50 * mult[i]),
    P90: Math.max(0, row.P90 * mult[i]),
  }));
}

module.exports = { adjustForecastWithAlert, checkAlertSource, ALERT_WHITELIST };
