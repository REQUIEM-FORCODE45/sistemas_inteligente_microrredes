const AuthorizedDevice = require('../data/models/Device');
const { authorizedSensors } = require('../helpers/securityManager');

exports.registerNewSensor = async (req, res) => {
    try {
        const newDevice = new AuthorizedDevice(req.body);

        await newDevice.save();
        console.log(newDevice);
        console.log(req.body);
        // IMPORTANTE: Lo añadimos a la RAM inmediatamente
        // Así el servicio MQTT lo reconocerá sin tener que reiniciar nada
        authorizedSensors.add(newDevice._id.toString());
        console.log(`✅ Sensor ${Array.from(authorizedSensors).join(', ')} registrado y autorizado en vivo.`);

        res.status(201).json({
            success: true,
            message: "Sensor registrado y autorizado en vivo",
            id_sensor: newDevice._id
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getAllAuthorizedDevices = async (req, res) => {
    try {
        // Consultamos todos los dispositivos registrados
        // Ordenamos por fecha de creación (los más recientes primero)
        const devices = await AuthorizedDevice.find()
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            count: devices.length,
            data: devices
        });
    } catch (err) {
        console.error('❌ Error al obtener dispositivos autorizados:', err);
        res.status(500).json({ 
            success: false, 
            message: "Error al recuperar la lista de dispositivos",
            error: err.message 
        });
    }
};