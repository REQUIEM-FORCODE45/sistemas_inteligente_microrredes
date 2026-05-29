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
