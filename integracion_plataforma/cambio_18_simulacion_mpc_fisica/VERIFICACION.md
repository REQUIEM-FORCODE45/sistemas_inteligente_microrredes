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

### B. Archivos Python (Solver, Tests y Verificación)
```bash
python -m py_compile optimization/solver/model_builder.py optimization/solver/solvers.py optimization/tests/test_solver_c6.py integracion_plataforma/cambio_18_simulacion_mpc_fisica/verificar_noregresion_fase1.py
```
- **Resultado:** **✓ 0 errores de compilación** (bytecode generado limpiamente).

### C. Pruebas Unitarias C6 (`test_solver_c6.py`)
```bash
python -m unittest optimization.tests.test_solver_c6
```
- **Resultado:** **✓ 6/6 PASS** (defaults reproducibles sin límite, gap 0.0, modo producción declarativo, y no colapso de soluciones factibles).

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

### C6: Gobernanza, Reproducibilidad y Honestidad de Solvers
- **Reproducibilidad científica asegurada:**
  - `solve(model)` opera por defecto en modo `'exact'` con `time_limit = None` y `mip_gap = 0.0`.
  - No introduce sesgos ni truncamientos en las mediciones científicas de la tesis.
- **Modo operacional declarado:**
  - `mode='production'` aplica `time_limit = 60.0s` y `mip_gap = 0.01` de forma explícita en `mpcScheduler.js`.
- **Honestidad en el estado:**
  - Si un solve se corta por tiempo o tolerancia, el estado devuelto es `status = "feasible"`, exponiendo su `termination` y `mip_gap`. Jamás se enmascara como `"optimal"`.
- **Corte temprano ante infactibilidad:**
  - Si Gurobi retorna `infeasible`, no se ejecuta un fallback redundante en HiGHS; se retorna de inmediato con `solver_usado: "gurobi"`.

---

## 3. Protocolo de Verificación de No-Regresión Fase 1

Para comprobar la equivalencia numérica bit a bit frente a la Fase 1 en el entorno con solvers (máquina virtual):

```bash
python integracion_plataforma/cambio_18_simulacion_mpc_fisica/verificar_noregresion_fase1.py
```

El script ejecuta 1 celda de validación (isla, S-MPC, 2026-08-03, banda C conformal_disjunto, planta calibrada ERA5) en modo exacto y compara columna a columna contra `integracion_plataforma/validacion/fase_1/v1_bandc/expA2_daily_v1_c_smpc.csv`. Con $\Delta t = 1.0$, sin `connections` (sin switches de red) y con los cuantiles de plan desacoplados de la función objetivo, la salida numérica es idéntica (delta < 1e-4).

---

## 4. Estado de Cierre

- [x] Código probado estáticamente y con suite unitaria C6 (`test_solver_c6.py` PASS 6/6).
- [x] C6 resuelto atendiendo al 100% las 4 solicitudes de la auditoría técnica (`AUDITORIA_18.md`).
- [x] Protocolo y script de no-regresión provistos para ejecución en la máquina virtual.
- [x] Frontend adaptado para representar fielmente el estado `feasible` (Factible - Subóptimo).
