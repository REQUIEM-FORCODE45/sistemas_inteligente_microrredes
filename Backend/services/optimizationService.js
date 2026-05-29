const { Queue } = require('bullmq');
const Redis = require('ioredis');
const crypto = require('crypto');

let optimizationQueue = null;
let redisClient = null;
let redisReady = false;
let lastErrorLog = 0;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PENDING_LIST = 'optimization:pending';
const RESULT_PREFIX = 'optimization:result:';
const PROGRESS_PREFIX = 'optimization:progress:';
const RESULT_TTL = 86400;

const getRedis = () => {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 2) return null;
        return 2000;
      },
      reconnectOnError: () => false,
    });

    redisClient.on('connect', () => {
      redisReady = true;
      console.log('  [optimization] Redis conectado');
    });

    redisClient.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrorLog > 15000) {
        lastErrorLog = now;
        console.warn(`  [optimization] Redis no disponible (${err.message})`);
      }
    });

    redisClient.on('close', () => {
      redisReady = false;
    });
  }
  return redisClient;
};

const getOptimizationQueue = () => {
  if (!optimizationQueue) {
    const redis = getRedis();
    optimizationQueue = new Queue('optimization-queue', { connection: redis });
  }
  return optimizationQueue;
};

const enqueueOptimization = async (optimizationData) => {
  const jobId = crypto.randomUUID();
  const jobPayload = { job_id: jobId, ...optimizationData };

  try {
    const queue = getOptimizationQueue();
    await queue.add(
      `optimization:${jobId}`,
      jobPayload,
      {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    const redis = getRedis();
    await redis.rpush(PENDING_LIST, JSON.stringify(jobPayload));
    await redis.set(`${PROGRESS_PREFIX}${jobId}`, 'pending');
    await redis.expire(`${PROGRESS_PREFIX}${jobId}`, RESULT_TTL);

    console.log(`  [optimization] Job ${jobId} encolado`);
    return jobId;
  } catch (err) {
    console.error('  [optimization] Error encolando job:', err.message);
    return null;
  }
};

const getOptimizationStatus = async (jobId) => {
  try {
    const redis = getRedis();
    const status = await redis.get(`${PROGRESS_PREFIX}${jobId}`);
    return status || 'not_found';
  } catch {
    return 'unknown';
  }
};

const getOptimizationResult = async (jobId) => {
  try {
    const redis = getRedis();
    const raw = await redis.get(`${RESULT_PREFIX}${jobId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getLatestOptimizationResult = async () => {
  try {
    const redis = getRedis();
    const keys = await redis.keys(`${RESULT_PREFIX}*`);
    if (keys.length === 0) return null;

    keys.sort();
    const latestKey = keys[keys.length - 1];
    const raw = await redis.get(latestKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const shutdownOptimization = async () => {
  if (optimizationQueue) await optimizationQueue.close().catch(() => {});
  if (redisClient) await redisClient.quit().catch(() => {});
};

let progressPoller = null;

const pollProgress = (jobId, onComplete, onStatus) => {
  if (progressPoller) clearInterval(progressPoller);

  let polls = 0;
  const MAX_POLLS = 150;

  progressPoller = setInterval(async () => {
    polls++;
    const status = await getOptimizationStatus(jobId);
    if (onStatus) onStatus(status);

    if (status === 'completed' || status === 'failed') {
      clearInterval(progressPoller);
      progressPoller = null;
      const result = await getOptimizationResult(jobId);
      if (onComplete) onComplete(result);
      return;
    }

    if (polls >= MAX_POLLS) {
      clearInterval(progressPoller);
      progressPoller = null;
      console.log(`  [optimization] Timeout esperando job ${jobId} (${MAX_POLLS * 2}s)`);
      if (onComplete) onComplete({ jobId, status: 'timeout', error: 'Timeout de optimizacion' });
    }
  }, 2000);
};

const cleanupPoll = () => {
  if (progressPoller) {
    clearInterval(progressPoller);
    progressPoller = null;
  }
};

module.exports = {
  enqueueOptimization,
  getOptimizationStatus,
  getOptimizationResult,
  getLatestOptimizationResult,
  pollProgress,
  cleanupPoll,
  shutdownOptimization,
};
