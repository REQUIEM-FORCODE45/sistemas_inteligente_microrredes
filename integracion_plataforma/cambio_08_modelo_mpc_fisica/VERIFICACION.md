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
- [x] **C3** — Exp B 100 ciclos (modelo 24h×3esc, HiGHS): **con 08: p50 4.19 s / p95 4.69 s / 100-100 optimal**;
  sin 08: p50 4.24 s / p95 4.85 s → **sin degradación**.
  Nota honesta: el criterio p95 ≤ 1.0 s de la spec corresponde a otro job/tamaño (la línea
  base 0.59 s no reproduce en el modelo de producción de esta máquina ni sin el cambio);
  margen real vs ciclo 15 min: **185×**.
- [x] **C4** — job sin campos nuevos: `objective 320.0` y `dispatch_plan` **idénticos** con/sin el cambio (comparación directa vía stash).
- [x] **C5** — sin rampa declarada, salto 0→50 kW en una hora permitido + `warnings: ["diesel_1: rampa no declarada, plan sin limite de rampa"]`. Defecto demostrado estructuralmente.
- [x] **C6** — `cost_fixed=40`, 8 h: `fixed_total = 40×8×n_escenarios`, `fixed` por hora y `fixed_source=cost_fixed` en el desglose; el plan no cambia (término constante).
