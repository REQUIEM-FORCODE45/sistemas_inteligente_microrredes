// securityManager.js
const AuthorizedDevice = require('../data/models/Device');

// Exportamos el Set directamente para que otros archivos lo consulten
const authorizedSensors = new Set();

/**
 * Sincroniza la RAM con MongoDB
 */
async function syncAuthorizedSensors() {
    try {
        // Driver NATIVO (no mongoose): mongoose castea _id a ObjectId y
        // descarta los id_sensor string ('pasto_*') devolviendo undefined.
        const docs = await AuthorizedDevice.collection
            .find({ status: 'active' }, { projection: { _id: 1 } })
            .toArray();

        authorizedSensors.clear();
        docs.forEach(d => { if (d._id != null) authorizedSensors.add(String(d._id)); });

        console.log(`✅ Seguridad: ${authorizedSensors.size} sensores cargados en RAM.`);
    } catch (err) {
        console.error("Error al sincronizar la lista de seguridad:", err);
    }
}

module.exports = {
    authorizedSensors,
    syncAuthorizedSensors
};