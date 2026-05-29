const AuthorizedDevice = require('../data/models/Device');
const Usuario = require('../data/models/Usuario');
const mongoose = require('mongoose');
const { canAccessSensor, canManageSensor, buildAccessQuery } = require('../helpers/deviceAuthorization');
const { authorizedSensors } = require('../helpers/securityManager');

const sanitizeUser = (user) => {
    if (!user) return null;
    return {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
    };
};

const buildDevicePayload = (device) => {
    const sharedUsers = (device.sharedWith || []).map(sanitizeUser);
    const owner = sanitizeUser(device.userId);
    return {
        ...device,
        owner,
        userId: owner ? owner._id : device.userId,
        sharedWith: sharedUsers
    };
};

exports.registerNewSensor = async (req, res) => {
    try {
        const userId = req.uid;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "No se pudo identificar al usuario autenticado."
            });
        }

        const newDevice = new AuthorizedDevice({
            name: req.body.name,
            type: req.body.type,
            userId,
            sharedWith: []
        });

        await newDevice.save();

        authorizedSensors.add(newDevice._id.toString());

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
        const { uid, role } = req;

        const limitNumber = parseInt(limit, 10);
        if (isNaN(limitNumber) || limitNumber < 1) {
            return res.status(400).json({
                success: false,
                message: "El límite debe ser un número válido mayor o igual a 1."
            });
        }

        const sensor = await AuthorizedDevice.findById(id_sensor).select('userId sharedWith status');
        if (!sensor) {
            return res.status(404).json({ success: false, message: 'Sensor no encontrado' });
        }

        if (!canAccessSensor(sensor, uid, role)) {
            return res.status(403).json({ success: false, message: 'Acceso denegado al sensor solicitado' });
        }

        const collection = mongoose.connection.db.collection(id_sensor);
        const sensorData = await collection
            .find({})
            .sort({ createAt: -1 })
            .limit(limitNumber)
            .toArray();

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

        const ownerView = req.query.ownerView === 'true';
        if (ownerView && req.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Solo administradores pueden ver todos los sensores' });
        }
        const filter = ownerView ? {} : buildAccessQuery(userId, req.role);
        const devices = await AuthorizedDevice.find(filter)
            .populate('userId', 'name email role')
            .populate('sharedWith', 'name email role')
            .sort({ createdAt: -1 })
            .lean();

        const payload = devices.map(buildDevicePayload);

        res.status(200).json({
            success: true,
            count: payload.length,
            data: payload
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

const resolveTargetUser = async ({ email, userId }) => {
    if (email) {
        return await Usuario.findOne({ email: email.toLowerCase().trim() });
    }
    if (userId) {
        return await Usuario.findById(userId);
    }
    return null;
};

exports.shareSensorWithUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, userId: targetId } = req.body;
        const sensor = await AuthorizedDevice.findById(id).populate('sharedWith', 'name email role').populate('userId', 'name email role');

        if (!sensor) {
            return res.status(404).json({ success: false, message: 'Sensor no encontrado' });
        }

        if (!canManageSensor(sensor, req.uid, req.role)) {
            return res.status(403).json({ success: false, message: 'Solo el dueño o administradores pueden compartir este sensor' });
        }

        if (!email && !targetId) {
            return res.status(400).json({ success: false, message: 'Se requiere correo o ID del usuario para compartir' });
        }

        const targetUser = await resolveTargetUser({ email, userId: targetId });
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Usuario destino no encontrado' });
        }

        if (String(targetUser._id) === String(sensor.userId?._id || sensor.userId)) {
            return res.status(400).json({ success: false, message: 'El dueño ya tiene acceso al sensor' });
        }

        const alreadyShared = sensor.sharedWith.some(u => String(u._id) === String(targetUser._id));
        if (!alreadyShared) {
            sensor.sharedWith.push(targetUser._id);
        }

        await sensor.save();
        await sensor.populate('sharedWith', 'name email role');

        res.json({
            success: true,
            message: 'Sensor compartido correctamente',
            sharedWith: sensor.sharedWith.map(sanitizeUser)
        });
    } catch (err) {
        console.error('❌ Error al compartir sensor:', err);
        res.status(500).json({ success: false, message: 'No se pudo compartir el sensor', error: err.message });
    }
};

exports.unshareSensorForUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId: targetId } = req.body;
        if (!targetId) {
            return res.status(400).json({ success: false, message: 'Se requiere el ID del usuario a remover' });
        }

        const sensor = await AuthorizedDevice.findById(id).populate('sharedWith', 'name email role').populate('userId', 'name email role');
        if (!sensor) {
            return res.status(404).json({ success: false, message: 'Sensor no encontrado' });
        }

        if (!canManageSensor(sensor, req.uid, req.role)) {
            return res.status(403).json({ success: false, message: 'Solo el dueño o administradores pueden modificar este sensor' });
        }

        sensor.sharedWith = sensor.sharedWith.filter(user => String(user._id) !== String(targetId));
        await sensor.save();
        await sensor.populate('sharedWith', 'name email role');

        res.json({
            success: true,
            message: 'Acceso revocado correctamente',
            sharedWith: sensor.sharedWith.map(sanitizeUser)
        });
    } catch (err) {
        console.error('❌ Error al remover compartido:', err);
        res.status(500).json({ success: false, message: 'No se pudo actualizar el sensor', error: err.message });
    }
};
