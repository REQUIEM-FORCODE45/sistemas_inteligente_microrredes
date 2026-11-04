# 📋 PLAN DE CORRECCIÓN MPC + VISUALIZACIÓN EN INTERFAZ

**Repositorio**: `sistemas_inteligente_microrredes`
**Fecha**: 2026-08-26
**Auditoría base**: `informe.md` §7 + `optimization/solver/model_builder.py` + `experiments/*` + trazas `results/pasto_narino/experiments/expA_traces_*.csv`
**Estado**: PLAN — pendiente de aprobación para implementar (commit de respaldo antes de tocar nada)

---

## RESUMEN EJECUTIVO

El MPC (S-MPC) resuelve e integra correctamente (Redis/Node/React/Plotly), pero sus **resultados económicos del Experimento A están contaminados por 3 errores de formulación** que producen un arbitraje artificial (diésel nunca apagado → exportación a la red a tarifa pico → costo total NEGATIVO de −1.43 M COP y "mejora de 1,112%" vs HEUR que no son reales). Este plan corrige **todos** los errores (críticos, altos y leves) y añade **análisis de resultados en la interfaz gráfica** (hoy solo por consola).

### Errores y severidad

| # | Error | Severidad | Archivo(s) |
|---|---|---|---|
| E1 | Diésel sin binaria on/off (`lb=min_kw=50` permanente) → nunca se apaga | 🔴 CRÍTICO | `model_builder.py`, `config.py` |
| E2 | Exportación modelada como ingreso con la MISMA tarifa de importación → arbitraje diésel→red | 🔴 CRÍTICO | `model_builder.py`, `cost_functions.py`, `config.py`, `backtest.py` |
| E3 | Balance como `≥` sin ENS/curtailment → sobre-generación gratis | 🔴 ALTO | `model_builder.py`, `backtest.py` |
| E4 | Restricción no-anticipatividad (t=0 común) afirmada pero NO implementada | 🟠 MEDIO | `model_builder.py` |
| E5 | `--quick` dead code en `experiment_a.py` | 🟡 LEVE | `experiment_a.py` |
| E6 | `r.set()` duplicado en `run_once.py` | 🟡 LEVE | `run_once.py` |
| E7 | `degradation_cost_per_kwh = 0.02` COP/kWh (batería gratis de usar) | 🟡 LEVE | `config.py`, `cost_functions.py` |
| E8 | Escala de carga realizada ~3–7 kW vs nominal ~34 kW: sanity check pendiente | 🟡 VERIFICAR | `data_loader.py` (lectura) |
| E9 | Costo costo `(c+b·P+a·P²)·C_comb` confuso en unidades entre `metrics.py` (L) y `model_builder` (COP) | 🟡 DOC | `metrics.py`, `informe.md` |

---

## PARTE I — CORRECCIONES DEL SOLVER (Python)

### 🔴 E1 — Binaria on/off del diésel

**Archivo**: `optimization/solver/model_builder.py`

1. Añadir variable binaria (después de `model.P_diesel`):
```python
if num_diesel > 0:
    model.U_diesel = pyo.Var(pyo.RangeSet(0, num_diesel - 1), model.T, model.S,
                             domain=pyo.Binary)
```
2. Reemplazar el `setlb(min_kw)` (línea ~275) — el diésel pasa a poder apagarse:
```python
# ANTES (bug): model.P_diesel[di,t,s].setlb(d["min_kw"])
# DESPUÉS: 0..max con binaria que fuerza min_kw si encendido
model.P_diesel[di, t, s].setlb(0.0)
model.P_diesel[di, t, s].setub(d["max_kw"])
```
3. Añadir restricciones de acoplamiento (loop por di, t, s):
```python
model.add_component(f"diesel_min_{di}_{t}_{s}",
    pyo.Constraint(expr=model.P_diesel[di,t,s] >= d["min_kw"] * model.U_diesel[di,t,s]))
model.add_component(f"diesel_max_{di}_{t}_{s}",
    pyo.Constraint(expr=model.P_diesel[di,t,s] <= d["max_kw"] * model.U_diesel[di,t,s]))
```
4. **Costo corregido** (la pieza por tramos debe cubrir [0, max] y el fijo ir condicionado a U):
```python
# pts sobre [0, max_kw] con f_var = (b·P + a·P²)·C_fuel  (sin c)
pts = [float(p) for p in np.linspace(0.0, d["max_kw"], PW_DIESEL_N_PTS)]
vals = [(d["cost_b"] * p + d["cost_a"] * p**2) * d["fuel_cost"] for p in pts]
# DIESEL_COST = f_var(P)  →  se suma al objetivo:  + d["cost_c"]*d["fuel_cost"] * U_diesel[di,t,s]
# (así: apagado → 0; encendido a P=0 → ralentí c·C_fuel; encendido P>0 → c + bP + aP²)
```
5. En la función objetivo (`obj_rule`), sustituir `prob * m.DIESEL_COST[...]` por:
```python
total += prob * (m.DIESEL_COST[di, t, s_idx]
                 + diesel_devices[di]["cost_c"] * diesel_devices[di]["fuel_cost"]
                 * m.U_diesel[di, t, s_idx])
```
6. `variables` dict: añadir `"U_diesel": model.U_diesel if num_diesel > 0 else None`.

