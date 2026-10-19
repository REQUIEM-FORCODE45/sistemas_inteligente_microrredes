const AuthorizedDevice = require('../data/models/Device');
const Usuario = require('../data/models/Usuario');
const mongoose = require('mongoose');
const { canAccessSensor, canManageSensor, buildAccessQuery } = require('../helpers/deviceAuthorization');
const { authorizedSensors } = require('../helpers/securityManager');
const { findDeviceById, updateDeviceSharedWith } = require('../helpers/deviceLookup');

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

        const allowedStatus = ['active', 'inactive', 'maintenance'];
        const status = allowedStatus.includes(req.body.status) ? req.body.status : 'active';

        const newDevice = new AuthorizedDevice({
            name: req.body.name,
            type: req.body.type,
            status,
            userId,
            sharedWith: []
        });

        await newDevice.save();

        // Solo los sensores 'active' ingresan a la lista blanca MQTT.
        if (status === 'active') {
            authorizedSensors.add(newDevice._id.toString());
        }

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

        const sensor = await findDeviceById(id_sensor);
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
        const includeInactive = req.query.includeInactive === 'true' || ownerView;
        const filter = ownerView ? {} : buildAccessQuery(userId, req.role, { includeInactive });
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
        const sensor = await findDeviceById(id);

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

        const sharedRaw = sensor.sharedWith || [];
        const ids = sharedRaw.map((u) => ((u && u._id) ? u._id : u));
        const alreadyShared = ids.some((u) => String(u) === String(targetUser._id));
        if (!alreadyShared) {
            ids.push(targetUser._id);
        }

        if (typeof sensor.save === 'function') {
            sensor.sharedWith = ids;
            await sensor.save();
        } else {
            await updateDeviceSharedWith(id, ids);
        }

        const users = await Usuario.find({ _id: { $in: ids } })
            .select('name email role').lean();
        res.json({
            success: true,
            message: 'Sensor compartido correctamente',
            sharedWith: users.map(sanitizeUser)
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

        const sensor = await findDeviceById(id);
        if (!sensor) {
            return res.status(404).json({ success: false, message: 'Sensor no encontrado' });
        }

        if (!canManageSensor(sensor, req.uid, req.role)) {
            return res.status(403).json({ success: false, message: 'Solo el dueño o administradores pueden modificar este sensor' });
        }

        const ids = (sensor.sharedWith || [])
            .map((u) => ((u && u._id) ? u._id : u))
            .filter((u) => String(u) !== String(targetId));

        if (typeof sensor.save === 'function') {
            sensor.sharedWith = ids;
            await sensor.save();
        } else {
            await updateDeviceSharedWith(id, ids);
        }

        const users = await Usuario.find({ _id: { $in: ids } })
            .select('name email role').lean();
        res.json({
            success: true,
            message: 'Acceso revocado correctamente',
            sharedWith: users.map(sanitizeUser)
        });
    } catch (err) {
        console.error('❌ Error al remover compartido:', err);
        res.status(500).json({ success: false, message: 'No se pudo actualizar el sensor', error: err.message });
    }
};

exports.updateSensorStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const allowed = ['active', 'inactive', 'maintenance'];
        if (!status || !allowed.includes(status)) {
            return res.status(400).json({ success: false, message: 'Estado inválido. Use active, inactive o maintenance.' });
        }

        const sensor = await findDeviceById(id);
        if (!sensor) {
            return res.status(404).json({ success: false, message: 'Sensor no encontrado' });
        }

        if (!canManageSensor(sensor, req.uid, req.role)) {
            return res.status(403).json({ success: false, message: 'Solo el dueño o administradores pueden modificar este sensor' });
        }

        if (typeof sensor.save === 'function') {
            sensor.status = status;
            await sensor.save();
        } else {
            const query = mongoose.isValidObjectId(id)
                ? { _id: new mongoose.Types.ObjectId(String(id)) }
                : { _id: String(id) };
            await AuthorizedDevice.collection.updateOne(query, { $set: { status } });
        }

        // Sincroniza la lista blanca MQTT en caliente: solo los 'active' ingieren.
        if (status === 'active') {
            authorizedSensors.add(String(id));
        } else {
            authorizedSensors.delete(String(id));
        }

        const updated = await findDeviceById(id);
        const raw = (updated && typeof updated.toObject === 'function')
            ? updated.toObject()
            : updated;
        res.json({ success: true, message: 'Estado actualizado correctamente', data: buildDevicePayload(raw || {}) });
    } catch (err) {
        console.error('❌ Error al actualizar estado del sensor:', err);
        res.status(500).json({ success: false, message: 'No se pudo actualizar el estado', error: err.message });
    }
};

exports.deleteSensor = async (req, res) => {
    try {
        const { id } = req.params;
        const sensor = await findDeviceById(id);
        if (!sensor) {
            return res.status(404).json({ success: false, message: 'Sensor no encontrado' });
        }

        if (!canManageSensor(sensor, req.uid, req.role)) {
            return res.status(403).json({ success: false, message: 'Solo el dueño o administradores pueden eliminar este sensor' });
        }

        const query = mongoose.isValidObjectId(id)
            ? { _id: new mongoose.Types.ObjectId(String(id)) }
            : { _id: String(id) };

        await AuthorizedDevice.collection.deleteOne(query);
        authorizedSensors.delete(String(id));

        // Borra la coleccion de lecturas del sensor (puede no existir).
        if (mongoose.connection.db) {
            await mongoose.connection.db.dropCollection(String(id)).catch(() => { });
        }

        res.json({ success: true, message: 'Sensor eliminado correctamente' });
    } catch (err) {
        console.error('❌ Error al eliminar sensor:', err);
        res.status(500).json({ success: false, message: 'No se pudo eliminar el sensor', error: err.message });
    }
};
