# VERIFICACION — Cambio 12 · Cadena de confianza del diagrama

Evidencia **medida ejecutando** (comando + valor). Fecha: 2026-10-11.
Alcance ejecutado: **12.1–12.3 + migración/valor efectivo de 12.4**.
Símbolos SVG y barra AC quedan para el siguiente envío (sin referencia visual).

## Implementado (líneas declaradas)

- `optimization/solver/topology_schema.json` (**nuevo**): params aceptados/obligatorios
  por tipo + `inverter`/`sensor_iot` con `soportado:false` y motivo.
- `optimization/solver/model_builder.py`: `load_topology_schema()` + `build_device_echo()`
  + `_build_device_echo_checked()`; `devices` en job/builder; `fuel_origen` por diésel;
  `device_echo` en `variables` y en el resultado; validación `req:true` con aviso por `device_id`.
- `optimization/tests/test_topology_schema.py`, `test_mapper_coverage.py`,
  `test_device_echo.py` (**nuevos**).
- `Frontend/.../diagram/constants/deviceTypes.js`: `PARAMS_SOLO_UI` (6 claves con motivo),
  `UNSUPPORTED_SOLVER_TYPES`, `migrateParams()` (exact-match legacy).
- `Frontend/.../diagram/DiagramOptimizationPanel.jsx`: `devices` en topología + pre-flight
  (marca, no bloquea) vía `utils/preflight.js` (**nuevo**).
- `Frontend/.../diagram/store/diagram/diagramSlice.js`: `setNodePreflight` + migración
  en `loadDiagram` (punto único de apertura).
- `Frontend/.../diagram/components/DeviceStatusBadge.jsx` (**nuevo**) + 1 línea en cada
  uno de los 9 nodos (`id` real como prop); firmas `{id, data, selected}`.
- `Frontend/.../diagram/components/DeviceConfigPanel.jsx`: línea de valor efectivo
  (eco o `/front/topology/fuel`) + aviso de migración; patrón de estado intacto.
- `optimization/prediction/main.py`: `GET /predict/site-fuel`.
- `Backend/routes/Front.js`: `GET /front/topology/fuel` (proxy con `validateJwt`).
- `Backend/services/mpcScheduler.js`: `devices: topology.devices || []` al job (aditivo).
- `nodeTypes`/`edgeTypes` siguen como constantes de módulo; cero escrituras a Redux en drag.

## Criterios medidos

- [x] **C1** — diagrama viejo con diésel `(0.001, 0.5, 0.5, 100)` → al abrir:
  params `{costA: 0.0012, costB: 0.24, costC: 1.8, fuelCost: null, migrated12: true}`;
  panel: `efectivo: 2.782 COP/L — sitio` + aviso de migración; inputs
  `["300000","50000","0.0012","0.24","1.8","","",""]`. Guardar → `fuelCost: null`
  persistido; reabrir → 6/6 nodos, sin `100`.
- [x] **C2** — mapper con `fuelCost: 3000` → payload
  `{"type":"diesel",...,"fuel_cost":3000}`; `build_and_solve` con `devices` →
  eco `diesel_1` = `modelado`, `fuel_cost: 3000.0`, `fuel_origen: "nodo"`;
  sin `fuel_cost` → `2782.0`/`"sitio"` (tests `test_device_echo.py`).
- [x] **C3** — `pytest tests/test_mapper_coverage.py` **PASS** (2 passed);
  con clave temporal `TEMP_SIN_MAPEAR` → **FAIL**
  (`AssertionError: ...solar_panel.TEMP_SIN_MAPEAR`); revertido → **PASS** (2 passed).
- [x] **C4** — `pytest tests/test_topology_schema.py` **PASS** (2 passed).
- [x] **C5** — lanzar con inversor: `preflight(inv_1) = {estado:"ignorado",
  motivo:"tipo sin modelo en el solver (ver cambio 13)"}`; badge `⚠ no simulable`
  en el lienzo; el envío sigue (`optError` solo por falta de backend en harness).
- [x] **C6** — eco con `{grid_1: error/forzado}` → badge `✕ error` sobre el nodo
  (captura `badges.png`); el motivo viaja en el resultado, no como error genérico.
- [x] **C7** — job de 6 dispositivos → `len(device_echo) == 6` con los 6 ids;
  `test_device_echo.py` **PASS** (5 passed).
- [x] **C8** — arrastre 200 pasos, mismo método antes/después:
  base 28.6 → después **26.2 / 26.1 / 27.5**; árbol limpio en la misma ventana:
  **24.1 / 24.9**. `nodeMutations` **50 = 50** siempre. La variación es ambiental
  (headless sin GPU); el árbol cambiado rinde **≥** el limpio en intercalado
  (25.1 vs 24.9). **PASA** (sin degradación atribuible).
- [x] **C9** — añadir (6 nodos) + editar + doble clic → `dispatchModalNodeId: "solar_1"`;
  guardar → `fuelCost: null` persistido; recargar + reabrir → 6/6 mismos ids.
  Sin pérdida ni reordenamiento.

## NO medido (declarado)

- El render del chart interno del `NodeDispatchModal` revienta en el harness dev
  (`TypeError` en `NodeDispatchSparkline.jsx:55`, `Plotly.react` indefinido).
  **Preexistente**: reproducido idéntico en worktree limpio del HEAD sin mis cambios;
  en un archivo que no toqué. El mecanismo de apertura (doble clic → `dispatchModalNodeId`)
  sí está verificado. En producción (build empaquetado) el modal está documentado como funcional.
- Endpoint Node `/front/topology/fuel` verificado por patrón + endpoint Python en vivo
  (`200`, bloque fuel correcto); sin backend con Mongo levantado no se probó el proxy HTTP.
- Símbolos SVG y barra AC: **no implementados** (referencia visual pendiente, según lo acordado).

## Tiempos de solver

Sin cambios de modelo: el eco añade solo construcción de dicts (no medible frente al solve).
Suite solver: `test_solver + device_echo + mapper_coverage + topology_schema + fuel_site` →
**29 passed**, 1 fallo preexistente documentado (`test_solve_optimal_con_dispatch`,
ver cambio 08). Frontend: lint 0 en tocados, `yarn build` ✓ 6.28 s.
