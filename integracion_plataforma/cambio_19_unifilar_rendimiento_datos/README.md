# Cambio 19 — Unifilar Vivo, Rendimiento de Renderizado y Gobernanza de Datos

> **Documento de especificación y planificación de validación** (Agente Auditor).  
> **Ejecutor técnico asignado**: Agente en máquina virtual.  
> **Alcance**: React 19 (Diagrama / Unifilar / Plotly), Node.js (Socket.IO fallback), y MongoDB (telemetría MQTT).

---

## 1. Motivación y Problemas Identificados

Con el **Cambio 18** cerrado al 100% (física del solver, $\Delta t$, no-anticipatividad y solvers reproducibles), el motor de optimización opera de forma científicamente rigurosa. El **Cambio 19** aborda la capa de presentación interactiva, fluidez de renderizado y consistencia de los datos en la plataforma web:

1. **Destrucción y Recreación Ineficiente de Gráficas Plotly (`Plotly.purge` + `newPlot`)**:
   - Múltiples componentes (`PlotlyMini.jsx`, `ClimateChart.jsx`, `ForecastMaeChart.jsx`, `ForecastOverlayChart.jsx`, `ForecastSkillChart.jsx`) destruyen el contenedor SVG/DOM completo mediante `Plotly.purge(el)` y ejecutan `Plotly.newPlot(el)` en cada actualización de estado o resize.
   - **Impacto**: Parpadeo perceptible en el dashboard, fugas temporales de memoria y micro-congelamientos durante la interacción del usuario.
   - **Solución**: Adoptar el método idiomático de diffing en el DOM: `Plotly.react(el, data, layout, config)` durante actualizaciones de props, reservando `Plotly.purge(el)` exclusivamente para el desmontaje del componente (`cleanup` del `useEffect`).

2. **Desincronización Temporal entre Tarjetas del Diagrama y Cables (`horaMostrada`)**:
   - En el unifilar, el cable [`PowerEdge.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/diagram/edges/PowerEdge.jsx) actualiza su grosor, animación y badge de potencia según la hora seleccionada por el usuario (`hora = useSelector((state) => state.diagram.horaMostrada ?? 12)`).
   - Sin embargo, las tarjetas de los nodos ([`BatteryNode.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/diagram/nodes/BatteryNode.jsx), [`DieselGeneratorNode.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/diagram/nodes/DieselGeneratorNode.jsx), etc.) llaman a `getNodeBadgeInfo(plan, id, type)` y `useCardStatus(id, type)`, las cuales ejecutan `plan.find(...)` sin filtrar por hora.
   - **Impacto**: El primer match (`d.hour === 1`, hora cero/medianoche) se muestra de forma permanente. Si el operador mueve el slider a las 14:00 h, los cables muestran flujo solar activo, pero la tarjeta del panel solar sigue mostrando `0 kW` y estado `○ apagado`.
   - **Solución**: Parametrizar `getNodeBadgeInfo(dispatchPlan, nodeId, deviceType, hora)` y `useCardStatus(nodeId, deviceType, hora)` filtrando por `d.hour === hora`, logrando coherencia visual 100% síncrona en todo el lienzo unifilar.

3. **Inercia Visual en Seccionadores Controlados por el Solver (`SW_S`)**:
   - En [`PowerEdge.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/diagram/edges/PowerEdge.jsx), cuando un seccionador opera en modo solver (`switch_mode: 'solver'`), el componente detecta `topoSw.schedule`, pero no lee el valor programado para la hora mostrada (`topoSw.schedule[hora - 1]`).
   - **Impacto**: El glifo `#s-sw-c` (cerrado) permanece fijo independientemente de si el solver decidió abrir el interruptor en esa hora particular.
   - **Solución**: Leer el estado horario `topoSw.schedule[hora - 1]` y conmutar dinámicamente entre `#s-sw-o` (abierto) y `#s-sw-c` (cerrado) junto con el estado de conducción de la rama.

4. **Falta de Fallback en `SOCKET_URL` para Socket.IO**:
   - [`DiagramOptimizationPanel.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/diagram/DiagramOptimizationPanel.jsx), [`OptimizationPanel.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/optimization/OptimizationPanel.jsx) y [`RealtimeView.jsx`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Frontend/GestionFront/src/Dashboard/components/realtime/RealtimeView.jsx) declaran `const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;` sin fallback.
   - **Impacto**: En entornos locales de desarrollo donde no se declare explícitamente en `.env`, Vite intenta conectarse a `http://localhost:5173/socket.io/`, generando errores continuos `404 / Connection refused`.
   - **Solución**: Unificar el fallback estándar: `import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)`.

