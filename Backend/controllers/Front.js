const AuthorizedDevice = require('../data/models/Device');
const { authorizedSensors } = require('../helpers/securityManager');
const mongoose = require('mongoose');

exports.registerNewSensor = async (req, res) => {
    try {
        // 1. Obtenemos el ID del usuario desde el middleware de autenticación.
        const userId = req.uid; 

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "No se pudo identificar al usuario autenticado."
            });
        }

        // 2. Fusionamos los datos del sensor con el ID del usuario
        const newDevice = new AuthorizedDevice({
            name: req.body.name,
            type: req.body.type,
            userId: userId 
        });

        await newDevice.save();
        
        console.log("Nuevo dispositivo guardado:", newDevice);

        // 3. Lo añadimos a la RAM inmediatamente para el servicio MQTT
        authorizedSensors.add(newDevice._id.toString());
        console.log(`✅ Sensor autorizado en vivo. Total en RAM: ${authorizedSensors.size}`);

        res.status(201).json({
            success: true,
            message: "Sensor registrado y autorizado exitosamente",
            id_sensor: newDevice._id
        });
    } catch (err) {
        console.error("❌ Error al registrar sensor:", err);
        res.status(500).json({ 
            success: false, 
            message: "Error interno al registrar el dispositivo",
            error: err.message 
        });
    }
};

exports.getSensorData = async (req, res) => {
    try {
        const { id_sensor, limit } = req.params;

        // 1. Validar que el límite sea un número mayor o igual a 1
        const limitNumber = parseInt(limit, 10);
        if (isNaN(limitNumber) || limitNumber < 1) {
            return res.status(400).json({ 
                success: false, 
                message: "El límite debe ser un número válido mayor o igual a 1." 
            });
        }

        // 2. Acceder directamente a la colección en la base de datos
        const collection = mongoose.connection.db.collection(id_sensor);

        // 3. Ejecutar la consulta nativa
        const sensorData = await collection
            .find({})
            .sort({ createAt: -1 }) 
            .limit(limitNumber)
            .toArray(); // En el driver nativo se usa toArray() en lugar de lean()

        // 4. Enviar respuesta
        res.status(200).json({
            success: true,
            count: sensorData.length,
            data: sensorData
        });

    } catch (err) {
        console.error(`❌ Error al consultar la colección ${req.params.id_sensor}:`, err);
        res.status(500).json({ 
            success: false, 
            message: "Error interno al consultar la base de datos",
            error: err.message 
        });
    }
};

exports.getAllAuthorizedDevices = async (req, res) => {
    try {
        const userId = req.uid;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Usuario no autenticado"
            });
        }

        const devices = await AuthorizedDevice.find({ userId })
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