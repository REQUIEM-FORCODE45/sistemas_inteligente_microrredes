// Contexto climatico visual — 05.1 (MVP).
// Port JS de reference/scripts/descargar_indices.py (4 parsers) +
// reference/scripts/explorar_indices_sitio.py:57-91 (RONI/MEI, TNI, ep_cp).
// Sin dependencias: solo fs/path/https/crypto. Nunca inventa coordenadas.
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const EST_A_MES = { DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6, JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 12 };
const MES_A_EST = Object.fromEntries(Object.entries(EST_A_MES).map(([k, v]) => [v, k]));

const FUENTES = {
  oni: 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt',
  soi: 'https://www.cpc.ncep.noaa.gov/data/indices/soi',
  nino: 'https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii',
  pdo: 'https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/index/ersst.v5.pdo.dat',
  roni: 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt',
  mei: 'https://psl.noaa.gov/enso/mei/data/meiv2.data',
};
const FUENTE_CITA = 'CPC/NOAA · NCEI · PSL';
const REF_DIR = path.join(__dirname, '..', '..', 'integracion_plataforma',
  'cambio_05_contexto_climatico_visual', 'reference');
const RAW_DIR = path.join(REF_DIR, 'datos', 'raw');
const EXPLORACION_JSON = path.join(REF_DIR, 'resultados', 'exploracion_indices.json');
const SITE_YAML = path.join(__dirname, '..', '..', 'optimization', 'config', 'sites', 'pasto_narino.yaml');

function parseOni(txt) {
  const out = {};
  for (const ln of txt.split('\n')) {
    const p = ln.trim().split(/\s+/);
    if (p.length >= 4 && EST_A_MES[p[0]]) {
      const v = parseFloat(p[3]);
      if (Number.isFinite(v)) out[`${p[1]}-${String(EST_A_MES[p[0]]).padStart(2, '0')}-01`] = v;
    }
  }
  return out;
}

function parseRoni(txt) {
  // RONI: SEAS YR ANOM (3 cols) o SEAS YR ... ANOM — anomalia en pos 2..3
  const out = {};
  for (const ln of txt.split('\n')) {
    const p = ln.trim().split(/\s+/);
    if (p.length >= 3 && EST_A_MES[p[0]]) {
      const v = parseFloat(p.length === 3 ? p[2] : p[3]);
      if (Number.isFinite(v)) out[`${p[1]}-${String(EST_A_MES[p[0]]).padStart(2, '0')}-01`] = v;
    }
  }
  return out;
}

function parseNino(txt) {
  // Pares (temperatura, anomalia): YR MON N12 ANOM N3 ANOM N4 ANOM N34 ANOM
  const n12 = {}, n3 = {}, n4 = {}, n34 = {};
  for (const ln of txt.split('\n')) {
    const p = ln.trim().split(/\s+/);
    if (p.length === 10 && /^\d{4}$/.test(p[0])) {
      const k = `${p[0]}-${String(Number(p[1])).padStart(2, '0')}-01`;
      const vals = [parseFloat(p[3]), parseFloat(p[5]), parseFloat(p[7]), parseFloat(p[9])];
      if (vals.every(Number.isFinite)) { n12[k] = vals[0]; n3[k] = vals[1]; n4[k] = vals[2]; n34[k] = vals[3]; }
    }
  }
  return { nino12: n12, nino3: n3, nino4: n4, nino34: n34 };
}

function parseYearTable(txt, missing = 90) {
  const out = {};
  for (const ln of txt.split('\n')) {
    const p = ln.trim().split(/\s+/);
    if (p.length >= 13 && /^\d{4}$/.test(p[0])) {
      for (let m = 0; m < 12; m++) {
        const v = parseFloat(p[m + 1]);
        if (Number.isFinite(v) && v < missing) out[`${p[0]}-${String(m + 1).padStart(2, '0')}-01`] = v;
      }
    }
  }
  return out;
}

