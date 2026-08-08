// predictionPipeline.js — Bucle del diagrama (Opcion A).
// Dado el mapeo sensor->nodo y la topologia:
//   1) Asegura el modelo CALIBRADO de cada activo (si falta, POST /predict/calibrate)
//   2) PREDICE cada sensor con su modelo (GET /predict/sensor, 24h)
//   3) Ensambla las predicciones del solver (pv_kw, pv_band P10/P50/P90, load)
// Emite eventos de socket: calibration_started/done y prediction_ready.
const axios = require('axios');
const { emit } = require('./ioBus');

const PREDICTION_API = process.env.PREDICTION_API_URL || 'http://localhost:8000';
const SITE_ID = process.env.OPTIMIZATION_SITE_ID || 'pasto_narino';

// tipo de activo del solver -> tipo de calibracion
// Nota: 'solar_panel_ac' se calibra igual que un solar (irradiancia -> kW).
const TYPE_BY_CATEGORY = {
  solar: 'solar',
  solar_panel_ac: 'solar',
  load: 'load',
  battery: 'bess',
  wind: 'wind',
};

function activoTypeForNode(nodeId, topology) {
  const topo = topology || {};
  for (const list of [topo.sources, topo.storage, topo.loads]) {
    const item = (list || []).find((x) => x.id === nodeId);
    if (item) {
      const type = TYPE_BY_CATEGORY[item.type];
      if (!type) {
        console.warn(`  [pipe] sensor enlazado a bloque "${item.type}" (${nodeId}) no tiene modelo de calibracion; se ignora.`);
      }
      return type || null;
    }
  }
  return null;
}

async function ensureCalibrated(sensorId, type) {
  try {
    const st = await axios.get(`${PREDICTION_API}/predict/calibrated`, {
      params: { sensor_id: sensorId }, timeout: 15000,
    });
    if (st.data && st.data.exists) {
      // Ya calibrado: avisamos para que la UI no se quede sin estado final.
      emit('calibration_done', { sensorId, type, ok: true, skipped: true });
      return st.data;
    }
  } catch (e) {
    console.warn('  [pipe] servicio de prediccion no responde:', e.message);
    return null;
  }
  emit('calibration_started', { sensorId, type });
  try {
    const r = await axios.post(`${PREDICTION_API}/predict/calibrate`, {
      site_id: SITE_ID, sensor_id: sensorId, type,
    }, { timeout: 150000 });
    emit('calibration_done', { sensorId, type, ok: r.data?.status === 'ok' });
    return r.data;
  } catch (e) {
    console.warn(`  [pipe] calibracion de ${sensorId} fallo:`, e.message);
    emit('calibration_done', { sensorId, type, ok: false, error: e.message });
    return null;
  }
}

async function predictSensor(sensorId, type) {
  try {
    const r = await axios.get(`${PREDICTION_API}/predict/sensor`, {
      params: { sensor_id: sensorId, type, hours: 24 }, timeout: 60000,
    });
    return r.data;
  } catch (e) {
    console.warn(`  [pipe] prediccion de ${sensorId} fallo:`, e.message);
    return null;
  }
}

async function runPredictionPipeline(sensorMappings = {}, topology = {}) {
  const HOURS = 24;
  const results = [];
  for (const [nodeId, sensorId] of Object.entries(sensorMappings || {})) {
    const type = activoTypeForNode(nodeId, topology);
    if (!type) continue;
    // PASO 1: asegurar modelo calibrado (solo si falta; Recalibrar es explicito)
    await ensureCalibrated(sensorId, type);
    // PASO 2: predecir el sensor con su modelo ajustado
    const pred = await predictSensor(sensorId, type);
    if (pred && pred.values && pred.values.length) {
      results.push({ sensorId, type, values: pred.values, unit: pred.unit });
    } else {
      console.warn(`  [pipe] prediccion de ${sensorId} (${type}) vino VACIA o sin values -> sensor ignorado en esta corrida.`);
    }
  }
  if (results.length === 0) return null;

  emit('prediction_ready', { sensors: results.map((r) => r.sensorId) });

  // ensamblar entradas del solver (sumas por hora)
  const pv_kw = Array(HOURS).fill(0);
  const pv_band = Array.from({ length: HOURS }, () => ({ P10: 0, P50: 0, P90: 0 }));
  const loadArr = Array.from({ length: HOURS }, () => ({ PL1: 0, PL2: 0, PL3: 0 }));

  for (const r of results) {
    for (let h = 0; h < Math.min(HOURS, r.values.length); h++) {
      const v = r.values[h] || {};
      if (r.type === 'solar' || r.type === 'wind') {
        pv_kw[h] += v.P50 || 0;
        pv_band[h].P10 += v.P10 || 0;
        pv_band[h].P50 += v.P50 || 0;
        pv_band[h].P90 += v.P90 || 0;
      } else if (r.type === 'load') {
        loadArr[h].PL1 += v.P50 || 0;
      }
    }
  }

  const hasGen = results.some((r) => r.type === 'solar' || r.type === 'wind');
  const hasLoad = results.some((r) => r.type === 'load');

  // La fuente de carga (mat / estatica) la decide el bloque Carga del diagrama
  // via `load_source` en mpcScheduler (blendLoads). Aqui el pipeline solo
  // entrega el perfil real del sensor de carga; si no hay sensor, `load` es null
  // y el mpc (blendLoads) usa Consumo.mat (modular) o la estatica del bloque.
  const loadProvided = hasLoad;

  // Prediccion terminada: evento definitivo para que la UI marque OK.
  emit('prediction_done', { sensors: results.map((r) => r.sensorId) });

  return {
    predictions: {
      solar: hasGen ? [] : null,      // vacio: el solver usa pv_kw/band
      load: loadProvided ? loadArr : null,
      power: hasGen ? pv_band : null,
      pv_kw: hasGen ? pv_kw : null,
    },
    sensors: results.map((r) => ({ sensor_id: r.sensorId, type: r.type, unit: r.unit })),
    static_load_kw: null,
  };
}

module.exports = { runPredictionPipeline, activoTypeForNode };
