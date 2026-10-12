# VERIFICACION — CAMBIO 13 · inversor modelado + bus DC + propagación (F5)

> Default confirmado por el autor (2026-10-11): la microrred arranca AC, sin bus
> DC, todo opt-in. Con los defaults, los resultados anteriores NO cambian
> (probado: plan sin `converters` idéntico bit a bit al de antes, §C7).

## Transición PARAMS_SOLO_UI (la que el dueño pidió ver)

**Antes** (`deviceTypes.js`, cambio 12):
```js
'inverter.maxCapacity': 'tipo sin modelo en el solver (ver cambio 13)',
'inverter.efficiency': 'tipo sin modelo en el solver (ver cambio 13)',
```
**Después**: las dos líneas ELIMINADAS (con comentario que dice por qué dejarlas
sería mentir) + mapper `INVERTER` en `DiagramOptimizationPanel.jsx` que
referencia `params.maxCapacity`, `params.efficiency`, `params.bidirectional` y
`params.busDc`. `test_mapper_coverage` verde (si se quitan sin mapper, falla —
ese es su trabajo; si se dejan con mapper, el test pasaría declarando una
mentira). `UNSUPPORTED_SOLVER_TYPES` pierde la entrada `inverter` (queda solo
`sensor_iot`). `topology_schema.json`: el `{"soportado": false, ...}` pasa a
bloque con `params` (`eta`/`max_kw`/`bidirectional`/`bus_dc`, default
`eta: null`) + `if_missing`; `test_schema_inverter_sensor_declarados`
reescrito (el sensor sigue `false`).

## C1 · Conversión verificable (±1e-6, a mano, por hora y escenario)

`test_c1_conversion_exacta_por_hora_y_escenario` — η=0.97, banda exacta
(P10/P50/P90 = 10.0/20.0/30.0), 8 h × 3 escenarios = 24 filas `inverter`:
Soleado 29.1 / Nublado 19.4 / Lluvia 9.7, `|P_ac − 0.97·P_dc| < 1e-6` en las 24.
PASA.

## C2 · Límite respetado (el excedente no desaparece)

`test_c2_tope_limita_y_recorte_no_desaparece` — `max_kw: 50`, banda alta
(60/100/120): todo `inverter ≤ 50.0`; Nublado 100×0.97−50 = **47.0** aparece como
fila `curtailment` con `device_id: inv_1` (atribuido, no en una bolsa común).
PASA.

## C3 · η sin declarar: no convierte + eco + pre-flight. Cero invención

`test_c3_eta_ausente_no_convierte_y_lo_dice` — sin `eta`: eco `modelado` con
`eta: null`, `eta_origen: "no declarada"`; filas `P_ac = P_dc` exacto (paso
directo). Frente: `preflightNodes` marca `{estado:'aviso'}` (NO 'ignorado':
el equipo sí está simulado) y el badge lo pinta como **`sin η`** (mapeo nuevo
en `DeviceStatusBadge.jsx`); `PowerEdge.openEnd` solo abre con
`ignorado`/`error`, así que las ramas siguen mostrando sus kW (un aviso no es
una rama abierta — la lección del `s=0` del cierre 12.4). `eta` fuera de (0,1]:
warning + se trata como no declarada. PASA (solver+eco en test; marcas de
preflight/badge verificadas en código, mismo camino que el 12.2 ejercido al
lanzar — declarado en §No medido).

## C4 · Bus DC: balances por separado + panel AC = error atribuido

`test_c4_bus_dc_balances_por_separado` — `bus_dc: true`, 8 h × 3 escenarios,
auditoría desde el plan + PV recomputado de inputs (los `solar` del plan van en
base P50-display; el balance usa el cuantil del escenario):
DC `PV + descarga + rev == carga + puerta + vertido` y AC
`diesel + red + puerta + ENS == carga + CURT (+rev)` con tolerancia 0.01
(redondeo del plan a 3 decimales) en las 24 celdas. PASA.
`test_c4_panel_ac_en_bus_dc_error_atribuido` — panel AC con `bus_dc`: eco
`estado: "error"`, motivo con "bus DC"; su aporte al modelo y al plan es 0
(excluido, no adivinado); el inversor sigue `modelado` con `bus_dc: true`.
Frente: `preflightNodes` marca el panel AC con `estado: 'error'` si hay un
inversor con `busDc` (código). PASA (solver+eco en test).
Hallazgo de modelado (documentado, no tapado): el primer bus_dc salió
**infactible** — el balance DC no tenía holgura de recurso: con `P_inv_dc` y
batería atados en t=0 (nonant) y PV distinto por escenario, no cierra. Se añadió
`CURT_DC` de recurso (la misma razón por la que CURT/ENS lo son en AC), con fila
`curtailment` atribuida al inversor. El nonant t=0 de la puerta se verificó:
`P_inv_dc = 10.0` en los 3 escenarios a h1.

## C5 · Propagación (F5): orden y ancho

`test_c5_banda_conserva_orden_y_ancho` (etapa en serie): por hora
`P90 ≥ P50 ≥ P10` en AC y `ancho_AC = η·ancho_DC` ±1e-6 (20.0 → 19.4; caso con
números: Nublado h1 20.0 → **19.4**). `test_c5_puerta_bus_dc_aplica_eta_al_despacho`:
en bus_dc, `P_ac = η·P_dc_in` del despacho a 2e-3 (el plan redondea a 3
decimales; el mapa es exacto **por restricción** `P_ac = η·P_inv_dc`). PASA.
Matiz declarado: en bus_dc el ORDEN del despacho no está garantizado monótono
(el optimizador puede verter más en Soleado por economía); lo que se propaga
exacto es el mapa η (restricción), no la decisión económica.

## C6 · Eco completo

