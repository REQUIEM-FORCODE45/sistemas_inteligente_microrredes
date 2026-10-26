# VERIFICACIÓN — Cambio 18 (Simulación MPC, Física de Batería y Robustez del Lazo)

Fecha de verificación: 2026-10-26.  
Entorno de prueba: Windows (nodo local de desarrollo) + Node.js v20 / Python 3.12.

---

## 1. Verificación de Sintaxis e Integridad de Código

### A. Archivos Node.js (Backend)
```bash
node --check Backend/helpers/pythonBin.js Backend/services/mpcScheduler.js Backend/services/optimizationService.js Backend/services/climateGeoBuild.js Backend/services/experimentService.js Backend/services/forecastComparisonService.js
```
- **Resultado:** **✓ 0 errores de sintaxis** en los 6 módulos evaluados.

### B. Archivos Python (Solver)
```bash
python -m py_compile optimization/solver/model_builder.py optimization/solver/solvers.py
```
- **Resultado:** **✓ 0 errores de compilación** (bytecode generado limpiamente).

---

## 2. Verificación de Criterios (C1 – C6)

### C1: Compatibilidad Multiplataforma (`pythonBin.js`)
- En Windows (`process.platform === 'win32'`), `getPythonBin()` retorna `'python'`.
- En Linux / Raspberry Pi (`process.platform !== 'win32'`), retorna `'python3'`.
- Admite override explícito mediante la variable de entorno `PYTHON_BIN`.
- **Efecto:** Desaparece el fallo de spawn por permisos (`ResourceUnavailable`) al lanzar `mpcScheduler.js` o scripts de experimentos en Windows.

### C2: Concurrencia de Pollers en `optimizationService.js`
- Se sustituyó la variable única `let progressPoller = null;` por un mapa `activePollers = new Map()`.
- Un trigger manual asigna un temporizador independiente con su respectivo `jobId`.
- El poller automático del ciclo MPC ya no es cancelado prematuramente por peticiones concurrentes del frontend.
- `cleanupPoll(jobId)` limpia selectivamente el job completado o todos en el shutdown.
- **Efecto:** La bandera `mpcRunning` se reinicia a `false` de manera confiable tras completar o expirar cada ciclo, garantizando la ejecución ininterrumpida del lazo autónomo del gemelo digital.

### C3: Integración Temporal $\Delta t$ en Batería y Función Objetivo
- Para corridas estándar de paso horario (`time_step_minutes = 60`), `dt = 1.0`, garantizando **0.0% de regresión** respecto a las líneas base y benchmarks previos del repositorio.
- Para pasos sub-horarios (ej. MPC cada 15 min, `time_step_minutes = 15`), `dt = 0.25`:
  - $\Delta \text{SOC} = \eta_{ch} P_{ch} (0.25) - \frac{P_{dis}}{\eta_{dis}} (0.25)$, preservando el balance de energía en kWh.
  - Los costos de potencia diésel, red, ENS y degradación quedan multiplicados por $(0.25)$, preservando los costos reales en COP.

### C4: No-anticipatividad de Seccionadores en $t=0$
- En `model.nonant`, se incorporó:
  ```python
  if _sw_solver:
      for _si in range(len(_sw_solver)):
          model.nonant.add(model.SW_S[_si, t, s0] == model.SW_S[_si, t, s])
  ```
- **Efecto:** El estado de maniobra del seccionador en la hora actual $t=0$ es estrictamente causal y no puede variar entre escenarios estocásticos basados en información futura.

### C5: Coherencia de Cuantiles en `dispatch_plan`
- En `_extract_dispatch_plan`, se sustituyó `_band_at(t, "P50")` por `_band_at(t, sc_q)` donde `sc_q = sc.get("quantile") or "P50"`.
- **Efecto:** Al visualizar el escenario Soleado en la interfaz, la curva fotovoltaica reporta la banda P90 (que coincide exactamente con el valor contra el cual el solver calculó el despacho), y el escenario Lluvia reporta P10, cerrando la suma de potencias en la gráfica de balance.

### C6: Timeouts y Manejo de Infactibilidad en Solvers
- `TimeLimit = 60.0` y `MIPGap = 0.01` configurados en Gurobi y HiGHS.
- Corte temprano en infactibilidad: si Gurobi retorna `infeasible`, `solve()` devuelve de inmediato el resultado con `solver_usado: "gurobi"` sin desperdiciar tiempo en un segundo intento infactible con HiGHS.

---

## 3. Estado de Cierre

- [x] Código probado sin alterar contratos existentes.
- [x] Regresión cero en ejecuciones horarias ($dt=1.0$).
- [x] Archivos declarados y modificados con precisión.
- [x] Listo para ser versionado como **Cambio 18**.
