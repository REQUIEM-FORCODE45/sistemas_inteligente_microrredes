# AGENTS.md

## Layout

```
Backend/          → Express 5 + MongoDB + Socket.IO + MQTT + LangChain agents
Frontend/GestionFront/ → React 19 + Vite + Redux Toolkit + ReactFlow + shadcn/ui
optimization/     → Python: predictor FastAPI + solver worker (Pyomo/Gurobi)
```

## Commands

### Lanzador de desarrollo (todo con un comando)

`./dev.sh` (raíz del repo) — arranca los 3 servicios de dev:

| Command | Notes |
|---------|-------|
| `./dev.sh` / `./dev.sh up` | Backend (`nodemon app.js` :3000) + Predicción (`uvicorn` :8000, con env de `Backend/.env`) + Frontend (`yarn dev` :5173) |
| `./dev.sh down` | Detiene los 3 (mata pidfile y listener real por puerto) |
| `./dev.sh status` | Estado de cada servicio |
| `./dev.sh logs [backend\|prediccion\|frontend\|all]` | Tail de logs (`.dev-logs/*.log`) |

Idempotente: si el puerto ya está en uso, adopta el servicio existente. Redis/Mongo no se tocan.

### Frontend (GestionFront)

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
| Prediction API | `uvicorn prediction.main:app --port 8000` (from optimization/) | 8000 | Clima→modelos→P10/P50/P90; .mat / TimesFM |
| Solver daemon | `python3 -m solver.main` (from optimization/) | — | Listens Redis, optional |
| Solver batch | auto-spawned by Node.js via `child_process.exec` | — | One-shot, always runs |

**Forecast providers** (`optimization/prediction/forecaster.py`, env `FORECASTER=openmeteo|timesfm|patchtst`):
- `openmeteo` (default): NWP Open-Meteo. Con `past_days=1` + corte `start_from_now` el índice **arranca en la hora actual** (Open-Meteo entrega desde 00:00 local).
- `timesfm`: TimesFM 2.5 (`google/timesfm-2.5-200m-pytorch`, CPU). Requiere `pip install torch --index-url https://download.pytorch.org/whl/cpu` + `pip install timesfm`. Contexto = histórico observado (Open-Meteo past_days, NO ERA5 → latencia) hasta la hora actual; salida anclada a `now`.
- `patchtst`: modelo multivariado de Pasto (72 h, P10/P50/P90) en `optimization/prediction/patchtst/` (`patchtst.py` + `targets.py` son fijos; viven junto a `patchtst_best.pt`, `target_specs.json`, `norm_stats.csv`, `pasto_narino.yaml`, `predict_72h.py`). Contexto = Open-Meteo `past_days` (NO ERA5 archive) hasta la hora actual, arranca en `now`; horizonte **máx 72 h** (RuntimeError si se piden más). Requiere `torch` (CPU 2.1M params, ~2 s por predicción).
- Los perfiles `.mat` (`matlab_predictor.py`) se entregan **desplazados cíclicamente a la hora actual** (`SITE_TZ`, default America/Bogota).
- TimesFM/PatchTST en CPU: primera llamada lenta (carga del modelo); timeouts del backend Node (mpcScheduler/predictionPipeline/Front.js) ya son ≥120s.

### Endpoints (Front.js — new)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/front/optimization/trigger` | Accepts `{topology, predictions?}` → enqueues + spawns solver |
| GET | `/api/front/optimization/status/:jobId` | Returns status + result from Redis |
| GET | `/api/front/optimization/results/latest` | Most recent optimization result |
| GET | `/api/front/optimization/mpc-status` | MPC scheduler status |
| GET | `/api/front/optimization/experiment/summary` | ExpA resumen (metrics, cumulative, table) |
| GET | `/api/front/optimization/experiment/traces/:strategy` | ExpA trazas por estrategia (rows compactas) |
| GET | `/api/front/optimization/experiment/status` | ExpA running/last_run desde Redis |
| POST | `/api/front/optimization/experiment/run` | Lanza ExpA (`{days}`) → bg exec python -m ... |
| GET | `/api/front/performance?reset=1` | Perf metrics (Exp C): latencies p50/p95/p99/max + throughput |

### Validation experiments (respuesta al revisor de la tesis)

Verificación de correcciones: `VERIFICACION_CORRECCIONES_MPC.md` + hist. correcciones `PLAN_CORRECCION_MPC.md`.

`optimization/experiments/` — los 3 experimentos pedidos por el revisor (ver `solutionComement_2911.md`):

| Script | Qué hace | Salidas |
|--------|----------|---------|
| `experiment_a.py` | Backtest lazo cerrado 14 días: S-MPC vs D-MPC vs HEUR vs MPC-PI (PatchTST + ajuste de datos, escenarios cuantil, receding horizon horario, tarifas ToU) | `results/pasto_narino/experiments/expA_*` |
| `experiment_b_solver_time.py` | ≥100 ciclos build+solve del MILP completo → p50/p95/p99/max + hardware | `expB_solver_times.csv`, `expB_hardware.json` |
| `load/load_mqtt.py` | Carga MQTT N msg/s a topics reales con `sent_ts` (latencia E2E en backend) | `/api/front/performance` |
| `load/load_rest.js` | 50 conexiones REST concurrentes (token: `load/mint_token.js`) | stdout JSON |
| `load/load_ws.js` | Latencia push WS sobre ciclos de optimización reales | stdout JSON |
| `load/sample_resources.py` | CPU/RAM de Node/uvicorn/redis durante la carga | `expC_resources.csv` |

