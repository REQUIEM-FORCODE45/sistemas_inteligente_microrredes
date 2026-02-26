const express = require('express');
const { registerNewSensor, getAllAuthorizedDevices } = require('../controllers/Front');
const router = express.Router();


router.post('/register_sensor', registerNewSensor);

router.get('/sensors', getAllAuthorizedDevices);

module.exports = router;