`test_c6_eco_modelado_con_efectivos` (+ C3/C4): `modelado` con `eta`,
`eta_origen`, `max_kw`, `bidirectional`, `bus_dc`. PASA. La prueba visible:
captura `reference/figuras/cambio_13_unifilar.png` — tarjeta sin "Solo visual",
sin badge "no simulable", píldora `▲ convirtiendo`, y rama inv→bus con
`▲ 9.7 kW` (= 0.97 × 10.0, la conversión en el cable).

## C7 · Sin regresión + ExpB medido (no asumido)

- Plan sin `converters` **idéntico bit a bit** al de antes del cambio
  (`plan_antes.json == plan_ahora.json`: 96 filas + mismo objetivo).
- Suite: **130 tests coleccionados** (pasa la colección). Corrida completa sobre
  126 (con 5 de inversor entonces): **121 passed** y **5 fallos pre-existentes
  verificados en HEAD limpio** (no son del 13): `test_backtest` ×3
  (`metricas_agregadas_consistencia`, `heur_regla_diesel_vs_red`,
  `costo_diesel_formula_exacta`), `test_complementarity...arbitraje_bateria`,
  `test_solver...optimal_con_dispatch`. Tras TODOS los cambios python, reruns:
  `test_inverter.py` 9/9, targeted (mapper/schema/echo/exp_b/solver/
  complementarity) 44 passed + los 2 pre-existentes, backtest 12 passed + los 3
  pre-existentes. Sin fallos nuevos en ningún lado. Razonamiento de cobertura:
  ningún test fuera de esos importa módulos cambiados (`model_builder`,
  `strategies`, `experiment_b`, `config`).
- ExpB (JOB 24 h, HiGHS — Gurobi size-limited cae a HiGHS en este entorno):
  solve intercalado 12+12: **sin 4.91 s vs con-serie 5.68 s**; build idéntico
  (0.71 vs 0.67). El serie NO añade variables/restricciones/binarias (serie
  medido: 2094 vars / 2036 constr / 792 bin) — el +0.8 s es numérico del solver,
  probado con control: mismo job sin inversor con banda pre-escalada ×0.97
  (mismos coeficientes, sin mi código) → **5.62 s**, igual que con-serie.
  bus_dc: +144 vars/+146 constr (puerta + CURT_DC), 4.10 s; bidir: +72
  binarias (U_inv), 4.47 s. Sin explosión (riesgo 1 de la spec contenido:
  binarias solo con `bidirectional: true`).
- Efecto declarado: ExpA/ExpB ahora incluyen el inversor (η=0.97 sobre el PV)
  por `strategies._build_job` + `experiment_b.JOB` + `MICROGRID["inverter"]`
  (spec fila 8). Los números publicados de ExpA anteriores quedan superados.

## C8 · Fluidez (misma metodología del 12, pares crudos)

6 arrastres intercalados, orden aleatorio (cur,pre,pre,cur,pre,cur), misma
sesión, worktree HEAD limpio (pre, :5211) vs árbol actual (cur, :5212):

| orden | árbol | fps | muts |
|---|---|---|---|
| 1 | cur | 11.0 | 77 |
| 2 | pre | 11.4 | 76 |
| 3 | pre | 11.5 | 75 |
| 4 | cur | 12.1 | 77 |
| 5 | pre | 12.5 | 77 |
| 6 | cur | 13.2 | 75 |

Medianas: **cur 12.1 vs pre 11.5 (+5 %, dentro del ruido)**; muts constantes.
**Sin degradación >10 % detectable.** Nota honesta: el nivel absoluto (~12)
está por debajo de la sesión del 12.4 (~22) por estado de la máquina (render por
software headless); lo que vale es la comparación misma-sesión, que es lo que
la metodología exige.

## Captura

`reference/figuras/cambio_13_unifilar.png` (1920×1080, 145992 bytes,
sha256 en `reference/README.md`): inversor modelado, sin badge, con píldora y
`9.7 kW` en el cable. Harness temporal borrado; vites y worktree limpiados.

## Decisiones (para el registro)

1. Batería fuera del inversor en 13.1 (sigue su hilo directo); al DC solo con
   `bus_dc: true`. Sin esto, el default cambiaba resultados (rompía C7).
2. `solar_panel_ac` ("AC con inversor", eficiencia ya incluida) NO pasa por la
   etapa: solo `solar` (DC). En bus_dc es error atribuido.
3. Panel AC excluido resuelve el resto (no se tumba el job); la atribución va
   en eco + warning + preflight.
4. Bidireccional sin `bus_dc`: warning + sin efecto (binarias solo donde sirven).
5. Mapper: `maxCapacity` vacío → default del nodo (10 kW); "sin límite" solo vía
   job directo (`max_kw: null`).
6. Filas nuevas del plan (`inverter`, `inverter_dc`, `inverter_rev`,
   `curtailment` atribuido): series nuevas en el chart solo con bus_dc (opt-in).

## No medido (declarado)

- Marcas de preflight C3 (`sin η`) y C4-ui (panel AC `error`): verificadas en
  código + lado solver en test; la captura evidencia el camino modelado. El
  badge corregido del 12.4 (`sin modelo`) sigue para ramas con extremo ignorado.
- ExpA completo de 14 días con inversor: no recorrido (cómputo); los tests de
  backtest con el job nuevo pasan igual que antes.
- ExpB oficial ≥100 ciclos: reportado con muestras (10+12+8+3); la serie
  oficial la corre el dueño si la necesita para el capítulo.
- Tiempos en HiGHS (Gurobi sin licencia amplia aquí); la comparación es
  relativa, mismo solver ambos lados.
- Artefactos `results/.../history/*.jsonl` del suite: untracked, NO commiteados.
