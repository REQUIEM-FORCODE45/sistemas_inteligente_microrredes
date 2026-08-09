#!/usr/bin/env node
/* Menta un JWT de prueba con SECRET_JWT_SEED (Backend/.env) para los
 * load tests REST/WS del Experimento C.
 *
 * Uso: node load/mint_token.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const jwt = require(path.resolve(process.cwd(), 'Backend/node_modules/jsonwebtoken'));

const envPath = path.resolve(process.cwd(), 'Backend/.env');
let secret = null;
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^SECRET_JWT_SEED=(.*)$/);
  if (m) secret = m[1].trim();
}
if (!secret) {
  console.error('SECRET_JWT_SEED no encontrado');
  process.exit(1);
}
const token = jwt.sign({ uid: 'loadtest', name: 'loadtest', role: 'admin' },
  secret, { expiresIn: '2h' });
console.log(token);
