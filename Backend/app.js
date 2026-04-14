const express = require('express');
const http = require('http');
const cors = require('cors'); // 1. Importamos cors
const { Server } = require('socket.io');
const { initMQTT } = require('./services/mqttService');
const MongoDatabase = require('./data/database');
const { syncAuthorizedSensors } = require('./helpers/securityManager');

require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Configuración de CORS para Express (HTTP)
// Esto debe ir ANTES de las rutas para que funcione
const corsOptions = {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-token']
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
    cors: corsOptions
});

const dbUrl = process.env.MONGO_URL;
const dbName = process.env.MONGO_DB_NAME;
MongoDatabase.connect(dbUrl, dbName);
syncAuthorizedSensors();

// Inicializa el servicio MQTT
initMQTT(io);

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/front', require('./routes/Front'));

// Manejo de 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Ruta [${req.method}] ${req.originalUrl} no encontrada`,
        hint: "Verifica la documentación de la API o los endpoints disponibles"
    });
});

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