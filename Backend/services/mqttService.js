const mqtt = require('mqtt');
const { authorizedSensors } = require('../helpers/securityManager');
const mongoose = require('mongoose');

const modelCache = new Map();


const getColombiaDate = () => {
    const offset = -5;
    return new Date(new Date().getTime() + (offset * 60 * 60 * 1000));
};

const getModel = (sensorId) => {
    if (!modelCache.has(sensorId)) {
        // Esquema flexible (strict: false) para admitir cualquier dato de sensor
        const schema = new mongoose.Schema({}, { strict: false, versionKey: false });
        // El tercer parámetro 'sensorId' es el nombre físico de la colección en Mongo
        modelCache.set(sensorId, mongoose.model(sensorId, schema, sensorId));
    }
    return modelCache.get(sensorId);
};


function initMQTT(io) {
    const client = mqtt.connect('mqtt://35.193.246.15');

    client.on('connect', () => {
        console.log('✅ Conectado al Broker MQTT');
        
        client.subscribe('DataSensor/+', (err) => {
            if (!err) {
                console.log('Suscrito a todos los tópicos: DataSensor/<id>');
            }
        });
    });

    client.on('message', async (topic, message) => {
        const sensorId = topic.split('/')[1];

        // Verificación instantánea en RAM (O(1) en complejidad)
        if (!authorizedSensors.has(sensorId)) {
            console.warn(`🚫 Bloqueado: Sensor ${sensorId} no está en la lista blanca.`);
            return; 
        }

        try {
            const payload = JSON.parse(message.toString());
            // Cada sensor a su propia colección profesionalmente
            const Model = getModel(sensorId); 
            await Model.collection.insertOne({
                ...payload,
                createAt: getColombiaDate()
            });

            io.to(sensorId).emit('sensor_update', payload);
        } catch (e) {
            console.error("Error procesando mensaje:", e);
        }
    });
}

// Simulación de persistencia
async function saveToDatabase(data) {
    // Lógica de persistencia
}

module.exports = { initMQTT };