# Cambio 18 — Simulación MPC, Física de Batería y Robustez del Lazo

Este cambio resuelve las inconsistencias de simulación física en el solver MILP (Pyomo) y subsana las fallas críticas de concurrencia y portabilidad en el backend de Node.js que bloqueaban la ejecución autónoma del MPC.

---

## 1. Problemas Identificados y Solución

1. **Parámetro `time_step_minutes` ignorado en la física**:
   - `model_builder.py` recibía el paso temporal pero nunca lo aplicaba a la integral de estado de la batería ni a los costos por potencia horaria, asumiendo $\Delta t = 1.0\text{ h}$.
   - **Solución**: Incorporación explícita de `dt = float(time_step) / 60.0` tanto en la dinámica de carga/descarga ($\text{SOC}_t = \text{SOC}_{t-1} + \eta_{ch} P_{ch} \Delta t - \frac{P_{dis}}{\eta_{dis}} \Delta t$) como en la función objetivo (energía y cargos de potencia multiplicados por $\Delta t$).
2. **Bloqueo del lazo MPC por colisión de `progressPoller`**:
   - `optimizationService.js` utilizaba una variable singleton a nivel de módulo (`let progressPoller = null;`). Si un usuario disparaba una optimización manual durante un ciclo automático, el intervalo previo se cancelaba, el callback `onComplete` nunca se invocaba y `mpcRunning` quedaba permanentemente atrapado en `true`.
   - **Solución**: Migración a un registro concurrente `activePollers = new Map()` indexado por `jobId`.
3. **Incompatibilidad de ejecución en Windows (`python3` hardcodeado)**:
   - Los servicios de Node.js invocaban directamente `python3`, el cual en Windows redirige al alias de Microsoft Store con error de acceso denegado.
   - **Solución**: Creación del helper `Backend/helpers/pythonBin.js` con resolución multiplataforma (`process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')`).
4. **Falta de no-anticipatividad en seccionadores a $t=0$**:
   - En $t=0$, las variables de control estaban acopladas entre escenarios, pero `SW_S` estaba ausente, permitiendo que el solver abriera o cerrara un interruptor en el presente según el clima futuro.
   - **Solución**: Adición de `model.SW_S[_si, t, s0] == model.SW_S[_si, t, s]` en `model.nonant` para $t=0$.
5. **Cuantiles de escenarios en `_extract_dispatch_plan`**:
   - Al emitir el plan de despacho horario, el código forzaba la curva solar y eólica a `P50` para todos los escenarios, desalineando el balance de potencia visual en Soleado (P90) y Lluvia (P10).
   - **Solución**: Lectura del cuantil específico de cada escenario (`sc.get("quantile") or "P50"`).
6. **Protección y timeouts en solvers**:
   - Ni Gurobi ni HiGHS tenían límites de tiempo configurados; y si Gurobi declaraba un problema como `infeasible`, caía inútilmente a re-resolver el mismo modelo infactible en HiGHS.
   - **Solución**: `TimeLimit = 60s` y `MIPGap = 0.01` por defecto, detección y retorno temprano de infactibilidad comprobada, y aceptación de estados factibles por tiempo límite (`maxTimeLimit`).

---

## 2. Archivos Modificados

| Componente | Archivo | Modificación |
|---|---|---|
| **Backend** | `Backend/helpers/pythonBin.js` | **Nuevo**: Helper cross-platform para resolución de binario Python |
| **Backend** | `Backend/services/mpcScheduler.js` | Uso de `getPythonBin()` en spawn de solver `run_once.py` |
| **Backend** | `Backend/services/climateGeoBuild.js` | Uso de `getPythonBin()` en spawn de `build_clima_geo` |
| **Backend** | `Backend/services/experimentService.js` | Uso de `getPythonBin()` en spawn de `experiment_a` |
| **Backend** | `Backend/services/forecastComparisonService.js` | Uso de `getPythonBin()` en spawn de `compare_providers` |
| **Backend** | `Backend/services/optimizationService.js` | `activePollers` como `Map` concurrente por `jobId` |
| **Solver** | `optimization/solver/model_builder.py` | Factor $\Delta t$, no-anticipatividad de `SW_S` en $t=0$, cuantiles de escenario en `dispatch_plan` |
| **Solver** | `optimization/solver/solvers.py` | Timeouts (60s), tolerancia MIP (1%), corte temprano en infactibilidad |

---

## 3. Criterios de Aceptación (C1 – C6)

- [x] **C1**: Compatibilidad multiplataforma de spawn de Python sin errores de acceso denegado en Windows.
- [x] **C2**: `activePollers` tolera múltiples trabajos concurrentes sin sobrescribir temporizadores ni congelar `mpcRunning`.
- [x] **C3**: Dinámica de batería y función objetivo escaladas exactamente por $\Delta t = \text{time\_step} / 60.0$ (retrocompatible a $dt=1.0$ en corridas horarias).
- [x] **C4**: No-anticipatividad en $t=0$ cubre todas las binarias de maniobra de seccionadores (`SW_S`).
- [x] **C5**: `_extract_dispatch_plan` refleja el cuantil correspondiente de cada escenario (`P90`, `P50`, `P10`).
- [x] **C6**: `solvers.py` parametriza `TimeLimit` y corta inmediatamente ante infactibilidad demostrada.
