# Fase 0 — ¿qué cifras publicadas siguen en pie? (2026-10-19)

Barata y decisoria: responde si las cifras publicadas se defienden con nota
al pie o hay que rehacerlas con el job nuevo. **Lo que no se midió, se declara
y no se tabula.** Corridas que salen mal se archivan, no se borran.

## Decisión de entorno (bloqueante, medida)

Gurobi tiene licencia **limitada por tamaño** (`Model too large for
size-limited license` → fallback a HiGHS en TODOS los solves del ExpA2,
ver `resultados/v8a_timeout_head.txt`). Ritmo medido: **~110 s/solve**
(8 solves en 15 min antes del corte). Un ExpA2 (3 d × 2 estr × 24 h = 144
solves) ≈ **4-6 h con HiGHS**. Por eso la Fase 0 NO repite corridas
completas aquí: se prueba lo mismo por vía corta y determinista, y lo
largo queda declarado para un entorno con Gurobi completo (o ~6 h en
fondo con autorización).

## T1 — V8a: ¿el 15 alteró algo con defaults?

**Comando de la vía corta** (mismo en ambos árboles; el pre-15 no acepta
`topology_mode` y no se le pasa):

```
PYTHONPATH=<arbol> python3 /tmp/v8a_jobs.py   # _build_job × {smpc,dmpc} × {grid30,isla}
```

**Resultado: IDÉNTICO 4/4** (`resultados/v8a_jobs_sha.json`, shas canónicos
iguales en actual vs worktree `504e175`). Más el test C6 re-corrido aquí:

```
python3 -m pytest optimization/tests/test_switches.py::test_c6_modo_impuesto_reproduce_dispatch
# 1 passed in 2.33s
```

**Veredicto V8a**: el cambio 15 no altera nada con defaults
(`switch_mode impuesta`, sin `connections`). La comparación contra lo
publicado en `results/` NO aplica: eso es pre-13 y la diferencia con el
job actual es esperada (se mide aparte en V7).

La corrida completa ExpA2×2 (3 d, grid30, smpc+dmpc) se lanzó y se cortó
a los 15 min por la regla de presupuesto (8/144 solves; evidencia en
`v8a_timeout_head.txt`).

## T2 — V7: ¿cuánto cambia el inversor?

Vía corta: **un solve HiGHS por lado**, mismo job smpc grid30 24 h
(ventana 2026-08-03); difieren SOLO en `converters` (eta 0.97 vs ausente;
árboles main vs worktree `0fced54` pre-13):

```
PYTHONPATH=<arbol> python3 /tmp/v7_sample.py
```

**Resultado** (`resultados/v7_sample.json`, ambos `optimal`):
con inversor 10393.99 vs sin inversor 10329.25 → **delta +64.74 (+0.63 %)**,
dirección esperada (menos PV aprovechable con eta) y magnitud pequeña y
explicable por eta. Es **una muestra de 1 solve, no los deltas de 3 días**
(costo/ENS/litros del par completo pendientes de Gurobi completo).

**Opcional isla no corrido** (misma razón: cada brazo son 72 solves HiGHS).
Declarado, no medido.

## T3 — V3: sensibilidad de la fuente de PV en días con ENS

**Brazo mongo (publicado): verificado por lectura**, sin re-correr
(`resultados/v3_mongo_check.json`, desde
`results/pasto_narino/experiments/expA2_daily.csv`):
isla 08-03/04/05 → S-MPC 1.12/0.00/2.33 (total **3.45**), D-MPC
2.62/0.00/6.19 (total **8.82**; +1.83 del 08-06 = **10.65** publicado).
Coincide exacto con la tabla del §2 de `PENDIENTES_MPC_ESTADO.md`.

**Brazo era5: NO corrido** (bloqueado por el mismo muro HiGHS: 144 solves).
Comando listo para cuando haya solver:

```
python3 -m optimization.experiments.experiment_a2_stochastic \
  --days 3 --start-date 2026-08-03 --modes isla --pv-source era5 \
  --strategies smpc dmpc --tag v3_era5
```

Criterio pendiente: S-MPC < D-MPC con la otra fuente en esos 3 días.

## Tabla resumen: cifra publicada → ¿sigue válida? → artefacto

| Cifra publicada | ¿Sigue válida? | Artefacto que lo prueba |
|---|---|---|
| C6: impuesta idéntica pre/post-15 (job+plan+objetivo) | ✅ Sí (re-verificado aquí) | test C6 PASS + `v8a_jobs_sha.json` (4/4 idénticos) |
| Job actual = pre-13 + inversor (efecto ≈ −3 % PV) | ✅ Dirección y magnitud coherentes (muestra 1 solve: +0.63 %) | `v7_sample.json` |
| Deltas 3 d grid30 con/sin inversor (costo/ENS/litros) | ⬜ No medido (bloqueado: HiGHS) | — (requiere Gurobi completo o fondo autorizado) |
| ExpA2 isla 14 d §2: S-MPC 3.45 vs D-MPC 10.65 kWh ENS | ✅ Reproduce del CSV publicado | `v3_mongo_check.json` |
| Robustez a fuente PV (era5) en 08-03/04/05 | ⬜ No medido (bloqueado: HiGHS) | comando listo arriba |

## Nota de decisión (la que habilita la Fase 0)

V8a da **idéntico** y V7-muestra da un **delta pequeño (+0.63 %) y
explicable por eta (0.97)** → las cifras publicadas se pueden defender en
el capítulo con una **nota al pie** (job actual = job publicado + inversor
−3 % PV + switches que no tocan defaults). Si el par completo de 3 días
(con Gurobi) mostrara un delta grande, habría que rehacer los números.
**V1/V2 no se lanzan**: son horas, no minutos; se presupuestan aparte
después de esta fase.

## Manifiesto

Ver `MANIFEST.md` (archivo | bytes | sha256 completo) de esta carpeta.
