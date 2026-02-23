const express = require('express');
const { registerNewSensor } = require('../controllers/Front');
const router = express.Router();


router.post('/register_sensor', registerNewSensor);

module.exports = router;