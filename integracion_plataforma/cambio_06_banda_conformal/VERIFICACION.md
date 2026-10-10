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
- [x] **C3 — ALCANZADO con C adoptada**: cobertura holdout del artefacto activo **87.5 %**
  (≥0.72), `band_c` en el JSON. (Con B era 69.44 % → no alcanzado; ver historial abajo.)
  Protocolo único, ventana 2026-07-24→08-07 (360 h generación), JSONs versionados:
  `cobertura_06_2026-10-09_w30_s602020.json` y `..._w30_s503020.json` (esta carpeta).
  Dos ventanas (splits) × tres métodos, mismo holdout:

  | split | A (anterior, simétrica in-sample) | B (producción, asimétrica) | C (radio final + simétrica) |
  |---|---|---|---|
  | 60/20/20 (n_cal=72) | **90.28%** / 4.57 kW | **69.44%** / 4.68 kW | **87.50%** / 4.26 kW |
  | 50/30/20 (n_cal=108, sin avisos) | **90.28%** / 4.57 kW | **69.44%** / 4.62 kW | **88.89%** / 4.63 kW |

  B queda mal centrada (q10≈−0.05/−0.09, q90≈+4.6/+4.7: banda casi toda sobre el P50);
  C conserva la forma que funcionaba sin la fuga y **sí supera 0.72 en ambas ventanas**.
  El artefacto recalibrado midió en su propio holdout 75%.
  **No se ajusta ningún número para pasar.**
  **06.3b NO aplicado**: con n_cal=72 los 3 estratos tendrían ~24 muestras (ruido).
  **Decisión pendiente del autor**: 0.72 es criterio de cierre, no orden de cambiar producción;
  C se adopta solo con aprobación explícita (cambiaría la banda que usa el MPC).

## Adopción C como banda de producción (decisión del autor, 2ª ronda §7.5)

- `predict_band`: prioridad **C** (`conformal_radius_kw`, simétrica) > `band_q` (B, informativa);
  override `band_mode` (`"conformal_disjunto"` | `"cuantiles_asimetricos"`), default = artefacto.
- Artefacto activo: `meta.band_mode="conformal_disjunto"`; JSON con `band_mode`, `radius_kw=2.8389`
  y `band_c.coverage_holdout=0.875` (≥0.72 ✓ — **C3 alcanzado con C**).
- `.pkl` pre-06 (respaldo `/tmp/opencode/cal_backup/`): carga sin romper, `predict_band` OK y
  declara `band_mode: conformal_in_sample_legacy` (**A, no C** — por eso se recalibra).
- Mecanismo `band_mode` propagado por `ClosedLoopForecastProvider` y `--band-mode` de
  `experiment_a2_stochastic.py` (documentado en la spec §3.5).

## Efecto en el despacho C vs B (medición acotada, NO re-validación)

Mismo periodo (2026-07-24→26), misma ventana, SOC inicial 0.65, mismo forecast
(PatchTST, mismos anchors), S-MPC, **isla**, `--days 3`:
`expA2_daily_bandB.csv` (`--band-mode cuantiles_asimetricos`) vs
`expA2_daily_bandC.csv` (`--band-mode conformal_disjunto`).

| banda | costo total (COP) | costo normalizado (COP) | ENS (kWh) | diésel (L) | ancho medio (kW) |
|---|---|---|---|---|---|
| B (asimétrica) | 188,531.9 | 189,495.5 | 1.0899 | 1,559.5 | 2.3955 |
| C (conformal) | 185,233.6 | 187,929.6 | 0.0 | 1,590.2 | 2.7019 |

**Conclusión: C mejor** — −3,298 COP (−1.7 %), −1,566 normalizado, **ENS 0** vs 1.09,
a cambio de +30.7 L diésel (+2 %) y banda más ancha (+0.31 kW) en esta ventana.
La cobertura no es el único criterio: aquí la banda más ancha pagó con robustez.

## Hallazgo abierto (a): sobrecobertura sistemática — NO cerrar aquí

Los tres métodos dan **87–90 % con nominal 80 %** → la banda es más ancha de lo necesario
para lo declarado. Como el ancho le cuesta dinero al MPC (más reserva preventiva → más
diésel), la cobertura no es el único criterio. Línea abierta: cuantiles condicionales
por estrato (posibles con el split 50/30/20, n_cal=108) medidos en **más ventanas**.
Criterio correcto para decidir: **cobertura ≈ nominal (80 %) al menor ancho** + efecto
en el despacho. No se cierra con una sola ventana.
- [ ] **C4** — ⏸️ **DIFERIDO** al bloque final de validación (decisión del autor).
- [x] **C5** — `.pkl` viejo (sin `band_q`): `max|ΔP10| = 0.00e+00`, `max|dP90| = 0.00e+00` vs criterio actual.
- [x] **C6** — `results/pasto_narino/calibrated/pasto_solar_pv.json` incluye `band_q` y `coverage_holdout`.

## Nota de rollout

La recalibración `force=true` **reescribió** el artefacto de producción
(respaldo previo en `/tmp/opencode/cal_backup/`): el MPC del diagrama ya consume
la banda asimétrica. Los `.pkl` viejos siguen leyéndose idéntico (C5).
