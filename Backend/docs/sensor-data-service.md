# Sensor data service

`sensorDataService.js` es la capa encargada de encapsular todas las consultas que el agente necesita para trabajar con datos reales de los sensores. El objetivo es mantener aislada la lógica de lectura y normalización de Mongo, de forma que el resto del backend (controladores, agentes, sockets) nunca acceda directamente a las colecciones individuales.

## Responsabilidades

- **`fetchLatestDocuments(sensorId, limit)`**: apunta a la colección que lleva el nombre del sensor (`sensorId`) y devuelve hasta `limit` documentos ordenados por `createAt` decreciente.
- **`fetchLatestSnapshotsForSensors(sensorIds, { limit })`**: recibe una lista de IDs y obtiene el snapshot más reciente de cada uno; devuelve un mapa `{ sensorId: [documentos] }`.
- **`pickNumericEntries(document, maxEntries)`**: extrae las claves numéricas (prioriza `power`, `energy`, `voltage`, etc.) hasta `maxEntries`, útil para construir métricas legibles por el agente.
- **`parseNumericValue(value)`**: normaliza cadenas y números a un valor `number` limpio.

## Uso

- `dashboardAgent.js` importa estos helpers para formar el contexto del prompt y para asignar `liveSource`/`liveWindow` a los widgets.
- Si en algún momento otro servicio necesita acceder a las colecciones de sensores, debe hacerlo mediante nuevas funciones expuestas desde este archivo para no replicar la lógica de conexión/sanitización.

Mantener la lectura de datos centralizada facilita entender qué información tiene disponible el agente real-time y evita que rutas o sockets manipulen directamente el esquema dinámico de Mongo.
