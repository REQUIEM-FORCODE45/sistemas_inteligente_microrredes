const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initMQTT } = require('./services/mqttService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Inicializa el servicio MQTT y le pasa el objeto io
initMQTT(io);

// Gestión de salas en WebSockets
io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    socket.on('join_sensor_room', (sensorId) => {
        socket.join(sensorId);
        console.log(`Cliente ${socket.id} escuchando al sensor: ${sensorId}`);
    });

    socket.on('leave_sensor_room', (sensorId) => {
        socket.leave(sensorId);
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});