5. **Omisión de Índices en Colecciones Dinámicas de Telemetría (MongoDB)**:
   - En [`Backend/services/mqttService.js`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Backend/services/mqttService.js), cada nuevo sensor crea dinámicamente una colección en Mongo sin definir índices.
   - En [`Backend/controllers/Front.js`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Backend/controllers/Front.js), la API consulta lecturas históricas ordenando con `.sort({ createAt: -1 })`.
   - **Impacto**: Escaneos completos de colección (*COLLSCAN*) y ordenamientos en memoria (*sort memory limit*) a medida que la serie de tiempo crece.
   - **Solución**: Asegurar el índice descendente `{ createAt: -1 }` al instanciar el esquema en `getModel(sensorId)`.

6. **Doble Desplazamiento de Zona Horaria en Ingesta de Telemetría**:
   - En [`Backend/services/mqttService.js`](file:///c:/Users/2D/tesis-microrred/sistemas_inteligente_microrredes/Backend/services/mqttService.js), la función `getColombiaDate()` resta manualmente 5 horas (`offset = -5`) al objeto `Date`.
   - **Impacto**: Al insertarse en MongoDB (que serializa fechas en UTC estándar), se resta el offset dos veces (-10 h en lugar de -5 h), corrompiendo la correlación temporal entre telemetría MQTT y el pronóstico solar.
   - **Solución**: Persistir la fecha nativa en UTC (`new Date()`) en la base de datos, delegando el formateo regional al cliente/dashboard.

---

## 2. Archivos Afectados

| Componente | Archivo | Modificación Requerida |
|---|---|---|
| **Frontend** | `Frontend/.../charts/PlotlyMini.jsx` | Migrar de `Plotly.purge + newPlot` a `Plotly.react`; purge solo en unmount |
| **Frontend** | `Frontend/.../climate/ClimateChart.jsx` | Migrar a `Plotly.react` |
| **Frontend** | `Frontend/.../prediction/ForecastMaeChart.jsx` | Migrar a `Plotly.react` |
| **Frontend** | `Frontend/.../prediction/ForecastOverlayChart.jsx` | Migrar a `Plotly.react` |
| **Frontend** | `Frontend/.../prediction/ForecastSkillChart.jsx` | Migrar a `Plotly.react` |
| **Frontend** | `Frontend/.../constants/deviceTypes.js` | `getNodeBadgeInfo(dispatchPlan, nodeId, deviceType, hour)` filtrando por `hour` |
| **Frontend** | `Frontend/.../components/cardStatus.js` | `useCardStatus(nodeId, deviceType, hour)` filtrando por `hour` |
| **Frontend** | `Frontend/.../nodes/*.jsx` | Pasar `hora` (desde Redux `state.diagram.horaMostrada`) a `getNodeBadgeInfo` y `useCardStatus` |
| **Frontend** | `Frontend/.../edges/PowerEdge.jsx` | Evaluar `topoSw.schedule[hora - 1]` para el estado `#s-sw-o`/`#s-sw-c` del switch solver |
| **Frontend** | `Frontend/.../DiagramOptimizationPanel.jsx` | Fallback robusto en `SOCKET_URL` |
| **Frontend** | `Frontend/.../optimization/OptimizationPanel.jsx` | Fallback robusto en `SOCKET_URL` |
| **Frontend** | `Frontend/.../realtime/RealtimeView.jsx` | Fallback robusto en `SOCKET_URL` |
| **Backend** | `Backend/services/mqttService.js` | `schema.index({ createAt: -1 })` en `getModel()` y uso de UTC nativo `new Date()` |

---

## 3. Criterios de Aceptación (C1 – C6)

- [ ] **C1**: `Plotly.react` adoptado en `PlotlyMini` y gráficas climáticas/forecast. 0 destrucciones innecesarias de canvas durante re-renders.
- [ ] **C2**: Tarjetas de nodos en el lienzo unifilar reflejan la potencia y estado operativo coherentes con `horaMostrada` (desincronización resuelta).
- [ ] **C3**: Seccionadores en modo solver muestran su posición real de apertura/cierre para la hora consultada según `topoSw.schedule`.
- [ ] **C4**: Fallback de `SOCKET_URL` evita errores de conexión en desarrollo local si `VITE_SOCKET_URL` no está presente.
- [ ] **C5**: Colecciones dinámicas de sensores en MongoDB cuentan con índice `{ createAt: -1 }`.
- [ ] **C6**: Timestamps de telemetría MQTT se persisten en UTC sin desfase artificial doble.

---

## 4. Protocolo de Verificación para el Agente Ejecutor (VM)

El agente en la máquina virtual deberá verificar:

1. **Frontend Lint & Build**:
   ```bash
   cd Frontend/GestionFront
   yarn lint
   yarn build
   ```
2. **Backend Syntax Check**:
   ```bash
   node --check Backend/services/mqttService.js
   ```
3. **Pruebas de Integración y Regresión**:
   ```bash
   python -m unittest optimization.tests.test_solver_c6
   ```
4. **Documentación de Cierre**:
   - Generar `integracion_plataforma/cambio_19_unifilar_rendimiento_datos/VERIFICACION.md`.