**Impacto esperado**: el diésel se apaga cuando sobra energía → desaparece el mínimo forzado de 50 kW nocturno y la quema inútil de 48.8 MWh/14d.

---

### 🔴 E2 — Tarifa de exportación separada (matar el arbitraje diésel→red)

**Archivos**: `model_builder.py`, `cost_functions.py`, `config.py`, `experiments/backtest.py`, `experiments/strategies.py`

**Problema**: `P_grid` es una única variable signada con costo `grid_d + grid_e·P_grid`; exportar (P<0) genera "ingreso" a la tarifa de importación (140 pico) → el solver compra diésel a ~56–110 COP/kWh y lo vende a 140 → −4.72 M COP de "ingreso" ficticio en 14 días.

**Solución (net-billing estándar)**: descomponer `P_grid = P_import − P_export` con tarifas distintas:

1. `config.py` — añadir al dict `grid`:
```python
"export_tariff": 0.0,   # COP/kWh (0 = no se paga inyección, caso Col.)
# o si se quiere net-billing: 0.15 * cost_variable (15%)
```
2. `model_builder.py`:
   - Reemplazar `model.P_grid` (Reals signados) por dos variables no negativas:
```python
model.P_import = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)   # ub = max_import_kw
model.P_export = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)   # ub = -grid_min
```
   - Balance E3 usa `P_import − P_export` donde antes iba `P_grid`.
   - Objetivo: `grid_d + grid_e[t]·P_import − export_tariff·P_export`.
   - (Opcional, refuerzo) Si `export_tariff == 0`: restricción `P_export[t,s] <= PV_esperado[t,s]·f_sobrante` para prohibir exportar energía de origen diésel; con export_tariff=0 el solver ya no tiene incentivo (exportar solo cuesta), suficiente.
3. `cost_functions.py` — actualizar `grid_import_cost`/`grid_export_revenue` (usar export_tariff real; docstring).
4. `backtest.py` (`cost_grid`) y `metrics.py` (`energy_exported_kwh`, costos): coherentes con la nueva descomposición:
```python
cost_grid = (MICROGRID["grid"]["cost_fixed"]
             + t * max(p_grid, 0)
             - export_tariff * max(-p_grid, 0))
```

**Impacto esperado**: desaparece el "ingreso" de −4.7 M COP; los costos del MPC vuelven a ser **positivos y realistas**.

---

### 🔴 E3 — Balance como igualdad con ENS/curtailment

**Archivos**: `model_builder.py`, `backtest.py`, `config.py`

1. `config.py` — en `grid` o nuevo bloque:
```python
"ens_penalty_cop_kwh": 5000.0,   # como en el MIP de la tesis
```
2. `model_builder.py` — variables:
```python
model.ENS = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)    # ub = load_max
model.CURT = pyo.Var(model.T, model.S, domain=pyo.NonNegativeReals)   # excedente vertido
```
3. Balance (sustituye `expr >= load_total`):
```python
expr = (diesel_total + grid_net + pv_kw + wind_kw
        + storage_discharge + model.ENS[t, s_idx]
        - storage_charge - model.CURT[t, s_idx])
model.add_component(f"balance_{t}_{s_idx}", pyo.Constraint(expr=expr == load_total))
```
4. Objetivo: `total += prob * (ens_penalty * model.ENS[t, s_idx])` (CURT sin costo, como vertido PV).
5. `backtest.py` `_grid_slack` → devolver también ENS real (`max(0, net − grid_max)`) y contarla como violación; mantener la semántica del CSV (`violation` = horas con ENS>0).

