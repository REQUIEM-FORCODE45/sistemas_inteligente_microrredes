#!/usr/bin/env node
/**
 * Benchmark de API REST (Punto 11 del revisor): RPS y percentiles de latencia
 * bajo carga concurrente, usando autocannon.
 *
 * Requisitos:
 *   - commander y autocannon instalados en Backend/node_modules
 *     (npm install --save commander autocannon, desde la carpeta Backend).
 *   - Backend corriendo en la URL indicada.
 *
 * Uso:
 *   node optimization/benchmarks/bench_api.js --url http://localhost:3000/api/front/sensors --connections 50 --duration 10
 */
const path = require('path');
// Resolver dependencias desde Backend/node_modules (el script vive fuera del arbol de node).
const backendNodeModules = path.resolve(__dirname, '..', '..', 'Backend', 'node_modules');
const requireBackend = (m) => require(path.join(backendNodeModules, m));
const autocannon = requireBackend('autocannon');
const { program } = requireBackend('commander');

program
  .option('--url <url>', 'URL del endpoint a probar', 'http://localhost:3000/api/front/sensors')
  .option('--connections <n>', 'conexiones concurrentes', '50')
  .option('--duration <s>', 'duración en segundos', '10')
  .option('--pipelining <n>', 'pipelining', '1')
  .parse(process.argv);

const opts = program.opts();

const url = opts.url;
const connections = parseInt(opts.connections, 10);
const duration = parseInt(opts.duration, 10);

console.log(`Benchmark API REST -> ${url} (${connections} conns, ${duration}s)`);

autocannon(
  {
    url,
    connections,
    duration,
    pipelining: parseInt(opts.pipelining, 10),
    // Sin token: se espera 401; el benchmark mide la latencia de la respuesta de la API.
  },
  (err, result) => {
    if (err) {
      console.error('ERROR:', err.message);
      process.exit(1);
    }
    const out = {
      endpoint: url,
      connections,
      duration_s: duration,
      requests_per_sec: result.requests.average,
      latency_ms: {
        p50: result.latency.p50,
        p95: result.latency.p95,
        p99: result.latency.p99,
        max: result.latency.max,
      },
      throughput_bytes_per_sec: result.throughput.average,
      status_2xx: result['2xx'] || 0,
      status_4xx: result['4xx'] || 0,
      errors: result.errors || 0,
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
);
