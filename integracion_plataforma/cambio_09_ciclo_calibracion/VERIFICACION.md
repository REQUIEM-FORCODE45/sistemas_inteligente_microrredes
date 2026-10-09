# VERIFICACION — Cambio 09 · Ciclo de vida de la calibración

Evidencia **medida ejecutando**. Fecha: 2026-10-09.

## Implementado

- `optimization/calibration/calibrated_plant.py`: `__init__` acepta `calibrated_at`, `baseline_rmse_kw`, `n_horas`, `source_window` (artefactos viejos: atributos ausentes → `getattr` defensivo en el resumen).
- `optimization/calibration/service.py::_fit_solar`: baseline = RMSE del predictor final en calibración; `source_window` de las mediciones.
- `service.py::fit_from_sensor(..., motivo=None)`: registro append-only en `history/<sensor>.jsonl` (motivo `manual` si force+existía, `missing` si no).
- `service.py::_summary_of`: expone `calibrated_at/age_days/stale/baseline_rmse_kw/n_horas/source_window` (`stale = age > CALIBRATION_MAX_AGE_DAYS`, default 30).
- **Nuevo** `optimization/monitoring/calibration_lifecycle.py`: `evaluate_drift()` (Mongo + ERA5 + `detect_drift` sin tocar `drift.py`), `should_recalibrate()`, `registrar_evento()`, `max_age_days()`.
- `optimization/prediction/main.py`: `/predict/calibrated` con antigüedad+`stale`+`max_age_days`+`recalibracion`; **nuevo** `/predict/calibration/drift`; **nuevo** `/predict/provider` (resuelto igual que `/predict/weather`).
- `optimization/tests/test_drift.py`: +4 tests (stale por edad, default 30, append-only, missing).

## Criterios

- [x] **C1** — `pytest tests/test_drift.py tests/test_calibration.py` → **13 passed**.
- [x] **C2** — `simulated_monitoring` con deriva a 30 días → `DriftState(drift=True, ratio=58.25, n=1080)`.
- [x] **C3** — `/predict/calibrated?sensor_id=pasto_solar_pv` → `calibrated_at` real, `age_days≈0`, `stale:false`, `baseline_rmse_kw=2.275`, `max_age_days=30`.
  Nota: el artefacto quedó recién recalibrado, por eso `stale:false`; la línea base de la spec (`stale:true` en artefactos de agosto) se verificó con `_summary_of` de 60 días → `stale:true`.
- [x] **C4** — `/predict/calibration/drift` con datos reales: `{rmse:2.059, baseline:2.275, ratio:0.90, drift:false, n:193}`.
- [x] **C5** — `history/pasto_solar_pv.jsonl` con **2 líneas**, motivos `manual`/`age` y `artifact_sha256` distintos (`b8b0c257…`/`db1416d5…`); nada sobrescrito.
- [x] **C6** — `/predict/provider` → `openmeteo_nwp`, idéntico a `/predict/weather`.

## Decisiones

- `/predict/calibrated` **no** evalúa deriva en línea (implicaría fetch ERA5 por llamada); expone `recalibracion` barato y la deriva vive en `/predict/calibration/drift`.
- El disparo automático **no** se activa (solo medir + avisar), por decisión declarada.