- **Instrumentación**: `Backend/services/perfMetrics.js` (histogramas RAM + throughput 60s). Cableado en `mqttService.js` (ingest/insert/ws_push), `mpcScheduler.js` (ciclo E2E + solver desde `result.timing_s`).
- **Modelo**: `build_and_solve` ahora devuelve `timing_s: {t_build, t_solve, t_total}`.
- **Tarifa ToU horaria**: `model_builder.py` acepta `grid.cost_variable` como vector por hora (perfil completo) o escalar (broadcast). El backtest pasa el perfil ToU de `experiments/config.py`.
- **Complementariedad Ecs. 4-6**: binaria `Z[bi,t,s]` big-M en `model_builder.py` (carga/descarga excluyentes).
- **Escenarios cuantil**: `scenarios.py` defaults `Soleado=P90(0.2)/Nublado=P50(0.6)/Lluvia=P10(0.2)`; el balance usa la curva del cuantil del escenario si hay banda (fallback P10).
- **PatchTST con anchor**: `PatchTSTClimateForecaster.forecast(days, anchor=)` emite el pronóstico "como si fuera" una fecha pasada (contexto cacheado por instancia) — usado por el backtest.
- **Backtest con SOC propagado**: `backtest.run_day` pasa el SOC real del lazo a cada solve horario (`strategies._build_job(initial_soc=)`); el MPC-PI usa la serie realizada como forecast perfecto; `--initial-soc` fijo (default 0.65) para reproducibilidad.
- Tarifas ToU y microred del experimento: `experiments/config.py` (valle 45 / media 80 / pico 140 COP/kWh).

### Slice (optimization)

`src/Dashboard/store/optimization/optimizationSlice.js` — state: `{status, jobId, results, latestResult, error, mpc, experimentA:{summary,traces,running,lastRun,error}}`

### ExperimentPanel (nuevo, Parte II)

`ExperimentPanel.jsx` + 4 charts (`ExperimentMetricsTable/CostChart/ProfileChart/TraceChart`) en panel lateral `DiagramOptimizationPanel`. Consume `GET /front/optimization/experiment/*` y muestra tabla + costo acumulado + perfil horario + trazas por día (Plotly). Slice añade reducers `setExperimentSummary/Traces/Running/Error`.

### Correcciones MPC (2026-08-26, PLAN_CORRECCION_MPC.md)

* E1 diésel binaria `U_diesel` + `P_diesel∈[0,max]·U`, costo `c·fuel·U + (bP+aP²)·fuel` linealizado [0,max], antes `lb=50` permanente.
* E2 `P_grid` signado → `P_import/P_export` con `export_tariff=0` (no ingreso por inyección); antes arbitraje diésel→red a 140 COP/kWh.
* E3 balance `>=` → `==` con `ENS` (5000 COP/kWh) y `CURT` vertido; antes sobre-generación gratis.
* E4 nonant `t=0` para `P_diesel/U/P_import/P_export/P_charge/P_discharge/Z` (no `ENS/CURT`).
* E7 `degradation 0.02→30 COP/kWh` (antes batería gratis), `E5 --quick`, `E6 r.set duplicado`, `E9 diesel liters 0 si P=0`.

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

Currently `model_builder.py` hardcodes `"solar"`/`"solar_panel_ac"` and `"diesel"` in if/elif chains, and `"wind"`/`"wind_turbine"` como pasivo (desde la fase del aerogenerador). Any new source type needs its own branch. To make the solver fully data-driven, refactor to use a `model_type` field on each source:

| `model_type` | Behavior | Existing types |
|-------------|----------|---------------|
| `"passive"` | Power computed from predictions × params (not a Pyomo variable) | `solar`, `solar_panel_ac`, `wind` |
| `"dispatchable"` | Pyomo variable with min/max bounds + quadratic cost | `diesel` |

The `dispatch_plan` should emit entries per device using the `id` from topology (already done for diesel, fixed for solar, added for wind). New passive/dispatchable types would work with zero solver code changes — just add to `DEVICE_DEFINITIONS` + `TOPOLOGY_MAPPERS` frontend-side.

Notas viento: solo genera si hay sensor eólico enlazado (`predictions_wind_kw`/`band`; no hay perfil .mat de viento). `factor_wind` por escenario (Soleado 1.0 / Nublado 0.85 / Lluvia 0.7). El residuo N2 eólico usa features propias SIN `ghi` (`residual_features_wind`: wind_speed_100m/10m, presión, temp, temporales) — recalibrar el sensor eólico tras cambiar features (mismatch de columnas del GBR). El bloque **Inversor es solo visual** (no tiene mapper, no entra al solver). La batería enlazada a sensor bess usa el SOC predicho como `initial_soc`.

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
