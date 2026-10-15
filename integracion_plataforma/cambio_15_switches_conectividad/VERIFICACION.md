# VERIFICACION — CAMBIO 15 · Switches de conectividad

## Decisión de diseño (1b + 2a, asumidas sin respuesta del dueño)

- **Gate por dispositivo `from`** (fallback `to` si `from` es barra): red
  (`P_import/P_export`), diésel (`P_diesel`), batería (`P_charge/P_discharge`),
  solar/eólica (factor sobre la contribución). Extremos no gateables
  (load/bus/inverter/trafo/sensor) → warning + sin efecto (declarado).
- **Seccionador = atributo del EDGE** (clic en la rama → panel ya lo soportaba;
  símbolo `s-sw-c/o` sobre la rama). Sin nodo switch: el MILP solo necesita la
  rama y se evita re-cablear.
- **`switch_mode: "ambos"` fuera de alcance** (la spec §3 no define la tabla);
  se avisa y se trata como operador.
- **Pasivos solo en operador**: un switch solver sobre solar/wind se degrada a
  operador con el estado inicial + warning (evita bilineal). Declarado como
  límite conocido.
- **Desconectado no paga cargo fijo**: incentivo económico real de la isla
  (mismo criterio en objetivo y desglose). Sin gates, `grid_d * 1.0` bit-idéntico.

## C1 · El operador manda

`test_c1_operador_abre_red_cero_en_todas_las_horas`: red abierta → cero filas
`grid_import/grid_export` en las 24 celdas (8h × 3 escenarios) + eco `switch`
`modelado` con `switch_state: open` + `topology` coincidente.
`test_c1_operador_abre_diesel_y_solar`: filas diésel y solar en `0.0`.
PASA.

## C2 · El solver elige (los dos sentidos)

- Red cara (500 COP/kWh, diésel disponible): el solver **abre** (s=0 en las 24
  celdas) y ahorra el fijo; cero filas de red. PASA.
- Red barata (5 COP/kWh, sin batería, estado inicial abierto, maniobra 1000):
  el solver **cierra** en t=0, `topology.switching_cost_cop == 1000.0` y
  `maneuvers` con `{de: 0, a: 1}`. PASA.
- Hallazgo de escenario (no del modelo): con batería llena + solar, la isla es
  casi gratis y el solver *racionalmente* no maniobra; el test fija el escenario
  para que el incentivo exista. Declarado para no confundir "no maniobra"
  con "no funciona".

## C3 · Sin fuente → ENS declarado

Todo abierto (red+diésel+PV+batería) → `sum(ENS) > 0`, status optimal. Nunca
plan silencioso (la válvula ENS ya existía; el gate la deja actuar). PASA.

## C4 · M obligatoria en solver

Sin `M` en modo solver → status optimal (fail-safe: rama forzada ABIERTA),
eco `switch` en `error` con motivo mencionando `M`, cero filas de red y warning
`sw_g`. No se adivina la cota. PASA.

## C5 · Visible y coincidente

Captura `reference/figuras/cambio_15_unifilar.png` (1920×1080, 130585 bytes,
sha256 completo en el manifiesto, recalculado en este mismo commit): rama
red→bus en tenue/discontinua con glifo `#s-sw-o` + badge `s=0`; resto con
`s-sw-c` + kW. Verificado en DOM: 4 `use` (1×`#s-sw-o` en red, 3×`#s-sw-c`),
1 pill `s=0`. El `topology` del resultado alimenta al lienzo (post-corrida) y
el `edge.data` antes de correr.
Prioridad declarada: **`sin modelo` gana sobre `s=0`** si coinciden en una
rama (aviso más fuerte: no se puede inferir nada).

## C6 · Modo impuesto reproduce (evidencia = artefacto, cierre §3.1)

- Evidencia pre-cambio versionada:
  `reference/resultados/golden_impuesto.json` (plan 96 filas + objetivo 875.0
  + `plan_sha256: ca919694…` + commit de captura `504e175`). **Recomputado con
  el código ANTERIOR al cambio** (worktree en `504e175`, cuyo
  `model_builder.py` no menciona `connections`): dio exactamente `ca919694…` /
  `875.0`, así que el golden es evidencia pre-cambio de verdad, no texto.
