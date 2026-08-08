# AGENTS.md

## Layout

```
Backend/          → Express 5 + MongoDB + Socket.IO + MQTT + LangChain agents
Frontend/GestionFront/ → React 19 + Vite + Redux Toolkit + ReactFlow + shadcn/ui
optimization/     → Python: predictor FastAPI + solver worker (Pyomo/Gurobi)
```

## Commands

All from `Frontend/GestionFront/`:

| Command | Notes |
|---------|-------|
| `yarn dev` | Dev server (Vite HMR) |
| `yarn build` | Production build |
| `yarn lint` | ESLint |
| `yarn add <pkg>` | **Usar yarn** — recharts@2.10.0 forbids React 19 peers |

Backend runs on `http://localhost:3000` (Express). Redis via `docker compose up -d` (root, requires `--protected-mode no`).

## Optimization Pipeline (Python ←→ Node ←→ React)

```
┌──────────────────────┐      POST /api/front/optimization/trigger
│  React (Diagrama)    │ ←── con topology del diagrama unifilar
│  Panel lateral       │
└──────────────────────┘
         │ Socket.IO
         ▼
┌──────────────────────┐      HTTP GET /predict/solar  /predict/load
│  Node.js Backend     │ ←── a FastAPI prediction (port 8000)
│  mpcScheduler.js     │
│  optimizationService │ ←── Redis (BRPOP/listener)
└──────────────────────┘
         │
    Redis optimization:pending  /  optimization:result:<jobId>
         │
┌──────────────────────┐
│  Python solver       │  ←  Pyomo model builder → Gurobi (fallback HiGHS)
│  solver/run_once.py  │     Node.js spawns this automatically
│  solver/main.py      │     (daemon mode, optional)
└──────────────────────┘
```

### Python services

| Service | Command | Port | Purpose |
|---------|---------|------|---------|
| Prediction API | `python3 -m prediction.main` (from optimization/) | 8000 | Reads Irradiancia.mat / Consumo.mat |
| Solver daemon | `python3 -m solver.main` (from optimization/) | — | Listens Redis, optional |
| Solver batch | auto-spawned by Node.js via `child_process.exec` | — | One-shot, always runs |

### Endpoints (Front.js — new)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/front/optimization/trigger` | Accepts `{topology, predictions?}` → enqueues + spawns solver |
| GET | `/api/front/optimization/status/:jobId` | Returns status + result from Redis |
| GET | `/api/front/optimization/results/latest` | Most recent optimization result |
| GET | `/api/front/optimization/mpc-status` | MPC scheduler status |

### Slice (optimization)

`src/Dashboard/store/optimization/optimizationSlice.js` — state: `{status, jobId, results, latestResult, error, mpc}`

## Frontend architecture

### Stack
- **Bundle**: rolldown-vite 7.2.5, `@` alias → `./src`
- **Styling**: Tailwind CSS v4 (no `tailwind.config.js` — theme in `src/index.css` via `@theme inline` + CSS vars), shadcn/ui "new-york" neutral
- **State**: Redux Toolkit, store at `src/Authentication/store/store.js`, `serializableCheck: false` (sockets are stored)
- **Routing**: React Router v7, AppRouter in `src/router/AppRouter.jsx`, auth-gated
- **Auth**: JWT in `localStorage.sensor_token`, sent as `x-token` header

### Redux slices
Five reducers in `store.js`: `auth`, `ui`, `devices`, `diagram`, `optimization`

### JWT & auto-logout
`src/api/grid-api.js` has both request (inject `x-token`) and response interceptors. On 401, it calls a handler registered from `GestionApp.jsx` via `setAuthExpiredHandler(dispatch(logout))`. This avoids a circular dependency (`store → deviceSlice → grid-api → store`).

### Diagram editor (React Flow)
- Nodes: `src/Dashboard/store/diagram/diagramSlice.js` (Redux) for persistence
- **Drag animation**: `useNodesState` / `useEdgesState` from `@xyflow/react` for smooth local drag — NOT Redux nodes directly
- Sync direction: Redux → local state (on add/delete/load); local → Redux (on `onNodeDragStop`)
- `screenToFlowPosition({ x: event.clientX, y: event.clientY })` — pass viewport coords, NOT element-relative coords
- `fetchDevices()` is dispatched on DiagramEditor mount so SensorNode gets real MQTT devices
- **Nodes (7)**: SolarPanel, DieselGenerator, Grid, Inverter, Battery, Load, Sensor
- **Double-click on node** → opens dispatch chart modal via `dispatchModalNodeId` in diagramSlice
- **Single click** → opens DeviceConfigPanel (params editing), unchanged

