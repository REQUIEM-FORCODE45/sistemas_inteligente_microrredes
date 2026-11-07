# VERIFICACIÓN — Panel de validación en el SLD (V1/V2 + iTransformer solo)

Fecha: 2026-11-07. Método: código leído + ejecutado (Playwright, backend y
frontend en vivo, suite de tests). Sin cifras a mano; lo no medido se declara.

## Bloque A — validación en lazo (escenarios)

Endpoint nuevo `GET /front/optimization/validacion/summary`
(`Backend/services/validationSummaryService.js`, solo lectura de los
`resultado.json` versionados; sin redis, sin corridas): responde
`{available: true, v1, v2}` con `provider: "mos"` en ambos.

El panel (`ValidationPanel`, pestaña del SLD "Resultados MPC") muestra:
- V1: isla 3 días estrés 08-03/04/05, banda C — por día y total
  (ENS 11.534 vs 14.857, Δ −3.323 kWh/−22.4 %; costo −0.19 % total).
- V2: red 1 día — grid10 −3.44 %/ENS −7.84, grid30 −3.59 %/ENS −6.26
  (signo invertido vs PatchTST, declarado).
- Cabecera: provider mos (boosters v2 causales, viento m/s) + nota de que
  el iTransformer solo y el MOS son salidas diferentes.
- Pie: "De dónde sale cada número" con las rutas a los artefactos.

La versión PatchTST (`fase_1/`) queda como histórico versionado: no se
borra, no se muestra como vigente. El Exp A de 14 días (proveedor no
declarado, pre-correcciones) ya no se muestra en ningún panel.

## Bloque B — pronóstico por componente (iTransformer solo)

El MOS es iTransformer + corrector LightGBM: sus números no son los del
iTransformer solo, y el usuario pidió verlos separados. Se reutilizan los
componentes existentes (`ForecastMetricsTable/MaeChart/OverlayChart/
SkillChart`, genéricos por contendiente) con los endpoints de comparativa
ya cableados. El endpoint filtra `patchtst` del detalle/resumen/series/
skill (archivos canónicos intactos como evidencia histórica).

Leyendas verificadas por DOM: curvas
`climatology/ecmwf_crudo/itransformer/mos/persistence`; overlay
`real (ERA5)/mos/itransformer/ecmwf_crudo`. 0 `pageerror`.

## Verificación

- Capturas versionadas (`reference/resultados/`, manifiesto con sha).
- `yarn build` ✓; `yarn eslint` en archivos nuevos/tocados sin errores
  nuevos (los de DashboardPage/DiagramEditor pre-existen en HEAD).
- Suites Python: `test_forecaster` + `test_mos_forecaster` + `test_solver`
  53/54 (1 fallo pre-existente en HEAD) + manifiestos/validación PASS.
- `fase_1/` y `fase_1_mos/` intactos (solo lectura).

---

## Ronda 2 (2026-11-07): panel solo-tablas + iTransformer en el WeatherCard

A petición del autor: el panel "Resultados MPC" muestra **solo** las tablas
V1/V2 (fuera pestañas curvas/barras/overlay, selects y tabla MAE — eso vive
en sus artefactos versionados). Y el WeatherCard del Dashboard añade
`itransformer` como tercera opción del selector (el endpoint ya lo resolvía;
cero cambios backend). Capturas `p1_weathercard_itransformer.png`
(selector con 3 opciones, badge `itransformer`, sparklines dibujadas) y
`sld_v1v2_solo_tablas.png` (V1+V2 sin pestañas). 0 pageerrors, build ✓.

---

## Ronda 3 (2026-11-07): carga fuera del stack en Dispatch Plan 24h

La carga (demanda) se saco del apilado: se dibuja como barra **azul
translucida** (`rgba(59,130,246,0.35)`, antes negro `#111827`) en un eje
espejo `y2` con `barmode: overlay`, para compararla contra la altura de los
suministros sin inflar la pila. Verificado en vivo con dispatch real:
trazas `Diesel/Red (import)/curtailment/ens/Solar` apiladas + `Carga`
con `yaxis y2` y `barmode overlay` (DOM), 0 pageerror.
Captura `p2_dispatch_carga_transparente.png`.

---

## Ronda 4 (2026-11-07): misma escala y1==y2 + subplot propio (x2,y2)

El eje espejo se auto-ajustaba solo (ilusión de déficit) y `barmode:
overlay` desapilaba los suministros (diésel 139.4 + red 100 dibujados
cada uno desde 0 en vez de pila 239.4). Fix: rango fijo común
`max(pila, carga) × 1.08` en y1 e y2; la carga vive en su subplot
`(x2,y2)` superpuesto con `matches: x`; `barmode: stack` siempre.
Verificado por DOM con dispatch real: rangos idénticos [0,324], pila
239.4 == carga 239.4 en h11, `barmode: stack`, 0 pageerror. La captura
`p2_dispatch_carga_transparente.png` se regenera (sha actualizado).
