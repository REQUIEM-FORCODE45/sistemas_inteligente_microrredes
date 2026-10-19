// P3 — Impacto de borrar un sensor, calculado ANTES de tocar nada.
// No borra, no muta: solo cuenta y declara. Tres fuentes:
//   1) lecturas: documentos en la coleccion Mongo del sensor (nombre = id);
//   2) mappings: nodos del diagrama enlazados a este sensor (memoria del
//      scheduler + Redis `optimization:last_topology` como respaldo);
//   3) calibracion: artefactos `results/<sitio>/calibrated/<sensorId>.pkl`.
// Dato faltante (Redis caido, disco ilegible) = se omite esa fuente, nunca 0 inventado.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const RESULTS_DIR = path.join(__dirname, '..', '..', 'optimization', 'results');
const LAST_TOPOLOGY_KEY = 'optimization:last_topology';

async function readingCount(sensorId) {
  try {
    if (!mongoose.connection.db) return null;
    const cols = await mongoose.connection.db
      .listCollections({ name: String(sensorId) })
      .toArray();
    if (!cols.length) return 0;
    return await mongoose.connection.db
      .collection(String(sensorId))
      .countDocuments();
  } catch (e) { return null; }
}

async function mappedNodes(sensorId) {
  const out = [];
  const seen = new Set();
  const push = (nodeId, fuente) => {
    if (!seen.has(nodeId)) { seen.add(nodeId); out.push({ nodeId, fuente }); }
  };
  // 1) memoria del scheduler (mismo proceso)
  try {
    const sched = require('./mpcScheduler');
    const mem = typeof sched.getLastSensorMappings === 'function'
      ? sched.getLastSensorMappings()
      : null;
    if (mem && typeof mem === 'object') {
      for (const [nodeId, sid] of Object.entries(mem)) {
        if (String(sid) === String(sensorId)) push(nodeId, 'memoria');
      }
    }
  } catch (e) { /* scheduler no cargado: se intenta Redis */ }
  // 2) Redis como respaldo (ultimo diagrama persistido). Con timeout propio:
  // si Redis esta caido el GET cuelga (maxRetriesPerRequest: null en el
  // cliente compartido) — se declara solo lo de memoria.
  try {
    const { getRedis } = require('./optimizationService');
    const redis = getRedis();
    const raw = await Promise.race([
      redis.get(LAST_TOPOLOGY_KEY),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis-timeout')), 3000)),
    ]);
    if (raw) {
      const data = JSON.parse(raw);
      const map = (data && data.sensor_mappings) || {};
      for (const [nodeId, sid] of Object.entries(map)) {
        if (String(sid) === String(sensorId)) push(nodeId, 'redis');
      }
    }
  } catch (e) { /* Redis caido: se declara solo lo de memoria */ }
  return out;
}

function calibratedArtifacts(sensorId) {
  const found = [];
  try {
    const entries = fs.readdirSync(RESULTS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const rel = `${e.name}/calibrated/${sensorId}.pkl`;
      if (fs.existsSync(path.join(RESULTS_DIR, rel))) found.push(rel);
    }
  } catch (e) { /* results ausente/ilegible: sin artefactos que declarar */ }
  return found;
}

async function deleteImpact(sensorId) {
  const [lecturas, nodos, artefactos] = await Promise.all([
    readingCount(sensorId),
    mappedNodes(sensorId),
    Promise.resolve(calibratedArtifacts(sensorId)),
  ]);
  const warnings = [];
  for (const n of nodos) {
    warnings.push(`Enlazado al nodo "${n.nodeId}" del diagrama (fuente: ${n.fuente}): el MPC quedara con un mapping huerfano`);
  }
  for (const a of artefactos) {
    warnings.push(`Calibracion existente ${a}: quedara congelada sin datos nuevos`);
  }
  return { lecturas, nodos, artefactos, warnings };
}

module.exports = { deleteImpact };
