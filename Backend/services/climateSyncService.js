// Cambio 17: auto-sync del contexto climatico cada 24 h.
// Arranca lazy en el primer hit a /front/climate/* (cero toques a app.js,
// patron C2 del cambio 05). Ejecuta el mismo refresh con dedup que el boton
// manual: version nueva SOLO si los datos cambiaron; sin red, nada (el
// endpoint ya sirve la ultima version con stale:true).
const SYNC_MS = 24 * 60 * 60 * 1000;
const ARRANQUE_MS = 5 * 60 * 1000;

let started = false;
let lastRun = null;
let lastResult = null;

async function runOnce(origen) {
  try {
    const ctx = require('./climateContextService');
    const store = require('./climateStoreService');
    const c = await ctx.getContext({ remote: true });
    if (c.stale) {
      lastResult = { ok: false, motivo: 'sin red', origen, en: new Date().toISOString() };
      return lastResult;
    }
    const datos = { indices: c.indices };
    if (!store.hayCambios('clima_indices', datos)) {
      lastResult = { ok: true, updated: false, origen, en: new Date().toISOString() };
      return lastResult;
    }
    const reg = store.guardarVersion('clima_indices', datos,
      { cobertura: `${c.indices.mes[0]}..${c.indices.mes[c.indices.mes.length - 1]}`, fuente: c.meta.fuente });
    lastResult = { ok: true, updated: true, sha256: reg.sha256, origen, en: new Date().toISOString() };
    return lastResult;
  } catch (e) {
    lastResult = { ok: false, motivo: e.message, origen, en: new Date().toISOString() };
    return lastResult;
  } finally {
    lastRun = new Date().toISOString();
  }
}

function startClimateSync() {
  if (started) return;
  started = true;
  setTimeout(() => { runOnce('arranque').catch(() => {}); }, ARRANQUE_MS);
  const t = setInterval(() => { runOnce('tick-24h').catch(() => {}); }, SYNC_MS);
  if (typeof t.unref === 'function') t.unref();
}

function getSyncInfo() {
  return { active: started, every_hours: 24, last_run: lastRun, last_result: lastResult };
}

module.exports = { startClimateSync, runOnce, getSyncInfo };
