// P5 — Red de seguridad de las rutas nuevas del CRUD de sensores.
// Runner NATIVO: `node --test` (Node >= 20, sin dependencias nuevas).
// Monta el router REAL (`routes/Front.js`) en un express efimero contra la
// BD real, pero solo crea sensores efimeros propios (`p5_test_*`) y los
// elimina al final (incluidos los `_deleted_*` archivados). No toca ajenos.
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = readEnv();
// validateJwt lee process.env (no dotenv aqui): se siembra antes de
// requerir el router.
process.env.SECRET_JWT_SEED = ENV.SECRET_JWT_SEED;
const mint = (uid, role) => jwt.sign({ uid, name: uid, role }, ENV.SECRET_JWT_SEED, { expiresIn: '2h' });

const OWNER = new mongoose.Types.ObjectId().toString();
const STRANGER = new mongoose.Types.ObjectId().toString();
const TOK_OWNER = mint(OWNER, 'user');
const TOK_STRANGER = mint(STRANGER, 'user');

let base;
let server;
const createdIds = [];
const createdArchives = [];

async function api(method, p, token, body, qs = '') {
  const res = await fetch(`${base}${p}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-token': token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* sin cuerpo */ }
  return { status: res.status, json };
}

before(async () => {
  // BD propia de test (nunca la de desarrollo): aunque un fallo a medias
  // dejara restos, la BD de trabajo queda intacta.
  const testDb = `${ENV.MONGO_DB_NAME}_test`;
  console.log(`# BD de test: ${testDb}`);
  await mongoose.connect(ENV.MONGO_URL, { dbName: testDb, serverSelectionTimeoutMS: 20000 });
  const app = express();
  app.use(express.json());
  app.use('/api/front', require('../routes/Front'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/front`;
});

after(async () => {
  // Limpieza: documentos propios + colecciones archivadas propias.
  try {
    const col = mongoose.connection.db.collection('authorizeddevices');
    for (const id of createdIds) {
      const q = mongoose.isValidObjectId(id)
        ? { _id: new mongoose.Types.ObjectId(String(id)) }
        : { _id: String(id) };
      await col.deleteOne(q).catch(() => {});
      const names = await mongoose.connection.db.listCollections().toArray().catch(() => []);
      for (const c of names) {
        if (c.name === String(id) || c.name.startsWith(`_deleted_${id}_`)) {
          await mongoose.connection.db.dropCollection(c.name).catch(() => {});
        }
      }
    }
    for (const a of createdArchives) {
      await mongoose.connection.db.dropCollection(a).catch(() => {});
    }
  } catch (e) { /* limpieza best-effort */ }
  try { require('../services/optimizationService').getRedis().disconnect(); } catch (e) { /* sin redis */ }
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

describe('CRUD sensores — autorizacion (P5)', () => {
  it('PATCH con status invalido -> 400 (validacion antes de tocar nada)', async () => {
    const { status, json } = await api('PATCH', '/sensors/507f1f77bcf86cd799439011/status', TOK_OWNER, { status: 'encendido' });
    assert.equal(status, 400);
    assert.equal(json.success, false);
  });

  let sensorId;

  it('owner: register 201 y lista blanca sincronizada', async () => {
    const { status, json } = await api('POST', '/register_sensor', TOK_OWNER, { name: `p5_test_${Date.now()}`, type: 'solar' });
    assert.equal(status, 201);
    sensorId = String(json.id_sensor);
    createdIds.push(sensorId);
    const { authorizedSensors } = require('../helpers/securityManager');
    assert.ok(authorizedSensors.has(sensorId), 'recien creado active debe estar en la lista blanca');
  });

  it('owner: PATCH inactive saca de la lista blanca, active la devuelve', async () => {
    const { authorizedSensors } = require('../helpers/securityManager');
    let r = await api('PATCH', `/sensors/${sensorId}/status`, TOK_OWNER, { status: 'inactive' });
    assert.equal(r.status, 200);
    assert.ok(!authorizedSensors.has(sensorId), 'inactive no debe estar en la lista blanca');
    r = await api('PATCH', `/sensors/${sensorId}/status`, TOK_OWNER, { status: 'active' });
    assert.equal(r.status, 200);
    assert.ok(authorizedSensors.has(sensorId), 'active vuelve a la lista blanca');
  });

  it('stranger: PATCH -> 403 y DELETE -> 403, sensor intacto', async () => {
    let r = await api('PATCH', `/sensors/${sensorId}/status`, TOK_STRANGER, { status: 'maintenance' });
    assert.equal(r.status, 403);
    r = await api('DELETE', `/sensors/${sensorId}`, TOK_STRANGER);
    assert.equal(r.status, 403);
    r = await api('GET', `/sensors/${sensorId}/impact`, TOK_OWNER);
    assert.equal(r.status, 200, 'el sensor debe seguir existiendo tras los 403');
  });

  it('DELETE con mapping vivo -> 409 con impact; ?force=true -> 200 con warnings', async () => {
    // Mapping en memoria del scheduler (setLastTopology tambien intenta
    // Redis, que cuelga aqui: se llama sin await, el in-memory ya aplica).
    // La topologia minima evita que el sanitize ANTI-FANTASMA lo descarte.
    const sched = require('../services/mpcScheduler');
    sched.setLastTopology({ sources: [{ id: 'nodo_p5' }] }, { nodo_p5: sensorId });
    const { authorizedSensors } = require('../helpers/securityManager');

    let r = await api('DELETE', `/sensors/${sensorId}`, TOK_OWNER);
    assert.equal(r.status, 409);
    assert.ok((r.json.impact?.nodos || []).some((n) => n.nodeId === 'nodo_p5'), 'impact debe declarar el mapping');

    r = await api('DELETE', `/sensors/${sensorId}`, TOK_OWNER, undefined, '?force=true');
    assert.equal(r.status, 200);
    assert.ok((r.json.warnings || []).length > 0, 'el borrado forzado declara warnings');
    assert.ok(!authorizedSensors.has(sensorId), 'la lista blanca ya no lo contiene');
    sched.setLastTopology(null, null);
  });

  it('DELETE archiva lecturas (_deleted_*) en vez de dropear', async () => {
    const reg = await api('POST', '/register_sensor', TOK_OWNER, { name: `p5_test_arch_${Date.now()}`, type: 'solar' });
    assert.equal(reg.status, 201);
    const id2 = String(reg.json.id_sensor);
    createdIds.push(id2);
    await mongoose.connection.db.collection(id2).insertOne({ createAt: new Date(), v: 1 });

    const r = await api('DELETE', `/sensors/${id2}`, TOK_OWNER);
    assert.equal(r.status, 200);
    assert.equal(r.json.archivadas, 1);
    assert.ok(String(r.json.archivo || '').startsWith(`_deleted_${id2}_`));
    createdArchives.push(r.json.archivo);

    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    assert.ok(!names.includes(id2), 'la coleccion original ya no existe');
    assert.ok(names.includes(r.json.archivo), 'el archivo existe');
    assert.equal(await mongoose.connection.db.collection(r.json.archivo).countDocuments(), 1);
  });
});
