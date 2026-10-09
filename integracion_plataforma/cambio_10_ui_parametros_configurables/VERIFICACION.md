# VERIFICACION — Cambio 10 · Parámetros operativos configurables desde la UI

Evidencia **medida ejecutando** (mappers reales vía harness + captura). Fecha: 2026-10-09.

## Implementado

- `deviceTypes.js`: `rampKwPerH: null` (diésel), `degradationCost: 30` (batería),
  `costFixed: 40`, `costVariable: 60`, `tariffMode: 'hora'`, `maxExportKw/tou*: null` (red).
- `DiagramOptimizationPanel.jsx`: mappers diésel/red/batería con las claves nuevas;
  rampa y ToU **solo si declarados**; ToU → vector 24 h (6×valle, 13×media, 3×pico, 2×media);
  `tariffMode:'mes'` → `cost_fixed_month`; `max_export_kw` desde su clave con fallback 0.75;
  `export { TOPOLOGY_MAPPERS }` (1 línea, solo para verificación).
- `DeviceConfigPanel.jsx`: `OPTIONAL_PARAMS=['rampKwPerH']`, vacío → `null` (nunca 0),
  placeholder "sin declarar", etiquetas nuevas **con unidad**.
- `mpcScheduler.js`: `DEFAULT_TOPOLOGY` ya traía `ramp_kw_per_h: null` y `cost_fixed_month: null` (cambio 08); degradación usa el default del solver (30.0, idéntico al de la UI).

## Criterios

- [x] **C1** — captura del panel diésel: campo "Rampa diésel (kW/h) — dato del fabricante (opcional)" con placeholder "sin declarar".
- [x] **C2** — mapper batería con `degradationCost=200` → `degradation_cost_per_kwh: 200` (código real).
- [x] **C3** — rampa vacía → job **sin** clave `ramp_kw_per_h`; `rampKwPerH=25` → `25`. Nunca `0`.
- [x] **C4** — ToU 45/80/140 → `cost_variable` vector de **24** con perfil `[45,80,140,80]` en [0,6,19,23]; sin ToU → escalar `60`.
- [x] **C5** — diagrama sin claves nuevas → `degradation 30`, `cost_fixed 40`, `cost_variable 60`, export legacy 300 (idéntico a hoy).
- [x] **C6** — `grep cost_fixed`: mapper (:64), `gridDefault` (:108) y backend (:38) con el mismo `40`; `cost_fixed_month` en mapper (:68), backend (:42) y solver (2 sitios). Sin duplicados divergentes.
- [x] **C7** — `/predict/calibrated` devuelve `max_age_days: 30.0` (verificado en el cambio 09); `CALIBRATION_MAX_AGE_DAYS` lo gobierna.

## Nota

`tariffMode` es input de texto (`'hora'`/`'mes'`); el mapper solo activa mes con el valor exacto `'mes'`, cualquier otro → hora (comportamiento de hoy).
