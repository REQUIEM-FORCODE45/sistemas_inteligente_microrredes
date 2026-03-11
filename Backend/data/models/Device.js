const mongoose = require('mongoose');

const getColombiaDate = () => {
    const offset = -5;
    return new Date(new Date().getTime() + (offset * 60 * 60 * 1000));
};

const authorizedDeviceSchema = new mongoose.Schema({
    // NUEVO: Referencia al usuario dueño del dispositivo
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', // Nombre de tu modelo de usuarios (cámbialo si se llama diferente)
        required: true // Evita que existan sensores "huérfanos" sin dueño
    },
    // El _id de Mongo será nuestro id_sensor
    name: String,
    type: { type: String, enum: ['solar', 'inverter', 'microgrid', 'battery', 'meter'] },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: () => getColombiaDate() }
});

module.exports = mongoose.model('AuthorizedDevice', authorizedDeviceSchema);