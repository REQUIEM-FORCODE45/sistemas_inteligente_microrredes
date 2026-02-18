const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initMQTT } = require('./services/mqttService');
const MongoDatabase = require('./data/database');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

require('dotenv').config();
const dbUrl = process.env.MONGO_URL;
const dbName = process.env.MONGO_DB_NAME;

MongoDatabase.connect(dbUrl, dbName);

// Inicializa el servicio MQTT y le pasa el objeto io
initMQTT(io);
app.use('/api/auth', require('./routes/auth'));

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

server.listen(process.env.PORT, () => {
    console.log(`🚀 Backend corriendo en http://localhost:${process.env.PORT}`);
});