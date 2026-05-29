const mongoose = require('mongoose');
const AuthorizedDevice = require('../data/models/Device');
const { enqueueSensorData } = require('./queueService');

let streams = [];
let watchedSensorIds = new Set();
let isListening = false;
let retryTimer = null;
let firstSync = true;
let pendingLogCount = 0;
const RETRY_INTERVAL = 30000;
const PENDING_LOG_INTERVAL = 5;

const loadActiveSensorIds = async () => {
  const devices = await AuthorizedDevice.find({ status: 'active' }).select('_id').lean();
  return devices.map((d) => d._id.toString());
};

const watchCollection = async (sensorId, client, silent = false) => {
  const dbName = mongoose.connection.db.databaseName;
  const db = client.db(dbName);
  const collections = await db.listCollections({ name: sensorId }).toArray();
  if (!collections.length) {
    return null;
  }

  const collection = db.collection(sensorId);
  const pipeline = [
    { $match: { operationType: 'insert' } },
  ];

  const changeStream = collection.watch(pipeline, { fullDocument: 'updateLookup' });

  changeStream.on('change', async (change) => {
    try {
      const document = change.fullDocument;
      if (!document) return;

      const timestamp = document.createAt
        ? new Date(document.createAt).toISOString()
        : new Date().toISOString();

      await enqueueSensorData(sensorId, document, timestamp);
    } catch (err) {
      console.error(`ChangeStream: Error procesando cambio de ${sensorId}:`, err.message);
    }
  });

  changeStream.on('error', (err) => {
    console.error(`ChangeStream: Error en stream de ${sensorId}:`, err.message);
  });

  changeStream.on('close', () => {
    watchedSensorIds.delete(sensorId);
    console.log(`ChangeStream: Stream de ${sensorId} cerrado`);
  });

  streams.push(changeStream);
  watchedSensorIds.add(sensorId);
  if (!silent) {
    console.log(`ChangeStream: Vigilando coleccion "${sensorId}"`);
  }
  return changeStream;
};

const syncStreams = async () => {
  try {
    const client = mongoose.connection.getClient();
    const sensorIds = await loadActiveSensorIds();

    if (!sensorIds.length) return;

    let newCount = 0;

    for (const sensorId of sensorIds) {
      if (watchedSensorIds.has(sensorId)) continue;

      const stream = await watchCollection(sensorId, client, true);
      if (stream) {
        newCount++;
        console.log(`ChangeStream: + Nuevo sensor conectado: "${sensorId}"`);
      }
    }

    if (firstSync) {
      firstSync = false;
      if (watchedSensorIds.size > 0) {
        console.log(`ChangeStream: Vigilando ${watchedSensorIds.size} colecciones de sensores`);
      } else {
        console.log('ChangeStream: No hay colecciones de sensores activas aun');
      }
      return;
    }

    if (newCount > 0) return;

    pendingLogCount++;
    if (pendingLogCount >= PENDING_LOG_INTERVAL) {
      pendingLogCount = 0;
      const remaining = sensorIds.length - watchedSensorIds.size;
      if (remaining > 0) {
        console.log(`ChangeStream: ${remaining} sensores aun sin datos (no hay cambios recientes)`);
      }
    }
  } catch (err) {
    console.error('ChangeStream: Error en syncStreams:', err.message);
  }
};

const initChangeStreams = async () => {
  if (isListening) {
    console.warn('ChangeStream: Ya esta escuchando, se omite reinicializacion');
    return;
  }

  await syncStreams();
  isListening = true;

  retryTimer = setInterval(syncStreams, RETRY_INTERVAL);
  console.log(`ChangeStream: Reintento automatico cada ${RETRY_INTERVAL / 1000}s para nuevas colecciones`);
};

const shutdownChangeStreams = async () => {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  for (const stream of streams) {
    try {
      await stream.close();
    } catch (err) {
      // stream may already be closed
    }
  }
  streams = [];
  watchedSensorIds.clear();
  isListening = false;
  console.log('ChangeStream: Todos los streams cerrados');
};

module.exports = {
  initChangeStreams,
  shutdownChangeStreams,
  loadActiveSensorIds,
};
