# VERIFICACION — Cambio 19 (Unifilar vivo, rendimiento de renderizado y gobernanza de datos)

Método: Playwright + Chromium headless shell (mismo harness/token de los cambios 12–16), escena sembrada (7 nodos, 6 ramas `powerEdge`, `dispatch_plan` horas 1..24), backend/frontend en vivo. Fecha: 2026-10-27.

## C1 — Plotly.react (sin purge+newPlot por update)

`purge` queda SOLO en el cleanup de unmount en los 5 componentes
(`PlotlyMini`, `ClimateChart`, `ForecastMaeChart`, `ForecastOverlayChart`,
`ForecastSkillChart`). Verificado: dashboard renderiza (`plot-container`/
`canvas`/`svg` presentes, 20 elementos), 0 `pageerror` en toda la sesión.
`yarn lint` de los archivos tocados: **0 errores nuevos** (los 2 de
`PowerEdge.jsx` y 1 de `SensorNode.jsx` pre-existen en `main`, verificado por
diff contra HEAD). `yarn build`: **✓ 6.24 s**. `test_solver_c6`: **6/6 OK**.

## C2 — Badges y estados siguen `horaMostrada`

Semilla con filas `solar 1..24 kW` y `load 100+h kW`; `setHoraMostrada(5|6)`:
- Nodo PV: badge `5kW` en h5 → `6kW` en h6. Nodo carga: `← 105kW` → `← 106kW`.
- Estados (`useCardStatus`) responden a la misma hora.
- **Hallazgo durante la implementacion** ( Alcance minimo, declarado): `data.id`
  no existe en los nodos de producción → `getNodeBadgeInfo(..., data.id, ...)`
  **nunca matcheaba** y los pills kW de nodo jamas se renderizaban (codigo
  muerto desde el prototipo). Se corrigio a `id` (igual que `useCardStatus`
  dos lineas arriba en los mismos archivos); sin esto C2 es inverificable.

## C3 — Seccionador solver refleja `schedule[hora-1]`

`topology.connections = [{id:'edge_inv1_load1', switch_mode:'solver', schedule:[1×23, 0 en h5]}]`:
glifo `#s-sw-o` presente en h5, `#s-sw-c` (×6, sin `open`) en h6. La rama
hereda apertura/cierre (`ramaAbierta`) del estado programado.

## C4 — Fallback SOCKET_URL

Literal unificado en los 3 archivos (`VITE_SOCKET_URL || localhost:3000 en
localhost || origin`). Verificado por lectura (el diff es la evidencia);
sin `.env` el handshake ya no apunta a `:5173/socket.io`.

## C5 — Índice `{ createAt: -1 }` (verificado en vivo)

Tras recarga del backend, ingesta real a `DataSensor/pasto_load` → el
índice `createAt_-1` **materializado** (`getIndexes` lo lista; antes solo
`_id_`). Nota: el endpoint `GET /sensors_data` usa el driver nativo (no
`getModel`); el índice se crea al primer ingest MQTT, no al primer GET.

## C6 — UTC nativo (verificado en vivo, commit aislado y revertible)

Probe de ingesta real ANTES del fix: `createAt` almacenado = ahora −5 h
exactos (10:39Z vs 15:39Z). Tras el fix: **desfase 0.5 min**. Commits
separados a proposito (`fix(mongo): C6 ... revertible en una pieza`): si el
C6 misbehavea, `git revert` de ese commit solo.
**ADVERTENCIA (declarada, no bloquea)**: discontinuidad de 5 h entre el
histórico (escrito con −5 h) y las lecturas nuevas. Los análisis versionados
(Fase 1) no se tocan; el próximo flujo que mezcle cola nueva + historia
(calibración) debe saberlo.
Fuera de alcance (mismo patrón, no tocado): `getColombiaDate` en
`Backend/data/models/Device.js` y `Usuario.js` (`createdAt`).

## Fluidez (chequeo de no-regresión, 1 par ON/OFF hasta 200 frames)

ON 19.8 fps ≥ umbral 16.86 del C0 re-basado (OFF 16.9 en este par; ruido de
1 par, declarado como smoke check, no como mediana C1/C2).

## Evidencia versionada

`reference/resultados/c19_verificacion_harness.json` (badges h5/h6, glifos,
fluidez del par, `pageerrors: 0`) + manifiesto con sha256 completos.
