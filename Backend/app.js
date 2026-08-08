const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initMQTT } = require('./services/mqttService');
const MongoDatabase = require('./data/database');
const { syncAuthorizedSensors } = require('./helpers/securityManager');
const { findDeviceById } = require('./helpers/deviceLookup');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AuthorizedDevice = require('./data/models/Device');
const { canAccessSensor, buildAccessQuery } = require('./helpers/deviceAuthorization');

require('dotenv').config();

const app = express();

const { setIO } = require('./services/ioBus');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-token']
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
          const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
          if (!origin || allowed.some((o) => origin.startsWith(o.trim())) || origin.startsWith('http://localhost:')) {
            callback(null, true);
          } else {
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
          }
        },
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-token'],
        credentials: true,
    }
});

setIO(io);

const dbUrl = process.env.MONGO_URL;
const dbName = process.env.MONGO_DB_NAME;

const startInfrastructure = async () => {
  await MongoDatabase.connect(dbUrl, dbName);
  syncAuthorizedSensors();

  initMQTT(io);

  const { initChangeStreams, shutdownChangeStreams } = require('./services/changeStreamService');
  const { registerWorker, shutdownQueue } = require('./services/queueService');

  await initChangeStreams();
  const { createAnalysisWorker } = require('./services/analysis/analysisWorker');
  registerWorker(createAnalysisWorker(io));

  const { startMpcScheduler, stopMpcScheduler } = require('./services/mpcScheduler');
  // Apagado por defecto: el ciclo automatico de 15 min solo corre si
  // MPC_INTERVAL_MINUTES > 0 (o se activa desde el switch del frontend).
  const mpcInterval = parseInt(process.env.MPC_INTERVAL_MINUTES || '', 10) || 0;
  startMpcScheduler(io, mpcInterval);

  process.on('SIGTERM', async () => {
    await shutdownChangeStreams();
    await shutdownQueue();
    stopMpcScheduler();
    const { shutdownOptimization } = require('./services/optimizationService');
    await shutdownOptimization();
  });
};