### Device type system (dynamic — `deviceTypes.js`)

Central registry at `src/Dashboard/components/diagram/constants/deviceTypes.js`. Every device type has its full metadata in `DEVICE_DEFINITIONS`:

| Field | Purpose | Example |
|-------|---------|---------|
| `solverCategory` | Which solver input array it goes to | `SOLVER_CATEGORY.SOURCES`, `STORAGE`, `LOADS`, `GRID` |
| `solverType` | `type` string sent to the solver | `'solar'`, `'diesel'`, `'battery'` |
| `dispatchTypes` | Array of `{type, color, label}` for `dispatch_plan` output matching | `[{type:'grid_import', color:'#10b981', label:'Red (import)'}]` |

**Utilities** (all exported from `deviceTypes.js`):
- `getDispatchChartInfo()` → returns `{colors, labels}` maps for chart components. Used by `DispatchSchedule` and `NodeDispatchSparkline`.
- `getDeviceDispatchTypes(deviceType)` → returns `dispatchTypes` array for a given device type.
- `getNodeBadgeInfo(dispatchPlan, nodeId, deviceType)` → returns `{label, color}` for canvas node badges. Handles grid/battery special cases (multiple dispatch types, +/- prefixes).

**Adding a new device type** (e.g., wind turbine):
1. Add constant to `DEVICE_TYPE`
2. Add entry to `DEVICE_DEFINITIONS` with `solverCategory`, `solverType`, `dispatchTypes`, `defaultParams`
3. Add to `CATEGORY_META[SOURCES].types`
4. Add mapper function to `TOPOLOGY_MAPPERS` in `DiagramOptimizationPanel.jsx` (param → solver format)
5. Create node component, add to `DiagramCanvas.nodeTypes`

**No other files need changes** — charts, badges, node counts, and dispatch modal all read from `DEVICE_DEFINITIONS` dynamically.

#### Solver Python — still per-type (future: make generic)

Currently `model_builder.py` hardcodes `"solar"` and `"diesel"` in if/elif chains. Any new source type needs its own branch. To make the solver fully data-driven, refactor to use a `model_type` field on each source:

| `model_type` | Behavior | Existing types |
|-------------|----------|---------------|
| `"passive"` | Power computed from predictions × params (not a Pyomo variable) | `solar` |
| `"dispatchable"` | Pyomo variable with min/max bounds + quadratic cost | `diesel` |

The `dispatch_plan` should emit entries per device using the `id` from topology (already done for diesel, fixed for solar). New passive/dispatchable types would work with zero solver code changes — just add to `DEVICE_DEFINITIONS` + `TOPOLOGY_MAPPERS` frontend-side.

### Dashboard — optimization charts
When `optimization.latestResult` exists, the Dashboard tab renders full-width:
- `DispatchSchedule` (stacked bar chart, 24h) — colors/labels from `getDispatchChartInfo()`
- `CostCurve` (line chart, cost per hour)
- `BatterySOCChart` (SOC evolution)
- `ScenarioTabs` (stochastic scenario comparison)
- Top 4 stat cards: cost, peak total power, status, scenarios — all live from Redux

### Viewing optimization results
Results flow to **3 places** after a solver run:
1. **Dashboard tab** → big-picture charts (dispatch plan, cost, batteries, scenarios)
2. **NodeDispatchModal** → double-click a node → floating draggable modal with line chart of that node's specific 24h dispatch
3. **Canvas node badges** → small colored badges below each node showing current dispatch power (kW)

### Known quirks
- `Hooks/` lives at project root next to `src/`, not inside it
- ESLint ignores unused vars starting with `A-Z_`  
- Node.js ≥ 20.19 preferred (20.17 works but logs warnings)
- `fetchDevices` thunk is in `deviceSlice.js`, not `diagramSlice.js`
- React Flow v12 **does NOT export** `onNodeDoubleClick` — double-click implemented via timer in `handleNodeClick` (280ms threshold)
- Redux `diagramSlice.dispatchModalNodeId` stores the double-clicked node ID (separate from `selectedElement`)

## Backend (reference)

- Entry: `Backend/app.js`
- JWT middleware: `Backend/middleware/validateJwt.js` — validates `x-token` header, returns 401
- Token expiry: 2 hours (`Backend/helpers/jwt.js`)
- Frontend-facing routes: `Backend/routes/Front.js` (sensors + optimization), `Backend/routes/auth.js` (auth)
- MQTT integration: `Backend/services/mqttService.js`
- Dashboard agent: `Backend/services/dashboardAgent.js`
- MPC scheduler: `Backend/services/mpcScheduler.js` — auto-cycles every 15 min via `setInterval`
- Optimization service: `Backend/services/optimizationService.js` — Redis bridge + BullMQ queue + `pollProgress` (5 min timeout)
- ChangeStream service: `Backend/services/changeStreamService.js` — watches MongoDB for sensor inserts, retries every 30s with silent logging

