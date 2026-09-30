// Capa persistente 05.6 (MVP) — C4: crea el patron stale aqui.
// Append-only: cada refresh crea version nueva, jamas sobrescribe.
// Disco = verdad (data/clima/<familia>/<AAAA-MM>_<hash>.json + manifest.json).
// Mongo = espejo consultable (_id = sha256). Frontend nunca lee disco.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_DIR = path.join(__dirname, '..', '..', 'data', 'clima');
const MANIFEST = path.join(STORE_DIR, 'manifest.json');
const FAMILIAS = ['clima_indices', 'clima_sitio', 'clima_geo', 'figuras', 'actas_director'];

function ensureDir() { fs.mkdirSync(STORE_DIR, { recursive: true }); }

function readManifest() {
  try {
    if (fs.existsSync(MANIFEST)) return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) { /* manifest corrupto: se reconstruye */ }
  return { versiones: [] };
}

function writeManifest(m) {
  ensureDir();
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

function sha16(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

function guardarVersion(familia, datos, metaExtra = {}) {
  if (!FAMILIAS.includes(familia)) throw new Error(`Familia no valida: ${familia}`);
  ensureDir();
  const famDir = path.join(STORE_DIR, familia);
  fs.mkdirSync(famDir, { recursive: true });
  const descargadoEn = new Date().toISOString();
  const hash = sha16({ familia, datos, descargadoEn });
  const periodo = `${new Date().toISOString().slice(0, 7)}`;
  const nombre = `${periodo}_${hash}.json`;
  const registro = {
    _id: hash,
    familia,
    archivo: `${familia}/${nombre}`,
    descargado_en: descargadoEn,
    cobertura: metaExtra.cobertura || null,
    sha256: hash,
    fuente: metaExtra.fuente || 'CPC/NOAA · NCEI · PSL',
    licencia: 'CPC/NCEI/PSL dominio publico con cita; OSM/OpenTopoMap con atribucion',
    bytes: 0,
  };
  const cuerpo = { meta: registro, datos };
  const full = path.join(famDir, nombre);
  // Append-only: si el hash ya existe no se pisa (misma version).
  if (!fs.existsSync(full)) fs.writeFileSync(full, JSON.stringify(cuerpo));
  registro.bytes = fs.statSync(full).size;
  const m = readManifest();
  if (!m.versiones.some((v) => v.sha256 === hash && v.familia === familia)) {
    m.versiones.push(registro);
    writeManifest(m);
  }
  espejoMongo(registro, cuerpo).catch(() => {});
  return registro;
}

function listarVersiones(familia, desde = null) {
  const m = readManifest();
  return m.versiones
    .filter((v) => !familia || v.familia === familia)
    .filter((v) => !desde || v.descargado_en.slice(0, 7) >= desde.slice(0, 7))
    .sort((a, b) => (a.descargado_en < b.descargado_en ? -1 : 1));
}

function leerVersion(familia, hash) {
  const m = readManifest();
  const r = m.versiones.find((v) => v.familia === familia && v.sha256 === hash);
  if (!r) return null;
  try { return JSON.parse(fs.readFileSync(path.join(STORE_DIR, r.archivo), 'utf8')); }
  catch (e) { return null; }
}

function ultimaVersion(familia) {
  const v = listarVersiones(familia);
  if (!v.length) return null;
  const reg = v[v.length - 1];
  return { registro: reg, cuerpo: leerVersion(familia, reg.sha256) };
}

async function espejoMongo(registro, cuerpo) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return false;
    const col = mongoose.connection.collection('clima_versiones');
    await col.updateOne({ _id: registro._id }, { $set: { ...registro, datos: cuerpo.datos } }, { upsert: true });
    return true;
  } catch (e) { return false; }
}

// Reconstruye el espejo Mongo desde cero a partir del manifest (criterio §7.10).
async function reconstruirEspejo() {
  const m = readManifest();
  let ok = 0, fallo = 0;
  for (const r of m.versiones) {
    const cuerpo = leerVersion(r.familia, r.sha256);
    if (!cuerpo) { fallo++; continue; }
    const ok1 = await espejoMongo(r, cuerpo);
    if (ok1) ok++; else fallo++;
  }
  return { total: m.versiones.length, ok, fallo };
}

module.exports = { guardarVersion, listarVersiones, leerVersion, ultimaVersion, reconstruirEspejo, readManifest, STORE_DIR, FAMILIAS };
