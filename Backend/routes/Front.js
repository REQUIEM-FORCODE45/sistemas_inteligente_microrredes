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
    const { topology, predictions } = req.body || {};
    const jobId = await executeMpcCycle(topology || null, predictions || null);
    if (!jobId) {
      return res.json({ success: false, message: 'No se pudo iniciar optimizacion' });
    }
    res.json({ success: true, message: 'Ciclo MPC disparado', jobId });
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

module.exports = router;
