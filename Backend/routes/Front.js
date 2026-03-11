const express = require('express');
const { registerNewSensor, getAllAuthorizedDevices, getSensorData } = require('../controllers/Front');
const { validateJwt } = require('../middleware/validateJwt');
const router = express.Router();


router.post('/register_sensor', validateJwt, registerNewSensor);

router.get('/sensors', getAllAuthorizedDevices);

router.get('/sensors_data/:id_sensor/:limit', getSensorData);

module.exports = router;