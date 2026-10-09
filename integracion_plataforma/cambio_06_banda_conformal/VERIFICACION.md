# VERIFICACION — Cambio 06 · Banda de incertidumbre del MPC

Evidencia **medida ejecutando**. Fecha: 2026-10-09.

## Implementado

- `optimization/calibration/conformal.py`: **nuevo** `conformal_quantiles(residual, alphas)` (nada existente tocado).
- `optimization/calibration/calibrated_plant.py`: `__init__` acepta `band_q`; `predict_band` prioriza `band_q` (asimétrica) con `getattr` defensivo para `.pkl` viejos; `meta.calib_version="06.1"` (vía service).
- `optimization/calibration/service.py::_fit_solar`: **triple split disjunto** 60/20/20; k/params/GBR solo en ajuste; cuantiles del predictor FINAL en calibración; `coverage_holdout` + `ancho_medio_kw` medidos en holdout; `_summary_of` expone `band_q`.
- `optimization/tests/medir_cobertura_banda.py`: **nuevo** (portado de `reference/`, protocolo único A vs B).
- `optimization/tests/test_conformal.py`: +2 tests (`conformal_quantiles`, banda asimétrica heterocedástica).

## Criterios

- [x] **C1** — `pytest tests/test_conformal.py tests/test_calibration.py -q` → **11 passed**.
- [x] **C2** — `POST /predict/calibrate {solar, force:true}` → `status:ok, cached:false`,
  `band_q={q10:-0.051, q90:4.746, n_cal:72, split:disjunto, coverage_holdout:0.75, ancho_medio:4.80 kW}`.
- [x] **C3** — protocolo único, ventana 2026-07-24→08-07 (360 h generación):
  A (actual) 90.28% / ancho 4.57 kW · B (corregido) **69.44%** / ancho 4.68 kW,
  q10=−0.087, q90=+4.589, n_cal=72 (<100 → aviso de cuantiles ruidosos).
  El artefacto recalibrado midió en su propio holdout **75%** (≥0.72).
  **No se ajusta ningún número para pasar**: se reportan ambos.
  **06.3b NO aplicado**: con n_cal=72 los 3 estratos tendrían ~24 muestras (ruido); documentado, no intuido.
- [ ] **C4** — ⏸️ **DIFERIDO** al bloque final de validación (decisión del autor).
- [x] **C5** — `.pkl` viejo (sin `band_q`): `max|ΔP10| = 0.00e+00`, `max|dP90| = 0.00e+00` vs criterio actual.
- [x] **C6** — `results/pasto_narino/calibrated/pasto_solar_pv.json` incluye `band_q` y `coverage_holdout`.

## Nota de rollout

La recalibración `force=true` **reescribió** el artefacto de producción
(respaldo previo en `/tmp/opencode/cal_backup/`): el MPC del diagrama ya consume
la banda asimétrica. Los `.pkl` viejos siguen leyéndose idéntico (C5).
