// deviceLookup.js — Lookup de AuthorizedDevice tolerante a ambos tipos de _id.
//
// El backfill sintetico crea dispositivos con _id STRING (pasto_*) mientras que
// los dispositivos existentes usan ObjectId. AuthorizedDevice._id esta tipado
// ObjectId en mongoose, asi que findById('pasto_weather') lanza CastError.
//
// findDeviceById:
//   - ObjectId valido  -> AuthorizedDevice.findById (fast path: populate/save OK)
//   - id string        -> consulta RAW a la coleccion (sin cast de mongoose)
//
// updateDeviceSharedWith: updateOne con el tipo correcto (para share/unshare
// sobre docs planos, donde .save() no esta disponible).
const mongoose = require('mongoose');
const AuthorizedDevice = require('../data/models/Device');

const isObjectId = (id) => mongoose.isValidObjectId(id);

async function findDeviceById(id) {
  if (isObjectId(id)) {
    return AuthorizedDevice.findById(id);
  }
  return AuthorizedDevice.collection.findOne({ _id: String(id) });
}

async function updateDeviceSharedWith(id, sharedWith) {
  const query = isObjectId(id)
    ? { _id: new mongoose.Types.ObjectId(String(id)) }
    : { _id: String(id) };
  return AuthorizedDevice.collection.updateOne(
    query,
    { $set: { sharedWith } },
  );
}

module.exports = { findDeviceById, updateDeviceSharedWith, isObjectId };
