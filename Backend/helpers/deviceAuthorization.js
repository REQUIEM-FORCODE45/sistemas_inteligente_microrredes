const mongoose = require('mongoose');
const AuthorizedDevice = require('../data/models/Device');

const toIdString = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value._id) return value._id.toString();
    return value.toString();
};

const isAdmin = (role = 'user') => role === 'admin';

const canAccessSensor = (sensor, userId, role = 'user') => {
    if (!sensor) return false;
    if (isAdmin(role)) return true;
    const normalizedUserId = toIdString(userId);
    const ownerId = toIdString(sensor.userId);
    if (normalizedUserId === ownerId) return true;
    const shared = sensor.sharedWith || [];
    return shared
        .map(toIdString)
        .includes(normalizedUserId);
};

const canManageSensor = (sensor, userId, role = 'user') => {
    if (!sensor) return false;
    if (isAdmin(role)) return true;
    return toIdString(sensor.userId) === toIdString(userId);
};

const buildAccessQuery = (userId, role) => {
    const base = { status: 'active' };
    if (isAdmin(role)) return base;
    const normalizedUserId = mongoose.Types.ObjectId.isValid(userId)
        ? mongoose.Types.ObjectId(userId)
        : userId;
    return {
        ...base,
        $or: [
            { userId: normalizedUserId },
            { sharedWith: normalizedUserId }
        ]
    };
};

module.exports = {
    canAccessSensor,
    canManageSensor,
    buildAccessQuery,
    isAdmin
};
