const mongoose = require('mongoose');

const getCollection = (sensorId) => {
  if (!sensorId) return null;
  const db = mongoose.connection.db;
  return db.collection(sensorId);
};

const parseNumericValue = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fetchLatestDocuments = async (sensorId, limit = 1) => {
  const collection = getCollection(sensorId);
  if (!collection) return [];
  try {
    return await collection
      .find({})
      .sort({ createAt: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error(`Error consultando la colección ${sensorId}:`, error.message);
    return [];
  }
};

const fetchLatestSnapshotsForSensors = async (sensorIds = [], options = {}) => {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 1;
  const snapshots = {};
  await Promise.all(
    sensorIds.map(async (sensorId) => {
      const documents = await fetchLatestDocuments(sensorId, limit);
      if (documents.length) {
        snapshots[sensorId] = documents;
      }
    })
  );
  return snapshots;
};

const pickNumericEntries = (document = {}, maxEntries = 4) => {
  const entries = [];
  const priorityKeys = ['PT', 'ST', 'QT', 'VB', 'VA', 'VC', 'IT', 'Fre', 'power', 'activePower', 'apparentPower', 'energy', 'voltage', 'current', 'temperature'];
  for (const key of priorityKeys) {
    if (key in document) {
      const numeric = parseNumericValue(document[key]);
      if (numeric !== null) {
        entries.push({ key, value: numeric });
        if (entries.length >= maxEntries) return entries;
      }
    }
  }

  for (const [key, value] of Object.entries(document)) {
    if (entries.length >= maxEntries) break;
    if (priorityKeys.includes(key)) continue;
    const numeric = parseNumericValue(value);
    if (numeric !== null) {
      entries.push({ key, value: numeric });
    }
  }

  return entries;
};

module.exports = {
  fetchLatestSnapshotsForSensors,
  pickNumericEntries,
  parseNumericValue
};
