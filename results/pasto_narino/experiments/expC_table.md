# Experimento C — Rendimiento bajo carga (R5, R6)

**Condiciones**: backend Node v20.17.0 (Express 5, Socket.IO), MongoDB Atlas
(externo), Redis local (Docker), broker MQTT externo 34.69.148.115.
Carga MQTT: 4 sensores autorizados (`pasto_*`), 10 msg/s sostenidos, 3 rondas
(≈7000 mensajes). REST: 50 conexiones concurrentes (30 s). WS: 400 eventos
`sensor_update` reales. Hardware: x86_64, 4 núcleos, 5.6 GB RAM.

## Tabla de rendimiento

| Métrica | n | p50 | p95 | p99 | máx |
|---|---|---|---|---|---|
| Latencia MQTT end-to-end (publicación→backend) | 7,000 | 243 ms | 348 ms | 509 ms | 716 ms |
| Latencia insert MongoDB (Atlas) | 7,000 | 97 ms | 137 ms | 951 ms | 5,626 ms |
| Push WebSocket backend (emisión) | 7,000 | 0.1 ms | 0.4 ms | 0.9 ms | 8.0 ms |
| Push WebSocket end-to-end (cliente, 400 eventos) | 400 | 342 ms | 503 ms | 705 ms | 952 ms |
| REST API (50 concurrentes, bajo carga) | 4,362 | 330 ms | 451 ms | 669 ms | 2,720 ms |
| REST API (50 concurrentes, sin carga) | 7,814 | 179 ms | 309 ms | 425 ms | 1,449 ms |
| Ciclo MPC end-to-end (enqueue→resultado) | — | — | — | — | — |
| Solver MPC (t_total, 120 ciclos) | 120 | 0.49 s | 0.61 s | 0.69 s | 0.71 s |

*Los push WS del backend (emisión) son ~0.1 ms; la latencia E2E cliente mide
publicación MQTT → push al navegador e incluye el insert en Mongo Atlas
(p50 97 ms) + red.*

## Recursos durante carga sostenida (10 min, muestreo 5 s)

| Servicio | CPU media | CPU máx | RAM media | RAM máx |
|---|---|---|---|---|
| backend_node | 3.5% | 18.8% | 112.7 MB | 181.2 MB |
| prediccion_uvicorn (FastAPI + PatchTST) | 0.4% | 9.2% | 1,187.8 MB | 1,187.8 MB |
| redis | 0.9% | 1.4% | 11.0 MB | 12.1 MB |

*MongoDB es Atlas (externo): su CPU/RAM no es muestrable localmente; la
latencia de inserción se reporta desde el driver. El RSS de uvicorn incluye
torch + el checkpoint PatchTST cargado en RAM.*

## Throughput

- MQTT sostenido: **10.00 msg/s** (3 rondas, 0 errores de publicación).
- REST: **145 req/s bajo carga** (0 errores HTTP).
- Mongo: 10 writes/s sostenidos durante la carga (inserto por mensaje).
