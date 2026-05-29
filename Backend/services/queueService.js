const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

let analysisQueue = null;
let workerInstance = null;
let redisReady = false;
let lastErrorLog = 0;

let errorSuppressed = false;
const ERROR_SUPPRESS_INTERVAL = 30000;

const createConnection = () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 2) return null;
      return 2000;
    },
    lazyConnect: true,
    reconnectOnError: () => false,
  });

  connection.on('connect', () => {
    redisReady = true;
    console.log(' Redis conectado');
  });

  connection.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLog > 15000) {
      lastErrorLog = now;
      console.warn(` Redis no disponible (${err.message}) — el análisis en tiempo real se desactivará. El análisis bajo demanda sigue funcionando.`);
    }
  });

  connection.on('close', () => {
    redisReady = false;
  });

  return connection;
};

const getAnalysisQueue = () => {
  if (!analysisQueue) {
    const connection = createConnection();
    analysisQueue = new Queue('analysis-queue', { connection });
  }
  return analysisQueue;
};

const registerWorker = (processorFn) => {
  const connection = createConnection();
  const worker = new Worker('analysis-queue', processorFn, {
    connection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 1000,
    },
    autorun: true,
  });

  worker.on('completed', (job) => {
    console.log(`Worker: Job ${job.id} completado (sensor ${job.data?.sensorId})`);
  });

  worker.on('failed', (job, err) => {
    if (err.message && !err.message.includes('ECONNREFUSED')) {
      console.error(`Worker: Job ${job?.id} falló:`, err.message);
    }
  });

  worker.on('error', () => {});

  workerInstance = worker;
  return worker;
};

const enqueueSensorData = async (sensorId, payload, timestamp = new Date().toISOString()) => {
  if (!redisReady) return null;

  try {
    const queue = getAnalysisQueue();
    return queue.add(
      `sensor:${sensorId}`,
      { sensorId, payload, timestamp },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );
  } catch (err) {
    return null;
  }
};

const shutdownQueue = async () => {
  if (workerInstance) await workerInstance.close().catch(() => {});
  if (analysisQueue) await analysisQueue.close().catch(() => {});
};

module.exports = {
  getAnalysisQueue,
  registerWorker,
  enqueueSensorData,
  shutdownQueue,
};