### Redis / Docker
- `docker-compose.yml` requires `command: redis-server --protected-mode no`
- ECONNRESET from Docker bridge means protected-mode blocks connections — NOT a code bug
- `pollProgress` has 150 poll limit (5 min) then times out with `status: 'timeout'`

---

## Paper SIGE (LaTeX) — Estado actual (2026-08-08, revisado 2026-08-08)

### Working copy del paper
| Archivo | Propósito |
|---------|-----------|
| `paper_mdpi/EngPaper.tex` | **Versión canónica de trabajo** (formato MDPI). Copia de `PaperSIGE_Review.zip`. Se edita aquí. |
| `paper_mdpi/Definitions/` | Clase MDPI, .bst, .sty, logos. |
| `paper_mdpi/images/`, `paper_mdpi/ENGimages/` | Figuras referenciadas por el paper. |
| `paper.tex`, `paper.txt` | Versiones antiguas en raíz. NO tocar (legacy). |
| `analisis_observaciones_SIGE.md` | Observaciones del revisor (11 comentarios). |
| `refs.zip` / `PaperSIGE_Review.zip` | PDFs y fuente original del zip del revisor (en /tmp al extraer). |

> Nota: el paper promete TFT en la Introduction (líneas 47, 67, 126), pero el
> predictor TFT del código es un **stub** (`optimization/prediction/tft_predictor.py`
> devuelve `[0.0]*hours`). En producción el MPC usa `MatlabPredictor` (series históricas).
> Mantener cualquier corrección de código **independiente del TFT** salvo que el usuario lo indique.

### Correcciones del revisor — ejecutadas (sesión 2026-08-07)
Puntos corregidos punto por punto (uno a la vez, con confirmación): puntos 3, 4, 7, 10 (cerrados en código+paper) y 11 (cerrado salvo Gurobi MIQP real, que requiere licencia completa y queda "--"). Verificado 2026-08-08 que los textos de los puntos 4, 7 y 10 ya estaban escritos en `EngPaper.tex` (no eran pendientes de paper).
El punto 6 (Tabla 1) quedó excluido por decisión del usuario.

- **Punto 7 (referencia de resiliencia):** `bibitem{Han2026}` (Han et al., *J. Mar. Sci. Eng.* 2026, 14(9), 779) + cita `\cite{Han2026}` en literatura review (`EngPaper.tex` l.67) y `\bibitem` (l.398). Verificado 2026-08-08: `\cite`↔`\bibitem` resuelven. **CERRADO** (checklist I y IV).
- **Punto 4 (rate of change):** `Backend/services/analysis/strategies/RateOfChangeStrategy.js` reescrito — eliminada la falsa alarma por división-por-cero (noche, PV=0) y añadidos umbrales por variable (voltage ±10%, power/current ±50%, soc ±20%). Verificado 8/8. **Texto del paper YA ESCRITO** (`EngPaper.tex` l.171, ítem 2 "Rate of change"): documenta protección div/0 + umbrales por variable con justificación física. **CERRADO** (código + paper).
- **Punto 3 (complementariedad de batería):** `optimization/solver/model_builder.py` — variables binarias `Y_charge/Y_discharge` + restricciones de exclusión mutua. Ec.(4) en `EngPaper.tex` (l.155–160, Sección 2.1). **CERRADO**. Solve real no verificable aquí (Gurobi size-limited; HiGHS libre no resuelve MIQP).
- **Punto 10 (LLM seguridad):** `Backend/services/agent/llmSafety.js` (allowlist + verificación numérica + auditoría) conectado en `langgraphService.js` (l.2, 54–63, `validateAgentOutput` con `inputBounds` del sensor). **Texto del paper YA ESCRITO** (`EngPaper.tex` l.186): declara LLM estrictamente consultivo, fuera del camino de control, validación multicapa (allowlist + verificación numérica + auditoría). Verificado integración. **CERRADO en texto+código**. Falta el experimento cuantitativo que pidió el revisor (set ~50–100 eventos etiquetados + API key) — fuera de alcance sin datos/API.
- **Punto 11 (indicadores de rendimiento):** scripts en `optimization/benchmarks/` (`bench_solver.py`, `bench_mongo.py`, `bench_mqtt.py`, `bench_api.js`, `bench_ws.js`) + subsección "System performance" + `tab:performance` en `EngPaper.tex`. **Todo medido real 2026-08-08** (Backend corriendo en :3000; Mongo cluster remoto; broker MQTT remoto 34.69.148.115): MQTT p50=248.5/p95=295.4/p99=298.2 ms + 99.4 msg/s; MongoDB insert p50=1001.1/p95=2004.0 ms + 380.1 docs/s; Solver LP-relax (HiGHS) p50=24.8/p95=101.8 ms; WebSocket push (Socket.IO `optimization_started`, 20 eventos) p50=1.2/p95=1.4/p99=5.6 ms; REST API 10,770 RPS (p50 4 / p99 10 ms). Gurobi MIQP rechazado por licencia size-limited (confirmado empíricamente) → celda "--" como future work. **CERRADO salvo Gurobi MIQP.**

