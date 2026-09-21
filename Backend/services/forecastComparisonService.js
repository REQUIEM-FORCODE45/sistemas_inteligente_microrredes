// Servicio de comparativa de forecast (PASO 2 / SPEC_PASO2.md Mitad B).
// Lee los artefactos offline de results/pasto_narino/forecast/ (<2 s).
// Sin archivos -> { available:false }, nunca 500. Molde: experimentService.js.
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const FORECAST_DIR = path.join(__dirname, '..', '..', 'results', 'pasto_narino', 'forecast');
const RUNNING_KEY = 'prediction:forecast_compare_running';
const UPDATED_KEY = 'prediction:forecast_compare_updated_at';

function parseCsv(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]; });
    return obj;
  });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { return null; }
}

function filesStatus() {
  const names = ['comparativa_detalle.csv', 'comparativa_resumen.csv',
    'comparativa_skill.json', 'comparativa_series.json'];
  const out = {};
  names.forEach(n => {
    const p = path.join(FORECAST_DIR, n);
    out[n] = fs.existsSync(p) ? fs.statSync(p).mtime.toISOString() : null;
  });
  return out;
}

function headCommit() {
  // HEAD actual para el banner "datos previos al fix" (3.4). Barato (~10ms),
  // con fallback silencioso si git no está disponible.
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD', {
      cwd: path.join(__dirname, '..', '..'), timeout: 5000,
    }).toString().trim() || null;
  } catch (e) { return null; }
}

async function getComparisonSummary() {
  const detalle = parseCsv(path.join(FORECAST_DIR, 'comparativa_detalle.csv'));
  const resumen = parseCsv(path.join(FORECAST_DIR, 'comparativa_resumen.csv'));
  const skill = readJson(path.join(FORECAST_DIR, 'comparativa_skill.json'));
  if (!detalle || !resumen) return { available: false, files: filesStatus() };
  const dataCommit = skill?.meta?.commit || null;
  const head = headCommit();
  // Chequeo semántico (VERIFICACION cambio_04): dataCommit !== head es
  // SIEMPRE true tras commitear (falso positivo). La señal válida es el
  // proxy registrado por el runner: stale solo si falta o difiere.
  const proxy = skill?.meta?.proxy || null;
  const stale = proxy !== 'ecmwf_ifs025';
  return { available: true, detalle, resumen, skill, files: filesStatus(),
           dataCommit, head, stale, proxy };
}

async function getComparisonSeries() {
  const series = readJson(path.join(FORECAST_DIR, 'comparativa_series.json'));
  if (!series) return { available: false, files: filesStatus() };
  return { available: true, ...series };
}

async function withTimeout(promise, ms, fallback) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), ms); });
  try {
    const res = await Promise.race([promise, timeout]);
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    return fallback;
  }
}

async function getComparisonStatus() {
  let running = false;
  try {
    const { getRedis } = require('./optimizationService');
    const redis = getRedis();
    running = (await withTimeout(redis.get(RUNNING_KEY), 1500, null)) === '1';
  } catch (e) { running = false; }
  return { available: !!parseCsv(path.join(FORECAST_DIR, 'comparativa_detalle.csv')), running, files: filesStatus() };
}

async function runComparison(months = 20) {
  const { getRedis } = require('./optimizationService');
  const redis = getRedis();
  if ((await redis.get(RUNNING_KEY)) === '1') throw new Error('Comparativa ya en ejecución');
  await redis.set(RUNNING_KEY, '1');
  await redis.expire(RUNNING_KEY, 12 * 3600);
  const env = { ...process.env };
  const m = Math.max(1, parseInt(months, 10) || 20);
  const cmd = `python3 -m optimization.prediction.compare_providers --months ${m} --horizons 1,6,12,24,48,72`;
  const cwd = path.join(__dirname, '..', '..');
  exec(cmd, { cwd, env, timeout: 12 * 3600 * 1000, maxBuffer: 64 * 1024 * 1024 }, async (err, stdout, stderr) => {
    try {
      const r = getRedis();
      if (err) console.error('[forecastComparison] error:', err.message, (stderr || '').slice(0, 2000));
      else console.log('[forecastComparison] completado');
      await r.set(UPDATED_KEY, new Date().toISOString());
      await r.expire(UPDATED_KEY, 86400 * 30);
    } catch (e) { console.error(e); }
    try { await getRedis().del(RUNNING_KEY); } catch (e) {}
  });
  return { started: true, months: m };
}

module.exports = { getComparisonSummary, getComparisonSeries, getComparisonStatus, runComparison };
