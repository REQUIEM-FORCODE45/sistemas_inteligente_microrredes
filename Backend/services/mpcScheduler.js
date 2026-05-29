const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const {
  enqueueOptimization,
  getLatestOptimizationResult,
} = require('./optimizationService');

const PREDICTION_API = process.env.PREDICTION_API_URL || 'http://localhost:8000';

let mpcTimer = null;
let io = null;
let mpcRunning = false;
let mpcIntervalMinutes = 15;

const DEFAULT_TOPOLOGY = {
  sources: [
    { id: 'solar_1', type: 'solar', max_kw: 50, min_kw: 0, efficiency: 0.85, cost_a: 0, cost_b: 0, cost_c: 0, fuel_cost: 0 },
    { id: 'diesel_1', type: 'diesel', max_kw: 300, min_kw: 50, efficiency: 1.0, cost_a: 0.001, cost_b: 0.5, cost_c: 0.5, fuel_cost: 100 },
  ],
  storage: [
    { id: 'battery_1', type: 'battery', max_kw: 100, min_kw: 0, capacity_kwh: 200, max_charge_kw: 50, max_discharge_kw: 50, soc_min: 0.2, soc_max: 0.95, initial_soc: 0.65, charge_efficiency: 0.95, discharge_efficiency: 0.95 },
  ],
  converters: [],
  loads: [
    { id: 'load_1', type: 'load', max_kw: 80, min_kw: 0 },
  ],
  grid: {
    max_import_kw: 400,
    max_export_kw: 300,
    min_import_kw: -300,
    cost_fixed: 40,
    cost_variable: 60,
  },
};

async function fetchPredictions() {
  try {
    const [solarRes, loadRes] = await Promise.all([
      axios.get(`${PREDICTION_API}/predict/solar?hours=24`, { timeout: 5000 }),
      axios.get(`${PREDICTION_API}/predict/load?hours=24`, { timeout: 5000 }),
    ]);
    return {
      solar: solarRes.data.values || [],
      load: loadRes.data.values || [],
    };
  } catch (err) {
    console.warn('  [MPC] No se pudo obtener predicciones del servicio Python:', err.message);
    return null;
  }
}

function computeLoadTotal(loadValues) {
  if (!loadValues || loadValues.length === 0) return [];
  return loadValues.map((entry) => {
    const pl1 = entry.PL1 || 0;
    const pl2 = entry.PL2 || 0;
    const pl3 = entry.PL3 || 0;
    return pl1 + pl2 + pl3;
  });
}

async function executeMpcCycle(userTopology = null, userPredictions = null) {
  if (mpcRunning) {
    console.log('  [MPC] Ciclo anterior aun ejecutandose, saltando...');
    return null;
  }

  mpcRunning = true;
  console.log('  [MPC] Iniciando ciclo...');

  try {
    if (io) {
      io.emit('optimization_started', {
        timestamp: new Date().toISOString(),
        interval_minutes: mpcIntervalMinutes,
      });
    }

    let predictions = userPredictions;
    if (!predictions) {
      predictions = await fetchPredictions();
    }
    if (!predictions) {
      if (io) io.emit('optimization_error', { message: 'Servicio de prediccion no disponible' });
      mpcRunning = false;
      return null;
    }

    const loadTotal = computeLoadTotal(predictions.load);

    const topology = userTopology || DEFAULT_TOPOLOGY;

    const optimizationInput = {
      sources: topology.sources || [],
      storage: topology.storage || [],
      converters: topology.converters || [],
      loads: topology.loads || [],
      grid: topology.grid || {},
      predictions_solar: predictions.solar,
      predictions_load_total: loadTotal,
      horizon: 24,
      time_step_minutes: 60,
      scenarios: null,
      solver: 'gurobi',
    };

    const jobId = await enqueueOptimization(optimizationInput);

    if (!jobId) {
      if (io) io.emit('optimization_error', { message: 'No se pudo encolar optimizacion (Redis no disponible)' });
      mpcRunning = false;
      return null;
    }

    if (io) {
      io.emit('optimization_queued', { jobId, timestamp: new Date().toISOString() });
    }

    const solverScript = path.join(__dirname, '..', '..', 'optimization', 'solver', 'run_once.py');
    exec(`python3 ${solverScript}`, { cwd: path.resolve(__dirname, '..', '..') }, (err, stdout, stderr) => {
      if (err) {
        console.warn('  [MPC] Solver Python no disponible (ejecuta python -m solver.main):', err.message);
      }
      if (stdout) console.log('  [MPC] Solver:', stdout.trim());
      if (stderr) console.warn('  [MPC] Solver stderr:', stderr.trim());
    });

    const { pollProgress } = require('./optimizationService');
    pollProgress(
      jobId,
      (result) => {
        if (io) {
          io.emit('optimization_result', result || { jobId, status: 'error', error: 'No se obtuvo resultado' });
          io.emit('optimization_complete', { jobId, status: result?.status || 'unknown' });
        }
        mpcRunning = false;
      },
      (status) => {
        if (io) io.emit('optimization_progress', { jobId, status });
      }
    );

    console.log(`  [MPC] Job ${jobId} en progreso...`);
    return jobId;
  } catch (err) {
    console.error('  [MPC] Error en ciclo:', err.message);
    if (io) io.emit('optimization_error', { message: err.message });
    mpcRunning = false;
    return null;
  }
}

function startMpcScheduler(socketIO, intervalMinutes = 15) {
  if (mpcTimer) return;

  io = socketIO;
  mpcIntervalMinutes = intervalMinutes;
  const ms = intervalMinutes * 60 * 1000;

  console.log(`  [MPC] Scheduler iniciado cada ${intervalMinutes} min`);

  mpcTimer = setInterval(executeMpcCycle, ms);
}

function stopMpcScheduler() {
  if (mpcTimer) {
    clearInterval(mpcTimer);
    mpcTimer = null;
    console.log('  [MPC] Scheduler detenido');
  }
}

function getMpcStatus() {
  return {
    running: !!mpcTimer,
    interval_minutes: mpcIntervalMinutes,
    cycle_active: mpcRunning,
  };
}

function resetMpcCycle() {
  mpcRunning = false;
}

module.exports = {
  startMpcScheduler,
  stopMpcScheduler,
  executeMpcCycle,
  getMpcStatus,
  resetMpcCycle,
};
