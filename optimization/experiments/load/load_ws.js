#!/usr/bin/env node
/* Carga WebSocket del Experimento C (R5): cliente Socket.IO que mide la
 * latencia backend->frontend de los eventos reales de optimizacion
 * (20 ciclos: optimization_queued -> optimization_result).
 *
 * Uso: node load/load_ws.js <token> [--url http://localhost:3000] [--cycles 20]
 * Ejecutar junto con disparos reales de optimizacion (trigger manual o
 * ciclo automatico de 15 min del backend).
 */
'use strict';

const path = require('path');
const { io } = require(path.resolve(process.cwd(),
  'Frontend/GestionFront/node_modules/socket.io-client'));

const token = process.argv[2];
if (!token) {
  console.error('Uso: node load_ws.js <token> [--url URL] [--cycles 20]');
  process.exit(1);
}
const urlIdx = process.argv.indexOf('--url');
const url = urlIdx >= 0 ? process.argv[urlIdx + 1] : 'http://localhost:3000';
const cyIdx = process.argv.indexOf('--cycles');
const cycles = cyIdx >= 0 ? parseInt(process.argv[cyIdx + 1], 10) : 20;
const evIdx = process.argv.indexOf('--event');
const eventName = evIdx >= 0 ? process.argv[evIdx + 1] : 'optimization_result';

const socket = io(url, {
  auth: { token },
  transports: ['websocket'],
  reconnection: false,
});

const latencies = [];
let queuedAt = 0;
let events = 0;

socket.on('connect', () => {
  console.log('Conectado WS a', url);
  // sensor_update se emite a ROOMS por sensor: hay que unirse
  for (const sid of ['pasto_solar_pv', 'pasto_load', 'pasto_bess', 'pasto_wind']) {
    socket.emit('join_sensor_room', sid);
  }
});
socket.on('connect_error', (e) => { console.error('WS error:', e.message); process.exit(1); });

// Latencia de PUSH para sensor_update: el backend emite tras insertar en
// Mongo; medimos backend -> cliente (el mensaje incluye el sent_ts del
// publicador MQTT como marca de origen).
socket.on('sensor_update', (p) => {
  if (typeof p.sent_ts === 'number' && p.sent_ts > 0) {
    latencies.push(Date.now() - p.sent_ts); // publicacion MQTT -> push WS
    events++;
    if (events >= cycles) finish();
  }
});

socket.on('optimization_queued', (p) => { queuedAt = Date.now(); });
socket.on('optimization_result', () => {
  if (eventName !== 'optimization_result') return;
  if (queuedAt) {
    latencies.push(Date.now() - queuedAt); // encolado -> resultado (push)
    queuedAt = 0;
  }
  events++;
  if (events >= cycles) finish();
});
socket.on('optimization_error', () => { if (queuedAt) queuedAt = 0; });

function finish() {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = latencies.length;
  const pct = (p) => (n ? sorted[Math.min(n - 1, Math.floor(p * n))] : null);
  const mean = n ? latencies.reduce((a, b) => a + b, 0) / n : 0;
  console.log(JSON.stringify({
    event: eventName,
    samples: n,
    push_latency_ms: { mean: Math.round(mean), p50: pct(0.5),
      p95: pct(0.95), p99: pct(0.99), max: pct(1) },
  }, null, 2));
  process.exit(0);
}

// seguridad: si no llegan eventos en 30 min, salir
setTimeout(() => {
  console.log('timeout esperando eventos');
  finish();
}, 30 * 60 * 1000);

console.log(`WS load: esperando ${cycles} eventos '${eventName}'...`);
