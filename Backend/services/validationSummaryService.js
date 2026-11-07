// Resumen de validacion por escenarios (V1/V2 de fase_1_mos).
// Solo lectura de artefactos versionados; no ejecuta nada, no toca redis.
// Si falta un archivo -> available:false (nunca 500), mismo molde que
// forecastComparisonService.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'integracion_plataforma',
  'validacion', 'fase_1_mos');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return null; }
}

async function getValidationSummary() {
  const v1 = readJson(path.join(DIR, 'v1_bandc', 'resultado.json'));
  const v2 = readJson(path.join(DIR, 'v2_red', 'resultado.json'));
  if (!v1 || !v2) {
    return { available: false, dir: DIR,
             missing: [!v1 && 'v1_bandc/resultado.json',
                       , !v2 && 'v2_red/resultado.json'].filter(Boolean) };
  }
  return { available: true, v1, v2 };
}

module.exports = { getValidationSummary };
