#!/usr/bin/env node
/* Carga REST del Experimento C (R6): 50 conexiones concurrentes contra
 * /api/front/performance (endpoint ligero real) y reporte req/s + latencias.
 *
 * Uso: node load/load_rest.js <token> [--url http://localhost:3000]
 * El token se obtiene con: node load/mint_token.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const token = process.argv[2];
if (!token) {
  console.error('Uso: node load_rest.js <token> [--url URL] [--concurrent 50] [--duration 30]');
  process.exit(1);
}
const urlIdx = process.argv.indexOf('--url');
const base = urlIdx >= 0 ? process.argv[urlIdx + 1] : 'http://localhost:3000';
const concIdx = process.argv.indexOf('--concurrent');
const concurrent = concIdx >= 0 ? parseInt(process.argv[concIdx + 1], 10) : 50;
const durIdx = process.argv.indexOf('--duration');
const duration = durIdx >= 0 ? parseInt(process.argv[durIdx + 1], 10) : 30;

const target = `${base}/api/front/performance`;
const latencies = [];
let done = 0;
let errors = 0;

async function worker() {
  while (Date.now() < endTime) {
    const t0 = Date.now();
    try {
      const res = await fetch(target, { headers: { 'x-token': token } });
      await res.text();
      latencies.push(Date.now() - t0);
      if (res.status !== 200) errors++;
    } catch (e) {
      errors++;
    }
    done++;
  }
}

const endTime = Date.now() + duration * 1000;
console.log(`Carga REST: ${concurrent} concurrentes, ${duration}s -> ${target}`);
const workers = [];
for (let i = 0; i < concurrent; i++) workers.push(worker());
Promise.all(workers).then(() => {
  const n = latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const mean = latencies.reduce((a, b) => a + b, 0) / n;
  console.log(JSON.stringify({
    requests: done,
    errors,
    req_s: Math.round(done / duration),
    latency_ms: {
      mean: Math.round(mean * 10) / 10,
      p50: pct(0.5),
      p95: pct(0.95),
      p99: pct(0.99),
      max: sorted[n - 1],
    },
  }, null, 2));
});
