// securityManager.js
const AuthorizedDevice = require('../data/models/Device');

// Exportamos el Set directamente para que otros archivos lo consulten
const authorizedSensors = new Set();

/**
 * Sincroniza la RAM con MongoDB
 */
async function syncAuthorizedSensors() {
    try {
        // Buscamos solo los IDs de los dispositivos activos
        const devices = await AuthorizedDevice.find({ status: 'active' }).select('_id');
        
        authorizedSensors.clear();
        devices.forEach(d => authorizedSensors.add(d._id.toString()));
        
        console.log(`✅ Seguridad: ${authorizedSensors.size} sensores cargados en RAM.`);
    } catch (err) {
        console.error("Error al sincronizar la lista de seguridad:", err);
    }
}

module.exports = {
    authorizedSensors,
    syncAuthorizedSensors
};