- `test_c6_modo_impuesto_reproduce_dispatch` **carga el artefacto** (ya no usa
  constantes sueltas): primero valida su coherencia interna (re-hash del plan
  == `plan_sha256`), luego reproduce el plan/objetivo actual y lo compara, con
  `topology.connections == []`. PASA.
- Nota de corrección (append, no borrado): la mención anterior a `a76c0828…`
  ("capturado en BASE_JOB antes de tocar el solver") **queda reemplazada** por
  este artefacto — ese hash solo vivía en este texto y no era reproducible
  (hallazgo §3.1 de la auditoría, correcto).
- `--topology-mode impuesta` (default): `_build_job` NO emite la llave
  `connections` (verificado en test); `solver` la añade solo a la rama de red
  (`M` = tope del modo). Sin Mongo en este entorno no se corre ExpA2: la
  equivalencia del modo impuesto es por construcción (código no tocado) +
  golden versionado. Declarado (V8 en pendientes).

## C7 · Sin regresión + fluidez

- Suite: ver §Suite (solo los 5 fallos pre-existentes de HEAD, sin nuevos).
- Fluidez, misma escena en ambos árboles, orden de ejecución
  cur,pre,pre,cur,pre,cur + 2 pre y 2 cur extra (entorno inestable: ver nota):

| árbol | fps | muts |
|---|---|---|
| pre | 12, 12.5, 15.8, 10.1, 14.2 | 20 |
| cur | 15.7, 7.4, 18, 8.8 | 20 |

  Medianas: **pre 12.5 vs cur 12.25 (−2 %, dentro del ruido)**; muts 20
  constantes en las 9 corridas. **Sin degradación >10 % detectable.**
- Nota de entorno (honesta): rachas con crashes de arranque de Chrome y un
  `/tmp` purgado al 94 % de disco que obligó a rehacer las mediciones fuera de
  `/tmp`; la varianza absoluta (±40 %) es del entorno headless, no del cambio:
  lo que vale es la comparación misma-sesión/escena, y muts no se mueve.

## Captura

`figuras/cambio_15_unifilar.png`: ver §C5. Harness temporal
(`harness15.html` + `src/__harness15.jsx`) borrado antes del commit; vites y
worktree limpiados.

## Suite

Corrida completa: **134 passed + 9 failed** (273 s). De los 9, 4 fueron bug
mío de threading (`strategy_oracle` pasaba `topology_mode` posicional y
`strategy_mpc_pi` quedó sin el parámetro → NameError/TypeError): corregido y
**re-verificado 4/4 passed** (167 s). Quedan solo los **5 pre-existentes de
HEAD** (`test_metricas_agregadas_consistencia`,
`test_heur_regla_diesel_vs_red`, `test_costo_diesel_formula_exacta`,
`test_tarifa_horaria_toU_activa_arbitraje_bateria`,
`test_solve_optimal_con_dispatch`), documentados desde el 13/14. Solo
`test_backtest.py` importa `strategies`/`backtest`: ningún otro archivo de
tests toca el código corregido.

## Decisiones (para el registro)

1. Gate por `from` (fallback `to` si barra); M por rama desde equipo real.
2. `M < límite del equipo` → warning pero se aplica (cota declarada, no inventada).
3. `ambos` → warning + operador (fuera de alcance declarado).
4. Solver sobre pasivo → degradado a operador + warning (evita bilineal).
5. `switch_cost_cop` negativo/inválido → 0 + warning; default 0.0 (spec).
6. `heur` no recibe `topology_mode` (regla sin job: sigue tope impuesto).
7. Preflight de edges: el panel avisa en vivo (solver sin M); sin marcas de
   preflight en canvas (el eco post-corrida es autoritativo). Declarado.
8. MICROGRID intacto (orden explícita del dueño).

## No medido (declarado)

- ExpA2 completo modo `impuesta` (sha256 de la tabla): sin Mongo aquí; cubierto
  por golden unitario + flag default verificado.
- ExpA2 modo `solver` end-to-end (solo job construido y verificado).
- Preflight visual del aviso solver-sin-M en canvas (solo panel + eco).
