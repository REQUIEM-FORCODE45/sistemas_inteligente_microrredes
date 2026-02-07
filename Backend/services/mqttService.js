const mqtt = require('mqtt');

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

    client.on('message', (topic, message) => {
        const parts = topic.split('/');
        const sensorId = parts[1];
        console.log(`Mensaje recibido del sensor ${sensorId}:`, message.toString());

        try {
            const payload = JSON.parse(message.toString());
            const dataWithTimestamp = {
                ...payload,
                sensorId: sensorId,
                receivedAt: new Date().toISOString()
            };

            saveToDatabase(dataWithTimestamp);
            io.to(sensorId).emit('sensor_update', dataWithTimestamp);

        } catch (e) {
            console.error("Error procesando JSON de MQTT", e);
        }
    });
}

// Simulación de persistencia
async function saveToDatabase(data) {
    // Lógica de persistencia
}

module.exports = { initMQTT };