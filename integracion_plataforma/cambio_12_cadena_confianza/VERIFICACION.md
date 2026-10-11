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
- [x] **C8** — **reformulado (auditoría cambio 12, corrección §8.2)**:
  la desigualdad anterior era FALSA (30.0 < 30.9) y los pares mostraban deriva por
  orden. Medición válida: **6 pares en orden ALEATORIO, misma sesión**
  (`fps_baseline.json`):

  | orden | árbol | fps | muts |
  |---|---|---|---|
  | 1 | pre | 22.9 | 50 |
  | 2 | vis | 21.4 | 50 |
  | 3 | vis | 22.7 | 49 |
  | 4 | pre | 21.6 | 50 |
  | 5 | pre | 22.6 | 50 |
  | 6 | vis | 22.1 | 50 |

  Medianas: **vis 22.1 vs pre 22.6 (−2.2 %)**. **Conclusión honesta: NO se detecta
  degradación >10 %** (es literalmente lo que 3 pares permiten afirmar con ruido
  ±10-15 % headless sin GPU); renders sin subir (50 constante).
  Hallazgo intermedio documentado: la capa `flow` animada en reposo costaba ~40 %
  en software; se oculta **solo durante el gesto** (`.rf-dragging`, cero JS, vuelve
  al soltar) en vez de aceptar el tirón.
- [x] **C9** — añadir (6 nodos) + editar + doble clic → `dispatchModalNodeId: "solar_1"`;
  guardar → `fuelCost: null` persistido; recargar + reabrir → 6/6 mismos ids.
  Sin pérdida ni reordenamiento.

## Declaraciones (auditoría cambio 12)

- **Límite del invariante (CORR 2)**: `test_mapper_coverage` es **estático** (regex sobre
  el JSX): valida que el mapper **mencione** `params.X`, no que lo incluya en el payload.
  Un mapper que lea y descarte pasaría. Declarado como **limitación conocida**, no defecto.
  Contrato añadido: `test_mapper_output_contra_schema` compara las **claves del payload**
  contra `topology_schema.json` (con `export_tariff`/`ens_penalty_cop_kwh` documentados como
  defaults del solver); **PASS** (3 passed en el archivo).
- **Eco sin `devices` (DECL 3)**: sin `devices` en el job, el eco cae en modo compatibilidad
  (reporta solo los grupos recibidos; **omite** lo ignorado, no miente). `DEFAULT_TOPOLOGY`
  ahora deriva `devices` de sus propios grupos (`defaultTopologyDevices`), así el bucle de
  producción siempre publica eco completo.
- **Proxy `/front/topology/fuel` (DECL 4)**: verificado end-to-end con backend vivo
  (Mongo Atlas): `GET /api/front/topology/fuel` con JWT → `200`
  `{"success":true,"site_id":"pasto_narino","fuel":{"price_cop_per_l":2782,...}}`;
  endpoint Python `/predict/site-fuel` → `200` con el bloque YAML.

## NO medido (declarado)

- El render del chart interno del `NodeDispatchModal` revienta en el harness dev
  (`TypeError` en `NodeDispatchSparkline.jsx:55`, `Plotly.react` indefinido).
  **Preexistente**: reproducido idéntico en worktree limpio del HEAD sin mis cambios;
  en un archivo que no toqué. El mecanismo de apertura (doble clic → `dispatchModalNodeId`)
  sí está verificado. En producción (build empaquetado) el modal está documentado como funcional.
- Símbolos SVG y barra AC: **no implementados** (referencia visual pendiente, según lo acordado).

## 12.4 visual — variante B (referencia copiada, no inventada)

- Símbolos: `constants/symbols.jsx` con los 9 paths **verbatim** + `SvgSymbolDefs` inyectado
  UNA vez en el lienzo; `SYMBOL_FOR_TYPE`/`CATEGORY_ACCENT` en `deviceTypes.js`.
  Ajuste declarado: `<use>` necesita `width/height` explícitos (sin ellos Chrome no pinta).
- `AcBusNode.jsx` + `ac_bus` en paleta (sección Buses): gradiente de 4 stops de la
  referencia, etiqueta `BUS AC · 220 V · 60 Hz`; **decorativo**: fuera del job, del eco
  y del pre-flight (documentado en `PARAMS_SOLO_UI`).
