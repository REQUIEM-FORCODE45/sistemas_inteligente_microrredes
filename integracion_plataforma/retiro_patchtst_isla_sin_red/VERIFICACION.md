# VERIFICACIÓN — Retiro de PatchTST + red acoplada al diagrama

Fecha: 2026-11-07. Método: código leído + ejecutado (Playwright, solver real,
suites de tests). Sin cifras a mano.

## P1 — panel de experimentos fuera del Dashboard

`DashboardPage.jsx`: eliminado el bloque `<ExperimentPanel>` y su import.
El resto del Dashboard intacto (ForecastComparisonPanel, WeatherCard con badge
MOS, DispatchSchedule, bandas). Verificado por DOM: `expPanel: false`,
`forecastPanel: true`, `weatherCard: true`, 0 `pageerror`
(`reference/resultados/c1_dashboard_sin_experimental.png`).
`ExperimentPanel.jsx`, endpoints `/front/optimization/experiment/*` y
`results/pasto_narino/experiments/expA_*` quedan como evidencia versionada
utilizable; solo dejan de salir en la página.
`docs/TRAZA_CIFRAS_CAPITULO.md` §7 ("lo que muestra el panel… no como
validación del MOS") queda ajustado aparte: el panel ya no muestra nada.

## P2 — sin bloque Red no se calcula la red (acoplado, no hardcode)

Causa raíz: `diagramToOptimization` inventaba `gridDefault`
(max_import 400 kW…) cuando el diagrama no traía Grid. Ahora:
frontend envía `grid: null`; `mpcScheduler` lo preserva (`?? null`);
el solver trata null como **isla forzada** (import/export 0, sin cargo fijo,
warning declarado en `warnings`). `{}` vacío mantiene el legado 400/300 con
aviso (compatibilidad, no silencio).

Verificado:
- UI: diagrama PV+carga sin Grid → aviso "Modo isla: sin bloque Red, la red
  no entra a la optimización" (`c2_aviso_modo_isla.png`, DOM `aviso: true`).
- Solver real con `grid: null`: `optimal`, dispatch sin `grid_import/export`,
  warning "isla forzada" presente, cargo fijo total 0.0.
- Tests nuevos en `test_solver.py` (isla forzada + legado `{}`), suite
  `test_solver.py` en su estado previo (1 fallo pre-existente en HEAD,
  `test_solve_optimal_con_dispatch`, sin tocar).

## P3 — PatchTST retirado, itransformer queda

Des-registrado de la factory (`_PROVIDERS` sin patchtst; la clase queda en
`forecaster.py` como referencia congelada), `_OPERATIVOS` sin patchtst
(`main.py`, docstrings actualizados), selector del dashboard sin la opción,
`forecastComparisonService` con `--providers mos,itransformer`,
`compare_providers` default `mos,itransformer` (figuras sin patchtst),
`ForecastMetricsTable` sin patchtst en contendientes.
`forecastColors.js` conserva la clave (paleta inerte para series viejas).
Tests: env-override ahora con `mos`; nuevo test documenta que pedir
`patchtst` cae a openmeteo. Suite: 53/54 (el fallo restante es el
pre-existente de `test_solver.py`).

Paquete y checkpoint congelados en `optimization/prediction/patchtst/`
(decisión del autor): no se borra nada, no es elegible.
Puertos de atrás intactos: `fase_1/` (PatchTST histórico) y comparativas
históricas no se tocan; build frontend ✓ 5.06 s; lint 0 errores nuevos
(los 4 de DashboardPage pre-existen en HEAD, verificado por stash).

## Evidencia versionada

`reference/resultados/` (capturas + manifiesto con sha completos).
