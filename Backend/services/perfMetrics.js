// perfMetrics.js — instrumentacion ligera de rendimiento (Experimento C, R5/R6).
// Histogramas en RAM de latencias (ms) + contadores de throughput (msg/s en la
// ultima ventana de 60 s). Sin dependencias externas.
'use strict';

const { performance } = require('perf_hooks');

const MAX_SAMPLES = 50000;
const WINDOW_S = 60;

const _samples = new Map();   // name -> [ms...]
const _counts = new Map();    // name -> total
const _stamps = new Map();    // name -> [{t, ms}] para throughput ventana
const _last = new Map();      // name -> ultimo valor

function _arr(name) {
  if (!_samples.has(name)) {
    _samples.set(name, []);
    _counts.set(name, 0);
    _stamps.set(name, []);
  }
  return _samples.get(name);
}

function record(name, ms) {
  const arr = _arr(name);
  if (arr.length >= MAX_SAMPLES) arr.shift();
  arr.push(ms);
  _counts.set(name, _counts.get(name) + 1);
  _last.set(name, ms);
  const st = _stamps.get(name);
  st.push({ t: Date.now(), ms });
  if (st.length > MAX_SAMPLES) st.shift();
}

function recordCount(name) {
  // solo contador (msg/s), sin latencia
  _arr(name);
  _counts.set(name, _counts.get(name) + 1);
  const st = _stamps.get(name);
  st.push({ t: Date.now(), ms: null });
  if (st.length > MAX_SAMPLES) st.shift();
}

function time(name, fn) {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    record(name, performance.now() - t0);
  }
}

async function timeAsync(name, fn) {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    record(name, performance.now() - t0);
  }
}

function _pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

function _throughput(name) {
  const st = _stamps.get(name) || [];
  const cutoff = Date.now() - WINDOW_S * 1000;
  let n = 0;
  for (let i = st.length - 1; i >= 0; i--) {
    if (st[i].t < cutoff) break;
    n++;
  }
  return n / WINDOW_S;
}

function snapshot() {
  const out = [];
  for (const [name, arr] of _samples) {
    const sorted = [...arr].sort((a, b) => a - b);
    out.push({
      name,
      n: _counts.get(name),
      mean_ms: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
      p50_ms: _pct(sorted, 0.50),
      p95_ms: _pct(sorted, 0.95),
      p99_ms: _pct(sorted, 0.99),
      max_ms: sorted.length ? sorted[sorted.length - 1] : null,
      throughput_last_60s: _throughput(name),
      last_ms: _last.get(name) ?? null,
    });
  }
  return out;
}

function reset() {
  _samples.clear();
  _counts.clear();
  _stamps.clear();
  _last.clear();
}

module.exports = { record, recordCount, time, timeAsync, snapshot, reset };