- Tarjetas (8 nodos de dispositivo): filete superior con acento, símbolo nuevo, píldora de
  estado **solo con datos reales** (`useCardStatus`: ▲/●/○ del `dispatch_plan`; sin datos
  no hay píldora); detalle (capacidad, eficiencia) y doble clic→modal intactos;
  **dimensiones y posiciones sin tocar**.
- `PowerEdge`: `getSmoothStepPath` ortogonal, `strokeWidth = flowWidthFor(kW)` calculado al
  recibir el resultado, capa `flow` duplicada (base tenue + animada), badge en el conector
  con `▲/▼` (`EdgeLabelRenderer` ya existente), rama abierta tenue/discontinua + `s=0`.
- CSS en `index.css`: `@keyframes edge-flujo` + `prefers-reduced-motion`.
- Captura 1920×1080 (`v124_final.png` en evidencia de sesión): filetes, símbolos, píldoras,
  ramas ortogonales con grosores distintos, badges `▲ 4.0/10.0/1.5 kW`, `s=0`, bus con gradiente.
- Desviaciones declaradas (el usuario las verá distinto al mockup estático): sin `use` sin
  dimensiones no hay render (arriba); tarjeta diésel muestra `sitio` en vez de `100` cuando
  `fuelCost` es null (corrige el `100` también en tarjeta); paleta conserva iconos lucide;
  trafo tiene símbolo pero **sin nodo** (llega en cambio 14); la barra aparece solo si el
  usuario la agrega (diagramas viejos intactos).
- **Cierre 12.4 (2026-10-11, decisión del autor)**:
  - **C1 — barra anclada**: `handleDrop` (`useDiagram.js`) crea el nodo con
    `draggable: !definition.decorative` → la barra nace con `draggable: false`
    (seleccionable sí). Motivo (decisión autor): descolocada sin aviso = esquema
    torcido. Verificado con arrastre real por CDP: bus (230,520)→(230,520)
    **inmóvil**, control diésel **sí** se mueve.
  - **C2 — barra fuera del panel de sensores**: `mappableNodes` (`SensorMappingPanel.jsx:36`)
    excluye `n.type !== DEVICE_TYPE.AC_BUS` junto al filtro de sensores. La captura muestra
    6 equipos en el panel (sin la barra): ofrecer un mapeo que el sanitizador filtra en
    silencio era el patrón que el cambio 12 combate.
  - **Nota c — ancho**: subido de 360 a **880 px** (el de la referencia, variante B):
    con los nodos repartidos, la barra corta dejaba derivaciones largas y se perdía
    lectura de unifilar (visible en la primera captura). Un píxel fijo basta por ahora;
    ancho por extensión ocupada queda diferido al cambio 13/14 si hace falta.
  - **Captura auditable**: `reference/figuras/cambio_12_4_unifilar.png` (1920×1080,
    en el manifiesto con bytes + sha256). Estado capturado: 7 nodos / 6 ramas /
    6 `use` de símbolo + bus con gradiente / badges `▲ 4.0` y `▲ 10.0 kW` /
    ramas `s=0` en el camino DC. Declarado: el camino DC (solar/inversor/batería)
    sale en `s=0` porque el inversor sigue siendo eco `ignorado` (solo visual) —
    **lo cierra el cambio 13** (inversor modelado). Sin errores de página, sin
    cintas rojas de validación (cableado AC→barra, DC→inversor→barra).
  - **Última del 12 (etiqueta)**: el badge de rama no-modelada pasó de `s=0` a
    **`sin modelo`** — `s=0` queda **reservado** al seccionador del cambio 15
    (`P <= M*s`); pintarlo en solar/inversor mentía (la rama puede conducir; lo no
    modelado es el otro extremo) y se contradecía con la píldora `▲ generando`.
    La captura versionada queda intacta a propósito (documenta el render del 12.4);
    el badge corregido se evidenciará en la captura del cambio 13.

## Tiempos de solver

Sin cambios de modelo: el eco añade solo construcción de dicts (no medible frente al solve).
Suite solver: `test_solver + device_echo + mapper_coverage + topology_schema + fuel_site` →
**29 passed**, 1 fallo preexistente documentado (`test_solve_optimal_con_dispatch`,
ver cambio 08). Frontend: lint 0 en tocados, `yarn build` ✓ 6.28 s.
