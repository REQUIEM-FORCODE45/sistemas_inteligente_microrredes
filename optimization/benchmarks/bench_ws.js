#!/usr/bin/env node
/**
 * Benchmark WebSocket/Socket.IO push latency (Punto 11 del revisor):
 * mide el RTT del push backend -> frontend usando el evento de produccion
 * `optimization_started`, que el servidor emite al invocar `request_optimization`.
 *
 * No requiere sensor_id ni datos: solo un JWT de prueba firmado localmente
 * con SECRET_JWT_SEED (leido desde Backend/.env, nunca impreso).
 *
 * Uso:
 *   node optimization/benchmarks/bench_ws.js --url http://localhost:3000 --repeat 20
 */
const path = require('path');
const dotenv = require(path.resolve(__dirname, '..', '..', 'Backend', 'node_modules', 'dotenv'));
// Cargar .env del Backend SIN imprimirlo.
dotenv.config({ path: path.resolve(__dirname, '..', '..', 'Backend', '.env') });

const { io } = require(path.resolve(__dirname, '..', '..', 'Backend', 'node_modules', 'socket.io-client'));
const jwt = require(path.resolve(__dirname, '..', '..', 'Backend', 'node_modules', 'jsonwebtoken'));

const { program } = require(path.resolve(__dirname, '..', '..', 'Backend', 'node_modules', 'commander'));

program
  .option('--url <url>', 'URL del backend (Socket.IO)', 'http://localhost:3000')
  .option('--repeat <n>', 'numero de pushes a medir', '20')
  .parse(process.argv);
const opts = program.opts();
const REPEAT = parseInt(opts.repeat, 10);

// Firmar JWT de prueba (role admin => buildAccessQuery devuelve todos los sensores).
const seed = process.env.SECRET_JWT_SEED;
if (!seed) {
  console.error('ERROR: SECRET_JWT_SEED no encontrado en Backend/.env');
  process.exit(1);
}
const token = jwt.sign({ uid: 'bench', name: 'bench', role: 'admin' }, seed, { expiresIn: '2h' });

function pct(vals, p) {
  const s = [...vals].sort((a, b) => a - b);
  const k = Math.max(0, Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1))));
  return s[k];
}

const socket = io(opts.url, {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: false,
});

const latencies = [];
let pending = 0;

socket.on('connect', () => {
  console.log(`Conectado (${socket.id}). Solicitando ${REPEAT} pushes...`);
  for (let i = 0; i < REPEAT; i++) {
    pending++;
    const t0 = process.hrtime.bigint();
    socket.emit('request_optimization', {});
    socket.once('optimization_started', () => {
      const dt = Number(process.hrtime.bigint() - t0) / 1e6; // ms
      latencies.push(dt);
      pending--;
      if (latencies.length >= REPEAT) finish();
    });
  }
});

socket.on('optimization_error', (e) => {
  console.error('optimization_error:', e && e.message);
});

socket.on('connect_error', (e) => {
  console.error('connect_error:', e && e.message);
  process.exit(1);
});

function finish() {
  const result = {
    endpoint: opts.url,
    event: 'optimization_started (push backend->frontend)',
    samples: latencies.length,
    push_latency_ms: {
      min: Number(pct(latencies, 0).toFixed(2)),
      p50: Number(pct(latencies, 50).toFixed(2)),
      p95: Number(pct(latencies, 95).toFixed(2)),
      p99: Number(pct(latencies, 99).toFixed(2)),
      max: Number(pct(latencies, 100).toFixed(2)),
    },
  };
  console.log(JSON.stringify(result, null, 2));
  socket.close();
  process.exit(0);
}

setTimeout(() => {
  if (latencies.length < REPEAT) {
    console.error(`TIMEOUT: solo ${latencies.length}/${REPEAT} pushes recibidos`);
    process.exit(1);
  }
}, 30000);
