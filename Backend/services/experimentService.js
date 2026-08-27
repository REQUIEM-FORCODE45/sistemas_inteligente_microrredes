const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getRedis } = require('./optimizationService');

const EXP_DIR = path.join(__dirname, '..', '..', 'results', 'pasto_narino', 'experiments');
const RUNNING_KEY = 'optimization:expA_running';
const UPDATED_KEY = 'optimization:expA_updated_at';

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

async function getExperimentStatus() {
  try {
    const redis = getRedis();
    const running = await redis.get(RUNNING_KEY);
    const updated = await redis.get(UPDATED_KEY);
    return { running: running === '1', last_run: updated || null };
  } catch (e) {
    return { running: false, last_run: null };
  }
}

async function getExperimentSummary() {
  const metricsPath = path.join(EXP_DIR, 'expA_metrics.csv');
  const cumPath = path.join(EXP_DIR, 'expA_cumulative_cost.csv');
  const tablePath = path.join(EXP_DIR, 'expA_table.md');
  const metrics = parseCsv(metricsPath);
  let cumulative = null;
  if (fs.existsSync(cumPath)) {
    cumulative = parseCsv(cumPath);
  }
  let table = null;
  if (fs.existsSync(tablePath)) {
    table = fs.readFileSync(tablePath, 'utf8');
  }
  let lastRun = null;
  try { const redis = getRedis(); lastRun = await redis.get(UPDATED_KEY); } catch (e) {}
  return { metrics, cumulative, table, last_run: lastRun };
}

async function getExperimentTraces(strategy) {
  const alias = { 'mpc-pi': 'oracle', 'mpc_pi': 'oracle' };
  const norm = alias[strategy] || strategy;
  const allowed = ['smpc', 'dmpc', 'heur', 'oracle'];
  if (!allowed.includes(norm)) throw new Error('Estrategia no válida');
  const filePath = path.join(EXP_DIR, `expA_traces_${norm}.csv`);
  if (!fs.existsSync(filePath)) return { strategy, rows: [] };
  const rows = parseCsv(filePath);
  const compact = rows.map(r => ({
    timestamp: r.timestamp,
    pv_real_kw: parseFloat(r.pv_real_kw),
    load_real_kw: parseFloat(r.load_real_kw),
    diesel_kw: parseFloat(r.diesel_kw),
    grid_kw: parseFloat(r.grid_kw),
    charge_kw: parseFloat(r.charge_kw),
    discharge_kw: parseFloat(r.discharge_kw),
    curtailed_kw: parseFloat(r.curtailed_kw || 0),
    soc_kwh: parseFloat(r.soc_kwh),
    tariff: parseFloat(r.tariff),
    violation: parseInt(r.violation || 0, 10),
    cost_total: (parseFloat(r.cost_diesel||0)+parseFloat(r.cost_grid||0)+parseFloat(r.cost_battery||0)),
  }));
  return { strategy: norm, rows: compact };
}

async function runExperimentA(days = 14) {
  const status = await getExperimentStatus();
  if (status.running) throw new Error('Experimento ya en ejecución');
  const redis = getRedis();
  await redis.set(RUNNING_KEY, '1');
  await redis.expire(RUNNING_KEY, 7200);
  const env = { ...process.env };
  const cmd = `python3 -m optimization.experiments.experiment_a --days ${parseInt(days,10)}`;
  const cwd = path.join(__dirname, '..', '..');
  exec(cmd, { cwd, env, timeout: 600000 }, async (err, stdout, stderr) => {
    try {
      const r = getRedis();
      if (err) console.error('[experimentService] error:', err.message, stderr?.slice(0,2000));
      else console.log('[experimentService] completado');
      await r.set(UPDATED_KEY, new Date().toISOString());
      await r.expire(UPDATED_KEY, 86400*7);
    } catch (e) { console.error(e); }
    try { await getRedis().del(RUNNING_KEY); } catch(e){}
  });
  return { started: true, days: parseInt(days,10) };
}

module.exports = { getExperimentStatus, getExperimentSummary, getExperimentTraces, runExperimentA };