### Convenciones de estilo (ÉTICA IEEE — NO VIOLAR)
(mantener igual que antes)
1. **Lenguaje neutro, sin hipérboles.**
2. **Toda afirmación fuerte calificada** con condiciones/limitaciones/evidencia.
3. **Sin auto-elogios.**
4. **Métricas con contexto** (R²=0.744 → "sobre 20 días de datos", "muestra limitada").

### Referencias
- `Han2026` añadida y citada (ver Punto 7). Verificado 2026-08-08: `\cite{Han2026}` (l.67) ↔ `\bibitem{Han2026}` (l.398) resuelven.
- Las 5 añadidas previas (ref-alternar, ref-rao, ref-tasmant, ref-lami, ref-medicion) siguen vigentes.

### Figuras
Mismas que antes; `red_microrred_mpc.png` pendiente de subir.

### Agradecimientos
Universidad de Nariño, Facultad de Ingeniería, Programa de Ingeniería Electrónica, DRI.

---

## Backend — arranque robusto (sesión 2026-08-07)

- `Backend/app.js`: `startInfrastructure()` ahora envuelto en `try/catch` y loguea claramente si Mongo/MQTT/Redis fallan; **la API REST sigue viva** aunque los servicios caigan (graceful, sin crash por unhandled rejection).
- `Backend/data/database.js`: `MongoDatabase.connect` usa `serverSelectionTimeoutMS: 5000`, `socketTimeoutMS: 10000` y **propaga el error** (antes lo tragaba con `console.log`). Esto hace el arranque determinista y diagnósticable.
- MQTT broker está **hardcodeado** a `mqtt://34.69.148.115` en `mqttService.js` (IP externa de Google Cloud). Redis default `redis://localhost:6379` (vía `docker-compose.yml` solo sube Redis, no Mongo ni Mosquitto).
- Docker daemon en esta máquina está DOWN (sin sudo passwordless) → no se pueden levantar Mongo/Redis/Mosquitto locales aquí. Para benchmarks end-to-end usar entorno con docker + Gurobi completo.

## Benchmarks (optimization/benchmarks/)
| Script | Mide | Estado aquí |
|--------|------|-----------|
| `bench_solver.py` | Tiempo solve MPC (Gurobi / highspy / highspy-lp). `--solver highspy-lp` resuelve de verdad (LP relaxation). | EJECUTADO: p50≈24.8 ms, p95≈101.8 ms. Gurobi MIQP rechazado (licencia size-limited). |
| `bench_mongo.py` | Latencia/throughput insert MongoDB. | EJECUTADO con cluster remoto: p50=1001.1 ms, 380.1 docs/s |
| `bench_mqtt.py` | Latencia end-to-end + throughput MQTT. | EJECUTADO con broker remoto: p50=248.5 ms, 99.4 msg/s |
| `bench_api.js` | RPS/latencia API REST (autocannon). Resuelve deps desde `Backend/node_modules`. | EJECUTADO contra :3000: 10,770 RPS, p50=4 ms |
| `bench_ws.js` | Latencia push Socket.IO backend→frontend (evento `optimization_started`). Firma JWT de prueba con `SECRET_JWT_SEED` desde `Backend/.env` (no se imprime). | EJECUTADO contra :3000: p50=1.2 ms, p95=1.4 ms, p99=5.6 ms (20 eventos) |

Instalar deps: `pip install paho-mqtt pymongo` (mqtt/mongo); en `Backend/`: `npm install --save commander autocannon socket.io-client`. Nota: `socket.io-client` se instaló en esta sesión para el benchmark WS (modifica package.json/lock del Backend; reversible con `npm remove socket.io-client`).