**Impacto**: balance exacto, ENS penalizada (el MPC prefiere diésel antes que apagón), curtailment explícito y visible — mismo lenguaje que la tesis.

---

### 🟠 E4 — No-anticipatividad en t=0 (afirmada pero ausente)

**Archivo**: `model_builder.py`

Añadir restricciones de primer período común entre escenarios (la decisión de la hora actual NO puede depender del escenario futuro):
```python
model.nonant = pyo.ConstraintList()
s0 = s_ids[0]
for t in (0,):
    for di in range(num_diesel):
        for s in s_ids[1:]:
            model.nonant.add(model.P_diesel[di, t, s0] == model.P_diesel[di, t, s])
    for s in s_ids[1:]:
        model.nonant.add(grid_net_var(t, s0) == grid_net_var(t, s))
        # idem P_charge, P_discharge, ENS, CURT por batería
```
(`grid_net_var` = `P_import − P_export` según E2; registrar también en `variables` para extracción.)

---

### 🟡 Leves

**E5 — `experiment_a.py`** (línea ~119): eliminar el `if args.quick:` redundante (ambas ramas crean el mismo provider); documentar `--quick` como alias de `--days 1` o borrar el flag.

**E6 — `run_once.py`** (línea ~70): eliminar el `r.set(f"{PROGRESS_PREFIX}{job_id}", "failed")` duplicado.

**E7 — Costo de degradación realista** — `config.py` (battery) y `cost_functions.py` (default):
```python
"degradation_cost_per_kwh": 200.0,   # ≈ 0.05 USD/kWh (LiFePO4), coherente con la tesis
```
(antes 0.02 → la batería era gratis y el MPC la ciclaba sin límite; con 200 COP/kWh el arbitraje valle→pico sigue siendo rentable: cargo 45 + 200·2 ≈ 445? → **verificar**: el término degradación entra como costo por kWh movido; si 200 COP/kWh lo mata el arbitraje, usar 20–50 COP/kWh calibrado. Ajustar en implementación con sensibilidad.)

**E8 — Sanity check de escala de carga/PV** — `data_loader.py` (solo lectura, sin cambios de código en este paso):
- Verificar `load_realized_demand('2026-07-18','2026-07-31')`: media/peak vs 34 kW nominal del sitio.
- Verificar `pv_real` max ~26 kW vs 50 kWp (¿julio nublado o sensor mal escalado?).
- Decisión documentada en `informe.md`: si el sensor está en kW reales pequeños, el experimento describe una microrred de ~10 kW pico — **declararlo explícitamente** en el paper (la tesis de la plataforma es site-agnostic, vale).

**E9 — Unidades de costo diésel** — `metrics.py` `diesel_liters` y `model_builder` cost_breakdown: unificar la fórmula documentada (L/h reales: `c+b·P+a·P²` con los coeficientes calibrados del sitio) y separar el `fuel_cost` (COP/L) en el informe.

---

## PARTE II — ANÁLISIS DE RESULTADOS EN LA INTERFAZ GRÁFICA

**Hoy**: el Exp A solo corre por consola (`python -m optimization.experiments.experiment_a --days 14`). La UI solo muestra el plan de despacho de 24 h del último job.
**Objetivo**: panel "Análisis Experimental" en la UI con: ejecutar/regenerar el Exp A, tabla de métricas por estrategia, costo acumulado, perfil horario medio y trazas por día — todo con Plotly, igual que el `DispatchSchedule` actual.

### Arquitectura (respeta el flujo existente: Node → Python → Redis → Socket.IO → React)

```
UI "Ejecutar Exp A" → POST /front/optimization/experiment/run
  → Backend: exec python -m optimization.experiments.experiment_a --days N (bg)
  → progress en Redis key optimization:expA_running / expA_updated_at
  → Socket.IO evento experiment_a_progress (opcional)
UI "Cargar resultados" → GET /front/optimization/experiment/summary
  → Backend lee results/pasto_narino/experiments/*.csv → JSON
  → React: tablas + 3 gráficas Plotly
```

### Backend (Node)

