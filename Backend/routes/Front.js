const express = require('express');
const { registerNewSensor, getAllAuthorizedDevices, getSensorData, shareSensorWithUser, unshareSensorForUser } = require('../controllers/Front');
const { validateJwt } = require('../middleware/validateJwt');
const router = express.Router();


router.post('/register_sensor', validateJwt, registerNewSensor);

router.get('/sensors', validateJwt, getAllAuthorizedDevices);

router.get('/sensors_data/:id_sensor/:limit', validateJwt, getSensorData);
router.post('/sensors/:id/share', validateJwt, shareSensorWithUser);
router.post('/sensors/:id/unshare', validateJwt, unshareSensorForUser);

router.post('/optimization/trigger', validateJwt, async (req, res) => {
  try {
    const { executeMpcCycle, getMpcStatus, resetMpcCycle } = require('../services/mpcScheduler');
    const { cleanupPoll } = require('../services/optimizationService');
    const status = getMpcStatus();
    if (status.cycle_active) {
      console.log('  [optimization] Forzando reinicio de ciclo MPC anterior');
      cleanupPoll();
      resetMpcCycle();
    }
    const { topology, predictions, sensor_mappings } = req.body || {};

    // BUCLE (Opcion A): si el diagrama tiene sensores mapeados a nodos,
    // calibrar (si falta) + predecir cada sensor y usar esas predicciones
    // en lugar de las por defecto.
    let userPredictions = predictions || null;
    if (sensor_mappings && Object.keys(sensor_mappings).length) {
      try {
        const { runPredictionPipeline } = require('../services/predictionPipeline');
        const pipe = await runPredictionPipeline(sensor_mappings, topology || {});
        if (pipe) userPredictions = pipe.predictions;
      } catch (err) {
        console.warn('  [optimization] Pipeline de prediccion fallo, usa default:', err.message);
      }
    }

    const jobId = await executeMpcCycle(topology || null, userPredictions);

    // Memoriza este diagrama para que el ciclo automatico (si esta activo)
    // use el diagrama actual; persiste en Redis para sobrevivir restarts.
    const { setLastTopology } = require('../services/mpcScheduler');
    await setLastTopology(topology || null, sensor_mappings || null);

    if (!jobId) {
      return res.json({ success: false, message: 'No se pudo iniciar optimizacion' });
    }
    res.json({ success: true, message: 'Ciclo MPC disparado', jobId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Bucle: prediccion de sensores (proxy a Python, auth) -----------------
router.get('/prediction/sensor', validateJwt, async (req, res) => {
  try {
    const axios = require('axios');
    const api = process.env.PREDICTION_API_URL || 'http://localhost:8000';
    const r = await axios.get(`${api}/predict/sensor`, {
      params: {
        sensor_id: req.query.sensor_id,
        type: req.query.type || 'solar',
        hours: req.query.hours || 24,
        site_id: process.env.OPTIMIZATION_SITE_ID || 'pasto_narino',
      },
      // 180s: la primera llamada puede auto-calibrar el modelo del sensor
      timeout: 180000,
    });
    res.json({ success: true, ...r.data });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/prediction/calibrated', validateJwt, async (req, res) => {
  try {
    const axios = require('axios');
    const api = process.env.PREDICTION_API_URL || 'http://localhost:8000';
    const r = await axios.get(`${api}/predict/calibrated`, {
      params: { sensor_id: req.query.sensor_id }, timeout: 15000,
    });
    res.json({ success: true, ...r.data });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message });
  }
});

router.get('/prediction/weather', validateJwt, async (req, res) => {
  try {
    const axios = require('axios');
    const api = process.env.PREDICTION_API_URL || 'http://localhost:8000';
    const r = await axios.get(`${api}/predict/weather`, {
      params: {
        hours: req.query.hours || 48,
        provider: req.query.provider || undefined,
        site_id: process.env.OPTIMIZATION_SITE_ID || 'pasto_narino',
      },
      timeout: 60000,
    });
    res.json({ success: true, ...r.data });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message });
  }
});

// --- Resumen de calibracion (artefactos results/pasto_narino) -----------
router.get('/optimization/calibration', validateJwt, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', '..', 'results', 'pasto_narino');
    const calibratedDir = path.join(dir, 'calibrated');
    const models = [];
    if (fs.existsSync(calibratedDir)) {
      for (const f of fs.readdirSync(calibratedDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const j = JSON.parse(fs.readFileSync(path.join(calibratedDir, f), 'utf8'));
          models.push(j);
        } catch (e) { /* ignora JSON corrupto */ }
      }
    }
    const experiments = {};
    for (const seed of ['7', '42']) {
      const seedDir = path.join(dir, 'calibration', `seed${seed}`);
      if (!fs.existsSync(seedDir)) continue;
      const rmseCsv = path.join(seedDir, 'rmse.csv');
      const covCsv = path.join(seedDir, 'coverage.csv');
      experiments[`seed${seed}`] = {
        rmse: fs.existsSync(rmseCsv) ? fs.readFileSync(rmseCsv, 'utf8') : null,
        coverage: fs.existsSync(covCsv) ? fs.readFileSync(covCsv, 'utf8') : null,
      };
    }
    res.json({ success: true, models, experiments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/optimization/status/:jobId', validateJwt, async (req, res) => {
  try {
    const { getOptimizationStatus, getOptimizationResult } = require('../services/optimizationService');
    const status = await getOptimizationStatus(req.params.jobId);
    const result = await getOptimizationResult(req.params.jobId);
    res.json({ success: true, jobId: req.params.jobId, status, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/optimization/results/latest', validateJwt, async (req, res) => {
  try {
    const { getLatestOptimizationResult } = require('../services/optimizationService');
    const result = await getLatestOptimizationResult();
    if (!result) {
      return res.json({ success: true, data: null, message: 'No hay resultados de optimizacion' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/optimization/mpc-status', validateJwt, async (req, res) => {
  try {
    const { getMpcStatus } = require('../services/mpcScheduler');
    const { getLatestOptimizationResult } = require('../services/optimizationService');
    const status = getMpcStatus();
    const latest = await getLatestOptimizationResult();
    res.json({ success: true, mpc: status, latest_result: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Control del ciclo automatico (15 min) --------------------------------
router.post('/optimization/mpc/start', validateJwt, async (req, res) => {
  try {
    const { setMpcEnabled } = require('../services/mpcScheduler');
    const status = await setMpcEnabled(true);
    res.json({ success: true, message: 'Ciclo automatico activado', mpc: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/optimization/mpc/stop', validateJwt, async (req, res) => {
  try {
    const { setMpcEnabled } = require('../services/mpcScheduler');
    const status = await setMpcEnabled(false);
    res.json({ success: true, message: 'Ciclo automatico desactivado', mpc: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
