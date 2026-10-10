# VERIFICACION — Cambio 08 · Física del MPC de producción

Evidencia **medida ejecutando**. Fecha: 2026-10-09.

## Implementado

- `optimization/solver/model_builder.py`:
  - `ramp_kw_per_h` leído del dispositivo (None = no declarada → sin rampa + warning).
  - Restricciones de rampa subida/bajada **entre períodos encendidos** (big-M con `U_diesel`); `t=0` usa `initial_diesel_kw` del job; arranque 0→mínimo permitido.
  - Precedencia `max_export_kw` > `-min_import_kw` + `grid_limits{max_import,max_export,source}`.
  - Binaria `U_grid[t,s]` **solo si `export_tariff > 0`** + nonant en `t=0`.
  - `cost_fixed` (COP/h) vs `cost_fixed_month` (COP/mes → /720); `cost_fixed_applied`; `warnings[]` en el resultado; `fixed` por hora + `fixed_total` en el desglose.
- `Backend/services/mpcScheduler.js`: `DEFAULT_TOPOLOGY` declara `ramp_kw_per_h: null` y `cost_fixed_month: null` (sin valores inventados); `getInitialDieselKw()` del ciclo previo → `initial_diesel_kw` en el job.
- `optimization/tests/test_solver.py`: +6 tests (rampa, warning, exclusión, precedencia, cargo fijo).

## Criterios

- [x] **C1** — `pytest tests/test_solver.py tests/test_complementarity_scenarios.py` → **19 passed**;
  2 fallos **preexistentes** (verificados vía `git stash` sin el cambio):
  `test_solve_optimal_con_dispatch` y `test_tarifa_horaria_toU_activa_arbitraje_bateria`.
- [x] **C2** — rampa 25: `P_diesel=[0,0,0,0,50,50,50,50]`; saltos entre encendidos ≤ 25 (el 0→50 es arranque permitido); sin warnings de rampa.
- [x] **C3** — Exp B 100 ciclos (modelo 24h×3esc): **con 08: p50 4.19 s / p95 4.69 s / 100-100 optimal**;
  sin 08: p50 4.24 s / p95 4.85 s → **sin degradación**.
  **Auditoría item 6 (causa raíz medida)**: el modelo tiene **2094 variables / 2036 restricciones**
  (792 binarias) y la licencia pip de Gurobi es *size-limited* (límite 2000) →
  `_try_gurobi` falla con `"Model too large for size-limited license"` y cae a **HiGHS**.
  Los **0.45 s publicados son Gurobi** (modelo entonces dentro del límite o licencia completa);
  **no reproducibles** con size-limited en este modelo. `solvers.py` ahora reporta
  `solver_usado` y `hardware_report()` el **solver efectivo** (antes decía "highs: fallback"
  de forma estática). Margen real vs ciclo 15 min: **185×** (conclusión intacta).

## Hallazgo abierto (b): Gurobi vs HiGHS — para el cambio 07 (no cerrar)

Con la licencia size-limited (límite 2000), el modelo de producción de 24 h
(**2094 vars / 2036 constr**, medido en esta máquina) **NO puede usar Gurobi** →
corre en HiGHS. La documentación dice "Gurobi principal, HiGHS respaldo" y en la
práctica es al revés para el job operativo. Cuantificado: Exp B p50 **0.45 s**
(Gurobi, publicado) vs **4.19 s** (HiGHS, medido). Al alinear lo declarado con lo
efectivo en el **cambio 07** (documentación).

## Evidencia de fallos preexistentes (auditoría item 7)

`evidencia_fallos_preexistentes.txt` (esta carpeta): `git worktree` de `8e8e2d3` (anterior a
los cambios) + `pytest tests/test_solver.py tests/test_complementarity_scenarios.py` →
**mismos 2 fallos**, 13 passed. Con los cambios: mismos 2 fallos, 19 passed.
- [x] **C4** — job sin campos nuevos: `objective 320.0` y `dispatch_plan` **idénticos** con/sin el cambio (comparación directa vía stash).
- [x] **C5** — sin rampa declarada, salto 0→50 kW en una hora permitido + `warnings: ["diesel_1: rampa no declarada, plan sin limite de rampa"]`. Defecto demostrado estructuralmente.

## 08.4 — Transitorios del generador (auditoría hallazgo 08-A)

**Limitación declarada**: la rampa se puede eludir apagando/encendiendo (el big-M libera la
restricción con `U=0`: 300→0 en una hora y vuelta a 50 en la siguiente no viola nada).
El modelo **nunca** penalizó ciclos — defecto **preexistente**, destapado por la rampa, no
introducido por el cambio 08. La convención 0→mínimo (arranque permitido) se mantiene.

**Implementado** (cero binarias nuevas): continuas `S[t]≥U[t]−U[t−1]`, `D[t]≥U[t−1]−U[t]`
(`t=0` usa el estado inicial); `objetivo += c_start·S (+c_stop·D)`. `start_cost`/`stop_cost`
son **dato del equipo**: sin declarar → sin penalización + warning. Contrato en topología
(`sources[].start_cost`), `DEFAULT_TOPOLOGY` con `null`, mapper + campo UI opcional.

- Producción (job 24h tipo Exp B): diésel encendido 21/24 h con **2 arranques y 1 parada** → pocos transitorios: basta penalización + esta declaración.
- Comportamiento medido (job 8h que cicla 4 veces): `start_cost=1e7` → **0 arranques** (mismo `dispatch` por lo demás); sin declarar → warning.
- `test_084_*` (3 tests): warning, reducción de arranques, **binarias idénticas** con/sin penalización.
- Coste de solve (HiGHS, 30 ciclos): estructura sola p50 **4.43 s** (≈ base 4.13 s: **cero coste**);
  con penalización activa p50 **9.63 s** (el paisaje cambia, no el tamaño) — margen vs ciclo 15 min: **~90×**.
- [x] **C6** — `cost_fixed=40`, 8 h: `fixed_total = 40×8×n_escenarios`, `fixed` por hora y `fixed_source=cost_fixed` en el desglose; el plan no cambia (término constante).