function clasificar(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'desconocido';
  return v >= 0.5 ? 'nino' : (v <= -0.5 ? 'nina' : 'neutral');
}

function fetchText(url, ms = 8000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: ms, headers: { 'User-Agent': 'microrred/1.0' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve(t));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function readSeed(name) {
  const files = { oni: 'oni.txt', soi: 'soi.txt', nino: 'nino.txt', pdo: 'pdo.txt', roni: 'RONI.ascii.txt', mei: 'meiv2.data' };
  try {
    const p = path.join(RAW_DIR, files[name]);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch (e) { /* semilla ausente: se intenta red */ }
  return null;
}

function readSitio() {
  const sitio = { nombre: 'Pasto', lat: 1.2136, lon: -77.2811, altitud_m: 2600, tz: 'America/Bogota' };
  try {
    const y = fs.readFileSync(SITE_YAML, 'utf8');
    const num = (re) => { const m = y.match(re); return m ? parseFloat(m[1]) : null; };
    const str = (re) => { const m = y.match(re); return m ? m[1] : null; };
    sitio.lat = num(/latitude:\s*([-\d.]+)/) ?? sitio.lat;
    sitio.lon = num(/longitude:\s*([-\d.]+)/) ?? sitio.lon;
    sitio.altitud_m = num(/elevation_masl:\s*([\d.]+)/) ?? sitio.altitud_m;
    sitio.tz = str(/timezone:\s*(\S+)/) ?? sitio.tz;
  } catch (e) { /* YAML ausente: valores canonicos por defecto */ }
  return sitio;
}

function readClimatologia() {
  try {
    const j = JSON.parse(fs.readFileSync(EXPLORACION_JSON, 'utf8'));
    return {
      nubes_pct: j.sitio?.nubes_media_pct ?? 88.4,
      ghi_kwh_m2_dia: j.sitio?.ghi_media_kwh_m2_dia ?? 4.91,
      periodo: '1940-2025',
    };
  } catch (e) { return { nubes_pct: 88.4, ghi_kwh_m2_dia: 4.91, periodo: '1940-2025' }; }
}

let cache = null;

async function buildIndices({ remote = true } = {}) {
  const raw = {};
  let usadoRemoto = false;
  if (remote) {
    const keys = Object.keys(FUENTES);
    const got = await Promise.all(keys.map((k) => fetchText(FUENTES[k]).then((t) => [k, t])));
    for (const [k, t] of got) if (t) { raw[k] = t; usadoRemoto = true; }
  }
  for (const k of Object.keys(FUENTES)) if (!raw[k]) raw[k] = readSeed(k);
  const oni = raw.oni ? parseOni(raw.oni) : {};
  const roni = raw.roni ? parseRoni(raw.roni) : {};
  const { nino12, nino3, nino4, nino34 } = raw.nino ? parseNino(raw.nino) : { nino12: {}, nino3: {}, nino4: {}, nino34: {} };
  const soi = raw.soi ? parseYearTable(raw.soi, 900) : {};
  const pdo = raw.pdo ? parseYearTable(raw.pdo, 90) : {};
  const mei = raw.mei ? parseYearTable(raw.mei, 900) : {};
  const keys = new Set([...Object.keys(oni), ...Object.keys(roni), ...Object.keys(nino12),
    ...Object.keys(soi), ...Object.keys(pdo), ...Object.keys(mei)]);
  const mes = [...keys].sort();
  const pick = (map, k) => (map[k] !== undefined ? map[k] : null);
  const series = { mes, oni: [], roni: [], soi: [], nino12: [], nino3: [], nino34: [], nino4: [], pdo: [], mei: [], tni: [], ep_cp: [] };
  for (const k of mes) {
    const a = pick(nino12, k), b = pick(nino4, k), c = pick(nino3, k);
    series.oni.push(pick(oni, k)); series.roni.push(pick(roni, k)); series.soi.push(pick(soi, k));
    series.nino12.push(a); series.nino3.push(c); series.nino34.push(pick(nino34, k)); series.nino4.push(b);
    series.pdo.push(pick(pdo, k)); series.mei.push(pick(mei, k));
    series.tni.push(a !== null && b !== null ? a - b : null);
    series.ep_cp.push(c !== null && b !== null ? c - b : null);
  }
  return { series, usadoRemoto };
}

function ultimoNoNulo(meses, vals) {
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return { mes: meses[i], valor: vals[i] };
  return { mes: null, valor: null };
}

async function getContext({ remote = true } = {}) {
  if (cache && !remote) return cache;
  const { series, usadoRemoto } = await buildIndices({ remote });
  const sitio = readSitio();
  const clim = readClimatologia();
  const lastRoni = ultimoNoNulo(series.mes, series.roni);
  const lastOni = ultimoNoNulo(series.mes, series.oni);
  const fuenteClasif = lastRoni.valor !== null ? 'RONI' : 'ONI';
  const refVal = fuenteClasif === 'RONI' ? lastRoni.valor : lastOni.valor;
  const refMes = fuenteClasif === 'RONI' ? lastRoni.mes : lastOni.mes;
  const periodo = refMes ? `${MES_A_EST[Number(refMes.slice(5, 7))]} ${refMes.slice(0, 4)}` : null;
  const ventanas = { nina: null, neutral: null, nino: null };
  const src = fuenteClasif === 'RONI' ? series.roni : series.oni;
  for (let i = series.mes.length - 1; i >= 0; i--) {
    const c = clasificar(src[i]);
    if (ventanas[c] === null && ventanas[c] !== undefined) ventanas[c] = series.mes[i].slice(0, 7);
    if (ventanas.nina && ventanas.neutral && ventanas.nino) break;
  }
  const payload = {
    generado: new Date().toISOString(),
    stale: !usadoRemoto,
    sitio,
    modo_vigente: {
      oni: lastOni.valor, roni: lastRoni.valor,
      clasificacion: clasificar(refVal), periodo,
      fuente: FUENTE_CITA, fuente_clasificacion: fuenteClasif,
    },
    indices: series,
    roles: { etiqueta: 'roni', predictor_local: 'nino4' },
    climatologia_sitio: clim,
    ventanas_modo: ventanas,
    mapa: {
      capas_base: ['osm', 'topo', 'satelite'],
      activos: [
        { id: 'pv1', tipo: 'pv', lat: null, lon: null, geo_origen: null },
        { id: 'bess1', tipo: 'bess', lat: null, lon: null, geo_origen: null },
      ],
    },
    climatologia_geo: null,
    meta: { descargado_en: new Date().toISOString(), fuente: FUENTE_CITA },
  };
  payload.meta.sha256 = crypto.createHash('sha256').update(JSON.stringify(payload.indices)).digest('hex').slice(0, 16);
  if (!usadoRemoto) cache = payload;
  return payload;
}

// Anclas de credibilidad (criterio §7.2): deben cumplirse sobre la serie.
function verificarAnclas(series) {
  const idx = Object.fromEntries(series.mes.map((m, i) => [m, i]));
  const checks = [
    { etiqueta: '1997-98', mes: '1997-12-01', cond: (v) => v >= 2 },
    { etiqueta: '2010-11', mes: '2010-11-01', cond: (v) => v <= -1 },
    { etiqueta: '2015-16', mes: '2015-12-01', cond: (v) => v >= 2 },
    { etiqueta: '2020-22', mes: '2020-11-01', cond: (v) => v <= -1 },
  ];
  return checks.map((c) => {
    const i = idx[c.mes];
    const v = i !== undefined ? series.oni[i] : null;
    return { ...c, oni: v, ok: v !== null && c.cond(v) };
  });
}

module.exports = { getContext, verificarAnclas, clasificar, FUENTES, EST_A_MES };
