// Cambio 17: build del mapa de calor bajo demanda (POST /climate/geo/build).
// Lanza `python3 -m climate.build_clima_geo` (desde optimization/) en
// background; el script ya es reanudable (cache por decada+lote) y solo
// anade versiones con sha nuevo. Al terminar OK, espeja la ultima version
// clima_geo a Mongo (el build python escribe disco, no el espejo).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OPTIMIZATION_DIR = path.join(__dirname, '..', '..', 'optimization');
const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'clima');
const CACHE_ENV = 'CLIMA_GEO_CACHE_DIR';

let estado = { state: 'idle', started_at: null, finished_at: null, exit_code: null, log: null, sha: null };

function getStatus() { return { ...estado }; }

function startBuild() {
  if (estado.state === 'running') return { started: false, already: true, status: getStatus() };
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const logPath = path.join(LOG_DIR, `build_geo_${stamp}.log`);
  const logFd = fs.openSync(logPath, 'a');
  const env = { ...process.env };
  // Cache durable y visible (en vez del .cache oculto del modulo).
  env[CACHE_ENV] = path.join(LOG_DIR, '.cache_geo');
  const { getPythonBin } = require('../helpers/pythonBin');
  const child = spawn(getPythonBin(), ['-m', 'climate.build_clima_geo'],
    { cwd: OPTIMIZATION_DIR, env, detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();
  estado = { state: 'running', started_at: new Date().toISOString(), finished_at: null, exit_code: null, log: logPath, sha: null, pid: child.pid };
  child.on('exit', async (code) => {
    estado.finished_at = new Date().toISOString();
    estado.exit_code = code;
    if (code === 0) {
      estado.state = 'success';
      try {
        const store = require('./climateStoreService');
        const ult = store.ultimaVersion('clima_geo');
        if (ult?.registro) {
          estado.sha = ult.registro.sha256;
          await store.espejoMongo(ult.registro, ult.cuerpo);
        }
      } catch (e) { /* espejo best-effort; el artefacto en disco manda */ }
    } else {
      estado.state = 'failed';
    }
    try { fs.closeSync(logFd); } catch (e) { /* ya cerrado */ }
  });
  child.on('error', () => {
    estado = { ...estado, state: 'failed', finished_at: new Date().toISOString(), exit_code: -1 };
    try { fs.closeSync(logFd); } catch (e) { /* ya cerrado */ }
  });
  return { started: true, status: getStatus() };
}

module.exports = { startBuild, getStatus };