**Archivo NUEVO**: `Backend/services/experimentService.js`
| Función | Qué hace |
|---|---|
| `runExperimentA(days)` | valida que no haya otro corriendo (Redis `optimization:expA_running`), spawnea `python3 -m optimization.experiments.experiment_a --days N` (mismo patrón shell que `mpcScheduler` usa con run_once), marca running→completed al terminar |
| `getExperimentSummary()` | lee y parsea `expA_metrics.csv`, `expA_cumulative_cost.csv`, `expA_table.md` → `{strategies, metrics, cumulative, labels, last_run}` |
| `getExperimentTraces(strategy)` | `expA_traces_<s>.csv` → `{rows: [{timestamp, pv_real_kw, load_real_kw, diesel_kw, grid_kw, charge_kw, discharge_kw, soc_kwh, tariff, cost_total}]}` (filtra columnas compactas, máx 14×24 filas) |
| `getExperimentStatus()` | `{running, last_updated_at, days}` desde Redis |
| `runExperimentAOnce(days)` → usado por POST | wrapper con bloqueo |

**Archivo MODIFICADO**: `Backend/routes/Front.js` — 4 rutas nuevas (todas `validateJwt`):
```
GET  /front/optimization/experiment/summary      → {success, summary}
GET  /front/optimization/experiment/traces/:strategy → {success, traces}
GET  /front/optimization/experiment/status       → {success, running, last_run}
POST /front/optimization/experiment/run          → body {days?} → {success, started}
```
No se tocan las rutas existentes (`trigger`, `mpc-status`, etc.) → la UI actual no se rompe.

### Frontend (React)

**Archivo MODIFICADO**: `Frontend/GestionFront/src/Dashboard/store/optimization/optimizationSlice.js`
```js
// estado nuevo
experimentA: {
  summary: null,        // {strategies:[{id,label}], metrics: [...], cumulative: {...}}
  traces: null,         // {strategy, rows}
  running: false,
  lastRun: null,
  error: null,
},
// reducers: setExperimentSummary, setExperimentTraces,
//           setExperimentRunning, setExperimentError, clearExperiment
```

**Archivos NUEVOS** (en `Frontend/GestionFront/src/Dashboard/components/optimization/`):

1. **`ExperimentPanel.jsx`** — orquestador:
   - Header: "Análisis Experimental (Exp A)" + badge estado + botones **Ejecutar (14 días)** / **Recargar**
   - Tabs: `Métricas | Costo acumulado | Perfil horario | Trazas por día`
   - Consume Redux + `GridAPI` (`/front/optimization/experiment/*`) + escucha Socket.IO `experiment_a_progress`
2. **`ExperimentMetricsTable.jsx`** — tabla shadcn/ui (patrón existente) con las 8 columnas del CSV de métricas (estrategia, costo periodo, costo diario ± std, renovables %, ciclos/día, importación, diésel L, violaciones).
3. **`ExperimentCostChart.jsx`** — Plotly (`plotly.js-dist-min`, patrón `DispatchSchedule`): líneas de **costo acumulado** (x: días, y: COP) una por estrategia, colores por estrategia; anotación del % de brecha vs Oráculo.
4. **`ExperimentProfileChart.jsx`** — Plotly: **perfil medio horario** (barras diésel, grid/clip, líneas PV y carga) con `<select>` de estrategia (patrón figura de `experiment_a._write_figures`, convertido a componente).
5. **`ExperimentTraceChart.jsx`** — Plotly: traza del día seleccionado: SoC (línea, eje izq %), diésel+grid+PV (barras/líneas, eje der kW); selector de día (1..14) y estrategia.

**Archivo MODIFICADO**: `Frontend/GestionFront/src/Dashboard/components/diagram/DiagramOptimizationPanel.jsx`
- Añadir una **pestaña/sección "Análisis Experimental"** que renderiza `<ExperimentPanel />` junto a las secciones existentes (Plan de Despacho, SoC, Costos). Verificar la estructura del panel en implementación para insertarla sin romper el layout actual.

### Verificación de la Parte II

1. `yarn build` sin errores + `yarn lint`.
2. Subir Backend + Front: la pestaña aparece; "Ejecutar" lanza el Exp A (~2–4 min en la Raspberry; en dev, local); la UI muestra progress y al terminar la tabla + gráficas con datos reales.
3. Los números mostrados deben coincidir 1:1 con los CSV de `results/pasto_narino/experiments/` (prueba directa).

---

## PARTE III — ORDEN DE IMPLEMENTACIÓN Y VERIFICACIÓN

### Fases (cada una termina con commit)

