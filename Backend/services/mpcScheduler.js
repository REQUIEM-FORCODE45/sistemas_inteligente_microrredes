const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const {
  enqueueOptimization,
  getLatestOptimizationResult,
  getRedis,
} = require('./optimizationService');

const PREDICTION_API = process.env.PREDICTION_API_URL || 'http://localhost:8000';
const LAST_TOPOLOGY_KEY = 'optimization:last_topology';

let mpcTimer = null;
let io = null;
let mpcRunning = false;
let mpcIntervalMinutes = 15;
let lastTopology = null;
let lastSensorMappings = null;

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
    const [solarRes, loadRes, powerRes] = await Promise.all([
      axios.get(`${PREDICTION_API}/predict/solar?hours=24`, { timeout: 120000 }),
      axios.get(`${PREDICTION_API}/predict/load?hours=24`, { timeout: 120000 }),
      axios.get(`${PREDICTION_API}/predict/power?hours=24`, { timeout: 120000 }).catch(() => null),
    ]);
    const power = powerRes?.data?.values || [];
    return {
      solar: solarRes.data.values || [],
      load: loadRes.data.values || [],
      power,
      pv_kw: power.map((v) => (v?.P50 != null ? v.P50 : 0)),
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

// Decide el perfil de carga segun la fuente elegida en cada bloque Carga:
//  - 'mat': perfil modular de Consumo.mat (perfilTotal) + sumar staticos.
//  - 'static' (o sin etiqueta, legado): su fixed_kw constante.
const LOAD_HOURS = 24;

function blendLoads(topologyLoads, profileTotal) {
  const loads = topologyLoads || [];

  const matBlocks = loads.filter((l) => l.load_source === 'mat');
  const staticKw = loads
    .filter((l) => l.load_source !== 'mat')
    .reduce((s, l) => s + (l.fixed_kw || 0), 0);

  if (matBlocks.length === 0) {
    // Sin bloques "mat": si hay consumo fijo configurado, perfil constante;
    // si no, legado: usar el perfil (sensor o Consumo.mat) tal cual.
    if (staticKw > 0) {
      return {
        loadTotal: Array.from({ length: LOAD_HOURS }, () => staticKw),
        staticLoadKw: staticKw,
      };
    }
    return { loadTotal: profileTotal || [], staticLoadKw: null };
  }

  // Al menos un bloque 'mat': el perfil se ESCALA a la capacidad total de los
  // bloques mat (suma de max_kw). Asi el perfil modular de Consumo.mat conserva
  // su forma (curva horaria real) pero su pico queda limitado a lo que el
  // bloque declara, evitando infactibilidades con grids/generadores chicos.
  const base = (profileTotal && profileTotal.length)
    ? profileTotal
    : Array.from({ length: LOAD_HOURS }, () => 0);
  const matCapacity = matBlocks.reduce((s, l) => s + (l.max_kw || 0), 0);
  const peak = Math.max(...base, 1);
  const scale = matCapacity > 0 ? matCapacity / peak : 1;
  if (scale !== 1) {
    console.log(`  [MPC] Escalando perfil Consumo.mat: pico ${peak.toFixed(1)} kW -> ${matCapacity} kW (capacidad bloques mat).`);
  }
  return {
    loadTotal: base.map((v) => v * scale + staticKw),
    staticLoadKw: staticKw > 0 ? staticKw : null,
  };
}

// ANTI-FANTASMA: conserva solo mappings cuyo nodeId exista en la topologia
// (sources/storage/loads/converters). Evita que sensores de nodos borrados
// se procesen o persistan en Redis.
function sanitizeSensorMappings(sensorMappings, topology) {
  if (!sensorMappings || typeof sensorMappings !== 'object') return sensorMappings;
  const topo = topology || {};
  const lists = [
    topo.sources || [], topo.storage || [], topo.loads || [], topo.converters || [],
  ];
  const validIds = new Set();
  for (const list of lists) for (const item of list) if (item && item.id) validIds.add(item.id);
  const out = {};
  for (const [nodeId, sensorId] of Object.entries(sensorMappings)) {
    if (validIds.has(nodeId)) out[nodeId] = sensorId;
  }
  return out;
}

async function executeMpcCycle(userTopology = null, userPredictions = null) {
  if (mpcRunning) {
    console.log('  [MPC] Ciclo anterior aun ejecutandose, saltando...');
    return null;
  }

  mpcRunning = true;
  console.log('  [MPC] Iniciando ciclo...');
  const cycleStartedAt = Date.now();   // Experimento B/C: duracion E2E del ciclo

  try {
    if (io) {
      io.emit('optimization_started', {
        timestamp: new Date().toISOString(),
        interval_minutes: mpcIntervalMinutes,
      });
    }

    // Ciclo AUTOMATICO (sin topologia propia): usa el ultimo diagrama enviado
    // desde el frontend ("Optimizar") o, si nunca hubo, el DEFAULT_TOPOLOGY.
    let topology = userTopology;
    if (!topology) {
      const saved = await loadLastTopology();
      topology = saved || DEFAULT_TOPOLOGY;
    }

    let predictions = userPredictions;

    // Bucle completo (Opcion A): si el ultimo trigger trajo sensor_mappings,
    // calibrar + predecir por sensor, igual que el boton "Optimizar".
    const safeMappings = sanitizeSensorMappings(lastSensorMappings, topology);
    if (!predictions && !userTopology && safeMappings && Object.keys(safeMappings).length) {
      try {
        const { runPredictionPipeline } = require('./predictionPipeline');
        const pipe = await runPredictionPipeline(safeMappings, topology);
        if (pipe) predictions = pipe.predictions;
      } catch (err) {
        console.warn('  [MPC] Pipeline automatico fallo, usa default:', err.message);
      }
    }

    if (!predictions) {
      predictions = await fetchPredictions();
    }
    if (!predictions) {
      if (io) io.emit('optimization_error', { message: 'Servicio de prediccion no disponible' });
      mpcRunning = false;
      return null;
    }

    const loadTotal = computeLoadTotal(predictions.load);

    // CARGA por bloque: cada bloque Carga elige su fuente en el diagrama:
    //  - 'mat'    -> perfil modular de Consumo.mat (PL1+PL2+PL3)
    //  - 'static' -> perfil constante (fixed_kw = consumption o maxLoad)
    const topologyLoads = topology.loads || [];
    console.log('  [MPC] Bloques carga:', topologyLoads.map((l) => ({
      id: l.id, src: l.load_source || 'static', fk: l.fixed_kw,
    })));
    let profileTotal = loadTotal;

    // Si el bloque dice 'mat' pero no llego perfil (pipeline sin sensor de
    // carga), trer el perfil modular real desde el servicio Python (.mat).
    const matBlocks = topologyLoads.filter((l) => l.load_source === 'mat');
    if (matBlocks.length > 0 && profileTotal.length === 0) {
      try {
        const r = await axios.get(`${PREDICTION_API}/predict/load?hours=24`, { timeout: 120000 });
        profileTotal = computeLoadTotal(r.data?.values);
        console.log('  [MPC] Perfil modular de Consumo.mat obtenido para carga "mat".');
      } catch (err) {
        console.warn('  [MPC] No se pudo obtener perfil Consumo.mat:', err.message);
      }
    }

    const { loadTotal: blendedLoad, staticLoadKw } = blendLoads(
      topologyLoads,
      profileTotal,
    );

    // SOC real de la bateria (si hay sensor bess enlazado): el initial_soc
    // del diagrama queda como fallback cuando no hay sensor.
    const storageWithSoc = (topology.storage || []).map((b) => {
      if (b.initial_soc != null && predictions.battery_soc == null) return b;
      return { ...b, initial_soc: predictions.battery_soc != null
        ? Math.min(0.95, Math.max(0.05, predictions.battery_soc / 100))
        : b.initial_soc };
    });

    // COHERENCIA: las predicciones de generacion solo aplican si el diagrama
    // tiene ese tipo de fuente. Sin bloques solares/eolicos -> el solver no
    // recibe PV/wind (aunque /predict/power lo entregue por defecto).
    const srcTypes = (topology.sources || []).map((s) => s.type);
    const hasSolar = srcTypes.some((t) => t === 'solar' || t === 'solar_panel_ac');
    const hasWind = srcTypes.some((t) => t === 'wind' || t === 'wind_turbine');

    const optimizationInput = {
      sources: topology.sources || [],
      storage: storageWithSoc,
      converters: topology.converters || [],
      loads: topology.loads || [],
      grid: topology.grid || {},
      predictions_solar: hasSolar ? predictions.solar : null,
      predictions_pv_kw: hasSolar ? (predictions.pv_kw || null) : null,     // kW calibrados de /predict/power
      predictions_pv_band: hasSolar ? (predictions.power || null) : null,   // banda P10/P50/P90 (Fase 5)
      predictions_wind_kw: hasWind ? (predictions.wind_kw || null) : null,
      predictions_wind_band: hasWind ? (predictions.wind_band || null) : null,
      predictions_load_total: blendedLoad,
      static_load_kw: staticLoadKw,
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
        const perf = require('./perfMetrics');
        perf.record('mpc_cycle_e2e_ms', Date.now() - cycleStartedAt);
        if (result && result.timing_s) {
          perf.record('mpc_solver_total_s', result.timing_s.t_total || 0);
        }
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
  io = socketIO;
  mpcIntervalMinutes = intervalMinutes > 0 ? intervalMinutes : 15;

  if (intervalMinutes <= 0) {
    console.log('  [MPC] Scheduler deshabilitado al arranque (MPC_INTERVAL_MINUTES=0 o ausente).');
    console.log('  [MPC] Activalo desde el frontend (switch "Ciclo automatico") o con MPC_INTERVAL_MINUTES>0.');
    return;
  }
  if (mpcTimer) return;

  const ms = intervalMinutes * 60 * 1000;
  console.log(`  [MPC] Scheduler iniciado cada ${intervalMinutes} min`);
  mpcTimer = setInterval(executeMpcCycle, ms);
  if (io) io.emit('mpc_status', getMpcStatus());
}

function stopMpcScheduler() {
  if (mpcTimer) {
    clearInterval(mpcTimer);
    mpcTimer = null;
    console.log('  [MPC] Scheduler detenido');
  }
  if (io) io.emit('mpc_status', getMpcStatus());
}

async function setMpcEnabled(enabled) {
  if (enabled) {
    if (mpcTimer) return getMpcStatus();
    const ms = mpcIntervalMinutes * 60 * 1000;
    mpcTimer = setInterval(executeMpcCycle, ms);
    console.log(`  [MPC] Scheduler arrancado manualmente cada ${mpcIntervalMinutes} min`);
  } else {
    stopMpcScheduler();
  }
  if (io) io.emit('mpc_status', getMpcStatus());
  return getMpcStatus();
}

async function setLastTopology(topology, sensorMappings) {
  lastTopology = topology || null;
  lastSensorMappings = sanitizeSensorMappings(sensorMappings, topology) || null;

  try {
    const redis = getRedis();
    await redis.set(LAST_TOPOLOGY_KEY, JSON.stringify({
      topology: lastTopology,
      sensor_mappings: lastSensorMappings,
      updated_at: new Date().toISOString(),
    }));
    await redis.expire(LAST_TOPOLOGY_KEY, 60 * 60 * 24 * 7);
  } catch (err) {
    console.warn('  [MPC] No se pudo persistir topologia en Redis:', err.message);
  }
}

async function loadLastTopology() {
  if (lastTopology) return lastTopology;
  try {
    const redis = getRedis();
    const raw = await redis.get(LAST_TOPOLOGY_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.topology) {
        lastTopology = data.topology;
        // sanitiza lo leido: limpia cualquier fantasma historico en Redis
        lastSensorMappings = sanitizeSensorMappings(data.sensor_mappings || null, lastTopology);
        console.log('  [MPC] Topologia recuperada de Redis (ultimo diagrama).');
        return lastTopology;
      }
    }
  } catch (err) {
    console.warn('  [MPC] No se pudo recuperar topologia de Redis:', err.message);
  }
  return null;
}

function getMpcStatus() {
  return {
    running: !!mpcTimer,
    enabled: !!mpcTimer,
    interval_minutes: mpcIntervalMinutes,
    cycle_active: mpcRunning,
    uses_current_topology: !!(lastTopology || lastSensorMappings),
  };
}

function resetMpcCycle() {
  mpcRunning = false;
}

module.exports = {
  startMpcScheduler,
  stopMpcScheduler,
  setMpcEnabled,
  setLastTopology,
  loadLastTopology,
  executeMpcCycle,
  getMpcStatus,
  resetMpcCycle,
  sanitizeSensorMappings,
};