startInfrastructure();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/front', require('./routes/Front'));

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Ruta [${req.method}] ${req.originalUrl} no encontrada`,
        hint: "Verifica la documentación de la API o los endpoints disponibles"
    });
});

const resolveSocketPayload = (socket) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['x-token'];
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.SECRET_JWT_SEED);
    } catch (error) {
        return null;
    }
};

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);
    socket.userPayload = resolveSocketPayload(socket);

    socket.on('join_sensor_room', async (sensorId) => {
        try {
            const payload = socket.userPayload;
            if (!payload) {
                socket.emit('sensor_error', { message: 'Token inválido o no proporcionado' });
                return;
            }

            const sensor = await findDeviceById(sensorId);
            if (!sensor) {
                socket.emit('sensor_error', { message: 'Sensor no encontrado' });
                return;
            }

            if (!canAccessSensor(sensor, payload.uid, payload.role)) {
                socket.emit('sensor_error', { message: 'No autorizado para visualizar este sensor' });
                return;
            }

            socket.join(sensorId);            console.log(`Cliente ${socket.id} escuchando al sensor: ${sensorId}`);
        } catch (err) {
            console.error('Error validando acceso al sensor del socket', err);
            socket.emit('sensor_error', { message: 'Ocurrió un error durante la validación' });
        }
    });

    socket.on('leave_sensor_room', (sensorId) => {
        socket.leave(sensorId);
    });

    socket.on('request_agent_analysis', async (payload = {}) => {
        const requestId = payload.requestId || crypto.randomUUID();
        socket.emit('agent_analysis_started', { requestId });
        console.log(`Solicitado análisis de agente ${requestId} por socket ${socket.id}`);

        try {
            const authPayload = socket.userPayload;
            if (!authPayload) {
                socket.emit('agent_analysis_error', { requestId, message: 'Token inválido' });
                return;
            }

            const accessibleSensors = await AuthorizedDevice.find(
                buildAccessQuery(authPayload.uid, authPayload.role)
            ).select('name type').lean();

            if (!accessibleSensors.length) {
                socket.emit('agent_analysis_error', {
                    requestId,
                    message: 'No tienes sensores autorizados',
                });
                return;
            }

            const { runAgent } = require('./services/agent/langgraphService');
            const { fetchLatestSnapshotsForSensors } = require('./services/sensorDataService');
            const { getStrategyRegistry } = require('./services/analysis/strategyRegistry');

            for (const sensor of accessibleSensors) {
                const sensorId = sensor._id.toString();
                const snapshots = await fetchLatestSnapshotsForSensors([sensorId], {
                    limit: parseInt(process.env.ANALYSIS_WINDOW_SIZE, 10) || 30,
                });
                const history = snapshots[sensorId] || [];
                const currentPayload = history[0] || {};

                const registry = getStrategyRegistry();
                const analisis = registry.runAll(currentPayload, history, sensor.type || 'meter');

                const analysisResult = {
                    sensor_id: sensorId,
                    sensor_nombre: sensor.name || 'Sensor desconocido',
                    sensor_tipo: sensor.type || 'meter',
                    timestamp: new Date().toISOString(),
                    ...analisis,
                };

                socket.emit('agent_analisis', analysisResult);
                await runAgent(io, analysisResult);
            }

            socket.emit('agent_analysis_complete', { requestId, sensores_procesados: accessibleSensors.length });
        } catch (error) {
            console.error('Error ejecutando agente bajo demanda:', error);
            socket.emit('agent_analysis_error', { requestId, message: error.message });
        }
    });

    socket.on('request_optimization', async (payload = {}) => {
      try {
        if (!socket.userPayload) {
          socket.emit('optimization_error', { message: 'Token invalido' });
          return;
        }

        const { executeMpcCycle } = require('./services/mpcScheduler');
        socket.emit('optimization_started', { timestamp: new Date().toISOString() });
        executeMpcCycle();
      } catch (err) {
        socket.emit('optimization_error', { message: err.message });
      }
    });

    socket.on('request_dashboard_spec', async (payload = {}) => {
        const requestId = payload.requestId || crypto.randomUUID();
        socket.emit('dashboard_spec_started', { requestId });
        console.log(`Solicitado dashboard spec ${requestId} por socket ${socket.id}`);
        try {
            const { generateDashboardSpec } = require('./services/dashboardAgent');
            const authPayload = socket.userPayload;
            const accessibleSensors = authPayload
                ? await AuthorizedDevice.find(buildAccessQuery(authPayload.uid, authPayload.role)).select('name type status').lean()
                : [];
            const sensorsContext = accessibleSensors.length
                ? ['Sensores autorizados:']
                    .concat(accessibleSensors.map((device) => `- ${device._id}: ${device.name || 'Sensor sin nombre'} (${device.type || 'desconocido'})`))
                    .join('\n')
                : 'Sin sensores autorizados.';
            const extraContext = [payload.context, sensorsContext].filter(Boolean).join('\n\n');
            const spec = await generateDashboardSpec({
                userId: payload.userId || authPayload?.uid,
                userPrompt: payload.prompt,
                extraContext,
                availableSensors: accessibleSensors
            });
            const serialized = JSON.stringify(spec);
            const chunkSize = 600;
            for (let offset = 0; offset < serialized.length; offset += chunkSize) {
                const chunk = serialized.slice(offset, offset + chunkSize);
                socket.emit('dashboard_spec_chunk', { requestId, chunk });
            }
            socket.emit('dashboard_spec_complete', { requestId });
        } catch (error) {
            console.error('Error generando dashboard spec:', error);
            socket.emit('dashboard_spec_error', { requestId, message: error.message });
        }
    });
});

server.listen(process.env.PORT, () => {
    console.log(`Backend corriendo en http://localhost:${process.env.PORT}`);
});
