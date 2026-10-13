# VERIFICACION — CAMBIO 14 · transformador en la rama de red + frontera declarada

> Opt-in del DIAGRAMA. `optimization/experiments/config.py` NO se toca en este
> cambio (decisión del dueño: el trafo no entra a MICROGRID para no sumar otro
> V-item al −3 % del inversor; si se pide alguna vez, será explícito y sumará a V7).

## Decisión de rama (tomada sin respuesta del dueño, aislada y reversible)

La spec no declara a qué rama aplica el trafo y el payload del solver no trae
aristas (solo grupos). Se implementó la **RAMA DE RED** (subestación de
conexión): la spec §1 cita la red como patrón del trafo ("elemento de paso con
coste/límite") y el C2 ("forzar más demanda") solo cuadra ahí. El camino está
aislado (un bloque de parse + `grid_net` + cotas + filas): moverlo a otra rama
o añadir el parámetro `branch` es un cambio local si el autor lo pide.

## C1 · Pérdidas verificables (mapa exacto, reporte a 2e-3)

`test_c1_perdidas_exactas_por_hora_y_escenario` — `losses_pct: 2`, 8 h × 3
escenarios = 24 filas `transformer` + 24 `transformer_loss`: `loss = 0.02·paso`
y `entregado = 0.98·paso` a 2e-3 (el plan redondea a 3 decimales; el mapa es
exacto **por escala del balance**, mismo estándar aceptado en 13/C5). La
diferencia NO desaparece: fila `transformer_loss` atribuida al trafo (no CURT).
PASA.

## C2 · Límite respetado (con válvula física, no cota bajada)

`test_c2_tope_limita_y_se_reporta` — `100 kVA × 0.9 = 90 kW`, demanda 120
(diesel/batería ausentes a propósito): import máximo = 90.0 (el tope muerde) y
el resto va a **ENS declarado** — la válvula física existente del balance AC
(penalidad 5000), no una cota bajada en silencio (pitfall 3 del dueño). PASA.

## C3 · Ausencias declaradas (regla del 0 unificada, cero suposiciones)

- `test_c3_sin_pf_no_hay_tope_y_se_dice`: sin `pf`, import > 90 (el límite NO se
  aplica) + eco `limite_aplicado: False`, motivo con "power_factor",
  `energia_no_contabilizada: True`. PASA.
- `test_c3_sin_perdidas_pasa_directo_y_se_dice`: sin pérdidas, cero filas
  `transformer_loss` + eco con motivo + paso directo (`trafo == import` a 1e-6).
  PASA.
- `test_c3_cero_es_no_declarado` (pitfall del 13): `s_max/pf/losses = 0` →
  `limite_aplicado: False`, `losses_p: None`, 2 motivos. El panel guarda 0 al
  vaciar un number; la regla `no > 0 = no declarado` vive igual en mapper,
  preflight-aviso, tarjeta ('—') y solver (0 fuera de (0,1] → aviso + no aplica).
  PASA.

## C4 · Frontera visible (panel + eco, no solo código)

- Eco: `params_efectivos.alcance = "despacho (perdidas+capacidad);
  tension/impedancia NO simuladas (AC-OPF: fase futura)"` (verificado en
  `test_c4_frontera_en_eco_y_c5_balance_integro`). PASA.
- Tarjeta: pie `Despacho: pérdidas + capacidad · tensión/impedancia NO
  incluidas` (visible en la captura). Panel: `TrafoEffectiveLine` (efectivo por
  campo) + nota de alcance con borde (mismo patrón que el eta del inversor).
  Símbolo `s-trafo` verbatim de la referencia 12.4 (copiado, no inventado).

## C5 · Balance íntegro + eco modelado

Mismo test C4: `PV + 0.98·import == carga` a 0.01 en las 24 celdas + eco
`modelado` con `s_max_kva/pf/losses_p/limite_kw/limite_aplicado/motivos`.
PASA.

## C6 · Sin regresión + tiempos

- Plan sin `converters` idéntico al de antes (el trafo solo actúa con su
  entrada; verificado por construcción + suite).
- Suite: **135 coleccionados** (129 tras el retiro de TimesFM + 6 nuevos);
  **130 passed** y los **mismos 5 fallos pre-existentes** del 13 (backtest ×3,
  complementarity ×1, solver-dispatch ×1 — verificados en HEAD limpio entonces,
  sin fallos nuevos ahora).
- ExpB: MICROGRID intacto → el job medido es el mismo del 13 (serie 5.68 s med,
  HiGHS); el trafo añade **cero variables/restricciones** (escala + cotas, como
  el serie 13.1). Sanity de 3 ciclos con trafo (500 kVA, pf 0.9, 1.5 %) sobre el
  JOB del ExpB: solve 6.29/6.25/5.53 (med 6.25 s) — mismo orden que el serie,
  sin degradación atribuible.
- Transición de cobertura: `transformer.ratioLabel` entra a `PARAMS_SOLO_UI`
  (rótulo, no se simula); los otros 4 campos van por el mapper.
  `test_mapper_output_contra_schema` exigió la clave literal `eta:` (el
  shorthand `eta,` no matchea) — declarado para el próximo que toque el mapper.

## C7 · Fluidez (pares crudos, orden aleatorio cur,pre,cur,pre,pre,cur)

Misma sesión, escena idéntica sin trafo (el pre-HEAD no conoce el tipo; el
harness de pares no lo incluye — solo difiere el código), worktree HEAD limpio
(pre, :5213) vs árbol actual (cur, :5214):

| orden | árbol | fps | muts |
|---|---|---|---|
| 1 | cur | 12.3 | 85 |
| 2 | pre | 11.5 | 85 |
| 3 | cur | 11.5 | 85 |
| 4 | pre | 11.6 | 85 |
| 5 | pre | 12.3 | 85 |
| 6 | cur | 12.1 | 86 |

Medianas: **cur 12.1 vs pre 11.6 (+4 %, dentro del ruido)**; muts constantes.
**Sin degradación >10 % detectable.** Mismo nivel absoluto que la sesión del 13
(~12, render por software headless).

## Captura

`reference/figuras/cambio_14_unifilar.png` (1920×1080, 160321 bytes, sha256 en
`reference/README.md`): trafo con rótulo `13.2/0.22 kV`, píldora
`▲ transformando`, `100 kVA`, `2.0%`, pie de alcance; ramas `▲ 10.0 kW`;
paleta con Transformador; panel sin el trafo (excluido como la barra: sus
params son de placa, no de sensor). Harness y vites limpiados.

## Suite

Corrida completa: **130 passed + 5 failed** (481 s). Los 5 son los
pre-existentes del 13 (`test_metricas_agregadas_consistencia`,
`test_heur_regla_diesel_vs_red`, `test_costo_diesel_formula_exacta`,
`test_tarifa_horaria_toU_activa_arbitraje_bateria`,
`test_solve_optimal_con_dispatch`) — verificados en HEAD limpio en el 13 y sin
fallos nuevos en el 14.

## Decisiones (para el registro)

1. Rama de RED (no PV): spec §1 + C2 + física de subestación; reversible.
2. Costo de red sobre `P_import` (lado medidor, sin cambios).
3. Pérdidas como fila propia `transformer_loss` (física, no curtailment).
4. Trafo fuera de `mappableNodes` (mismo principio 12.4-b que la barra).
5. `efficiency` como alternativa a `losses_pct` (manda `losses_pct`; el eco dice
   cuál rigió). pf/eta fuera de (0,1] = no declarados.
6. MICROGRID intacto (orden explícita del dueño).

## No medido (declarado)

- Marcas de preflight del trafo (aviso por ausencia) y `TrafoEffectiveLine`:
  verificadas en código + build; la captura evidencia el camino modelado
  (placa completa). El ciclo completo con placa incompleta queda para la
  auditoría de render si la pide.
- ExpB oficial ≥100 ciclos con trafo: el job no lo incluye (diseño); sanity de
  3 ciclos arriba (med 6.25 s).