| Fase | Contenido | Verificación |
|---|---|---|
| **0. Respaldo** | `git checkout -b fix/mpc-correcciones` + commit del estado actual | `git status` limpio |
| **1. Solver (E1–E4)** | binaria diésel, export_tariff, balance==ENS/CURT, nonant() | `python -m optimization.experiments.experiment_a --quick` → costos **positivos**, 0 violaciones, diésel se apaga de noche |
| **2. Leves (E5–E7)** | --quick, r.set dup, degradación 200 COP/kWh (ajustar por sensibilidad) | Exp A completo: batería cicla menos que antes |
| **3. Re-ejecutar Exp A** | `--days 14` (y Exp B con los tiempos: esperados similares, el MILP crece ~10% por binarias) | Tabla nueva con costos positivos; actualizar `informe.md` §7.1 (números, conclusiones y discusión del arbitraje eliminado) |
| **4. Sanity E8** | script de diagnóstico de escala (solo lectura) + nota en informe | Documentar escala real de sensores Mongo |
| **5. Backend visual (Parte II)** | experimentService + rutas | `curl` de las 4 rutas con token |
| **6. Frontend visual** | slice + 5 componentes + pestaña | `yarn build`, prueba manual E2E |
| **7. Doc final** | actualizar `informe.md` (sección de interfaz), `AGENTS.md` (nuevas rutas) y este plan → marcado ✅ | Revisión conjunta |

### Criterios de aceptación (lo que debe ser cierto al final)

1. El diésel pasa horas apagado (perfil con ceros) y **exportación en pico = 0** (o solo PV).
2. **Costo total del periodo > 0** para todas las estrategias (los −1.43 M COP desaparecen).
3. Violaciones = 0 y balance horario cerrado (`Σ gen + ENS = Σ carga + curtail` por hora).
4. "Mejora S-MPC vs HEUR" cae a un rango defendible (10–40%, no 1,112%).
5. La brecha S-MPC vs Oráculo sigue siendo pequeña (cota superior) — puede mantenerse ~0.27% o ajustarse.
6. La UI muestra tabla, costo acumulado, perfil y trazas **sin modificar el flujo existente** del plan de despacho 24 h.

### Riesgos
- **MILP más grande** (binarias U + nonant + ENS/CURT): el Exp B medirá el nuevo p95 (esperado < 1.5 s; margen aún > 600×).
- **Gurobi licencia gratuita (size-limit)**: si el modelo crecido excede el límite (~2,000 vars), el fallback HiGHS ya cubre (linealización por tramos ya implementada); considerar `solver: 'highs'` como default en producción.
- **Cambio de narrativa del paper**: los costos negativos/1,112% se eliminan → actualizar las conclusiones del informe (no reutilizar cifras viejas).
- **Escala del sensor Mongo** (E8): si la carga realizada es de otra magnitud, los resultados de Exp A describen otra microrred — declararlo en el paper en lugar de "arreglarlo" silenciosamente.

### Archivos NUEVOS (resumen)
```
Backend/services/experimentService.js
Frontend/GestionFront/src/Dashboard/components/optimization/ExperimentPanel.jsx
Frontend/GestionFront/src/Dashboard/components/optimization/ExperimentMetricsTable.jsx
Frontend/GestionFront/src/Dashboard/components/optimization/ExperimentCostChart.jsx
Frontend/GestionFront/src/Dashboard/components/optimization/ExperimentProfileChart.jsx
Frontend/GestionFront/src/Dashboard/components/optimization/ExperimentTraceChart.jsx
```

### Archivos MODIFICADOS (resumen)
```
optimization/solver/model_builder.py        (E1,E2,E3,E4)
optimization/solver/cost_functions.py       (E2,E7)
optimization/solver/run_once.py             (E6)
optimization/experiments/config.py          (E2,E3,E7,E9)
optimization/experiments/experiment_a.py    (E5, + reporte)
optimization/experiments/backtest.py        (E2,E3)
optimization/experiments/metrics.py         (E9)
Backend/routes/Front.js                     (Parte II)
Backend/services/mpcScheduler.js            (opcional: emitir expA_progress en el ciclo)
Frontend/.../optimizationSlice.js           (Parte II)
Frontend/.../DiagramOptimizationPanel.jsx   (Parte II)
informe.md / AGENTS.md                      (documentación)
```

---

*Este plan no modifica nada del repositorio por sí mismo; se implementa fase por fase tras aprobación.*