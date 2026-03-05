const mongoose = require('mongoose');

const getColombiaDate = () => {
    const offset = -5;
    return new Date(new Date().getTime() + (offset * 60 * 60 * 1000));
};

const authorizedDeviceSchema = new mongoose.Schema({
    // El _id de Mongo será nuestro id_sensor
    name: String,
    type: { type: String, enum: ['solar', 'inverter', 'microgrid', 'battery', 'meter'] },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: () => getColombiaDate() }
});

module.exports = mongoose.model('AuthorizedDevice', authorizedDeviceSchema);