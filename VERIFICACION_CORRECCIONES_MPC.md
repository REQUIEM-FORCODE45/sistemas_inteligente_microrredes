# ✅ VERIFICACIÓN DE CORRECCIONES MPC — Estado post-implementación

**Repositorio**: `sistemas_inteligente_microrredes`
**Fecha de verificación**: 2026-08-27
**Plan referenciado**: `docs/PLAN_CORRECCION_MPC.md`
**Commits verificados**:
- `b4abbf9` — fix(mpc): E1-E9 correcciones + UI ExpA (PLAN_CORRECCION_MPC)
- `0b80c8a` / `3c5d909` — refactor Oráculo → MPC-PI + pestaña Diagrama|Resultados
- `1264f82` — regenerar resultados ExpA con MPC-PI (3 d, ventana 08-05→07)
- `6f42e75` — merge: fix/mpc-correcciones → main (E1-E9 + MPC-PI + Plan B)
- `7dee660` — chore: limpia .gitignore, conserva results, ignora cache

---

## 1. RESULTADO GLOBAL

| Área | Estado |
|---|---|
| Correcciones del solver (E1–E9) | ✅ **9/9 implementadas y verificadas en código** |
| Arbitraje diésel→red (bug crítico) | ✅ **ELIMINADO** (resultados nuevos con costos positivos) |
| Interfaz gráfica (Parte II del plan) | ✅ **Implementada** (backend + 5 componentes React) |
| Artefactos de resultados (traces/tabla/figuras) | ⚠️ **REGENERACIÓN INCOMPLETA** — ver §4 |

---

## 2. VERIFICACIÓN CÓDIGO — E1 A E9

### E1 — Binaria on/off del diésel ✅
`optimization/solver/model_builder.py`
- `model.U_diesel = pyo.Var(..., domain=pyo.Binary)` (línea ~230)
- `diesel_min_*`: `P_diesel >= min_kw · U_diesel` y `diesel_max_*`: `P_diesel <= max_kw · U_diesel` (~246-249)
- Costo fijo condicionado: `+ cost_c · fuel_cost · U_diesel` en objetivo (~461)
- `P_diesel` ya no tiene `lb = min_kw` permanente (antes: 50 kW forzados 24/7)

**Efecto confirmado en resultados**: diésel = 0 L en todas las estrategias de la ventana nueva (puede apagarse cuando no se necesita). Antes: 336/336 horas encendido con mínimo 50 kW.

### E2 — Tarifa de exportación separada (net-billing) ✅
`model_builder.py` + `experiments/config.py`
- `P_grid` descompuesto en `P_import` (NonNegativeReals) y `P_export` (NonNegativeReals) (~235-236)
- `export_tariff = 0.0` COP/kWh por defecto (~218) — sin ingreso por inyección
- Objetivo: `grid_d + grid_e·P_import − export_tariff·P_export` (~462)
- Límites: `P_import ≤ max_import`, `P_export ≤ max_export` (0 si el sitio no exporta) (~253-258)

**Efecto confirmado**: desapareció el "ingreso" ficticio de −4.7 M COP por exportar diésel a 140 COP/kWh.

### E3 — Balance como igualdad con ENS/CURT ✅
`model_builder.py`
- `model.ENS` y `model.CURT` (NonNegativeReals) (~237-238)
- Balance: `diesel + P_import − P_export + PV + wind + discharge + ENS == load + charge + CURT` (~352-355)
- Objetivo: `+ ens_penalty · ENS` (~463)
- Traces ahora incluyen columna `ens_kw` ✅ (verificado en `expA_traces_mpc-pi.csv`)

### E4 — No-anticipatividad en t=0 ✅
`model_builder.py`
- `model.nonant = pyo.ConstraintList()` (~412)
- Iguala en t=0 entre escenarios: `P_diesel`, `U_diesel`, `P_import`, `P_export`, `P_charge` (~418-424)

### E5 — `--quick` dead code ✅
`experiments/experiment_a.py` — ahora hace algo: `if args.quick: args.days = 1` (~135)

### E6 — `r.set()` duplicado ✅
`solver/run_once.py` — solo 1 aparición de `"failed"` (antes 2).

### E7 — Costo de degradación BESS ✅
`experiments/config.py` — `degradation_cost_per_kwh: 30.0` COP/kWh (antes 0.02, despreciable). Valor ajustado por sensibilidad (el plan proponía 200; se eligió 30 para no matar el arbitraje valle→pico legítimo de la batería — revisar si es suficiente; ver riesgo R3).

### E8 — ENS explícita en trazas ✅
Columna `ens_kw` presente en las trazas nuevas (posición 10 del header).

### E9 — Renombrado Oráculo → MPC-PI ✅
`STRATEGIES = ["smpc", "dmpc", "heur", "mpc-pi"]` con alias de compatibilidad (`mpc-pi` usa `OracleForecastProvider`).

---

## 3. VERIFICACIÓN INTERFAZ GRÁFICA (Parte II del plan)

### Backend ✅
| Archivo | Estado |
|---|---|
| `Backend/services/experimentService.js` | ✅ creado |
| `Backend/routes/Front.js` — `GET /optimization/experiment/summary` | ✅ (línea ~205) |
| `Backend/routes/Front.js` — `GET /optimization/experiment/traces/:strategy` | ✅ (~212) |
| `Backend/routes/Front.js` — `GET /optimization/experiment/status` | ✅ (~219) |
| `Backend/routes/Front.js` — `POST /optimization/experiment/run` | ✅ (~226) |

### Frontend ✅
| Componente | Estado |
|---|---|
| `ExperimentPanel.jsx` | ✅ |
| `ExperimentMetricsTable.jsx` | ✅ |
| `ExperimentCostChart.jsx` | ✅ |
| `ExperimentProfileChart.jsx` | ✅ |
| `ExperimentTraceChart.jsx` | ✅ |
| `optimizationSlice.js` — estado `experimentA` + reducers `setExperiment*` | ✅ |

---

## 4. ⚠️ PROBLEMAS PENDIENTES DETECTADOS EN LA VERIFICACIÓN

### P1 (🔴 CRÍTICO) — Traces de S-MPC/D-MPC/HEUR en disco son los VIEJOS (contaminados)
| Archivo | Fecha en disco | Contenido |
|---|---|---|
| `expA_traces_smpc.csv` | 2026-08-26 10:07 | 336 filas, 07-18→07-31, **diésel 336 h ≥50 kW, export 51,230 kWh, costo −1,428,731 COP** |
| `expA_traces_dmpc.csv` | 2026-08-26 10:07 | idem (−1,428,730) |
| `expA_traces_heur.csv` | 2026-08-26 10:07 | 14 días, costo −117,912 |
| `expA_traces_oracle.csv` | 2026-08-26 10:07 | 14 días, costo −1,432,591 |
| `expA_traces_mpc-pi.csv` | 2026-08-27 13:20 | ✅ NUEVO: 72 filas, 08-05→08-07, costo +7,633 |

Solo `mpc-pi` se regeneró. **Consecuencia**: la pestaña "Trazas por día" de la UI para S-MPC/D-MPC/HEUR mostraría los datos del bug original (diésel 260 kW exportando a red en pico), contradiciendo la tabla. Además `expA_metrics.csv` (27 13:20, costos positivos) **no es reproducible** desde las trazas que quedaron en disco: un hipotético `--report-only` regeneraría la tabla vieja.

### P2 (🔴 CRÍTICO) — `expA_table.md` mezcla textos viejos con números nuevos
Contradicciones internas verificadas en el mismo archivo:
- Título: "**Tabla de métricas (14 días)**" pero periodo real = 3 días (08-05→08-07)
- Conclusiones: "diferencia **0.88%**" y "**56.34%**" vs Oráculo — pero la Discusión dice "brecha de **0.27%**" (texto viejo copiado)
- Conclusiones: "mejora de **−8%** vs HEUR" — pero la Discusión dice "**1,112%** de mejora del MPC" (texto viejo)
- Discusión menciona "microred exportadora (PV 184 kWh/día vs carga 90)" — silenciosamente copiado de la ventana anterior
- Notas de honestidad: "El excedente solar se exporta hasta el límite" — con `export_tariff=0` ya no ocurre

### P3 (🟠 RESULTADO POR INTERPRETAR) — HEUR gana al MPC (−8%) en la ventana nueva
S-MPC 11,933 vs HEUR 11,047 COP (3 días). Con `export_tariff=0` y sin diésel necesario, la ventaja del MPC se reduce y la heurística (que no paga degradación ni cargo fijo de red en horas ociosas) compite. Es un resultado **legítimo y publicable**, pero la discusión del paper debe explicarlo — no heredar la narrativa de "1,112%".

### P4 (🟠 COBERTURA) — Ventana de 3 días no ejercita el diésel
0 L de diésel en TODAS las estrategias y carga ~3–7 kW → el experimento no prueba las decisiones de generación (la decisión on/off del diésel, el arbitraje valle→pico real). La ventana original de 14 días (07-18→31) ejercitaba el problema; conviene re-correr **14 días con el fix** para validar el comportamiento del diésel corregido.

### P5 (🟡 FIGURA) — `expA_figures.png` NO se regeneró
Fecha 2026-08-26 10:07 en disco. La figura sigue mostrando el perfil viejo con diésel ~255 kW en pico y exportación ~298 kW (el bug visual).

### P6 (🟡 AGENTS.md) — Documentación del repo
`AGENTS.md` ya incorpora las rutas nuevas (verificado), pero conviene añadir la referencia a este documento y a `PLAN_CORRECCION_MPC.md` como historial de correcciones (traza metodológica para el jurado).

---

## 5. PLAN DE CIERRE (pasos para completar la verificación al 100%)

En orden, desde la raíz del repo:

```bash
# 0. Respaldar estado actual (por si acaso)
git add -A && git commit -m "chore: backup antes de regenerar ExpA completo (P1-P5)"

# 1. Re-ejecutar Experimento A COMPLETO (14 días con el fix) — regenera las 4 trazas
cd optimization
python -m optimization.experiments.experiment_a --days 14

# 2. Verificar que las trazas nuevas tienen fecha de hoy, 336 filas y costos POSITIVOS
#    (las 4: smpc, dmpc, heur, mpc-pi)

# 3. Revisar/re-escribir expA_table.md (P2): quitar textos heredados;
#    decidir la interpretación de S-MPC vs HEUR (P3); declarar la cobertura del diésel (P4)

# 4. Regenerar figura (se genera sola con el script del paso 1; verificar fecha) (P5)

# 5. Commit de cierre
git add -A && git commit -m "fix: regenerar ExpA completo 14d con E1-E9 (cierra P1-P5)"
```

Verificación final (criterios de aceptación):
1. Las 4 trazas en disco: 336 filas, rango 07-18→07-31, `diesel_kw` con **ceros** (horas apagado), exportación ≈ excedente PV real, costos **> 0**.
2. Tabla: un solo periodo declarado, sin textos contradictorios, brecha vs MPC-PI ≈ misma cifra en conclusiones y discusión.
3. UI: pestaña "Resultados" muestra trazas que coinciden con los CSV (prueba manual end-to-end).
4. Diésel en la ventana de 14 días: la binaria on/off se ve en el perfil (apagado de madrugada cuando hay excedente, encendido solo en déficit).

---

## 6. RIESGOS ABIERTOS (documentar para el paper)

- **R1**: el MILP creció (binarias `U_diesel`, `ENS`, `CURT`, nonant) — Exp B (tiempos) debe re-correr para medir el nuevo p95; si Gurobi (licencia gratuita, size-limit) se queda corto, HiGHS ya está como fallback.
- **R2**: con `export_tariff=0`, la microred "exportadora" del informe anterior deja de serlo — la narrativa económica del paper cambia (esto es lo CORRECTO, pero exige reescribir la discusión).
- **R3**: `degradation_cost_per_kwh = 30` COP/kWh fue un ajuste por sensibilidad; verificar en 14 días que la batería siga haciendo arbitraje valle→pico sin sobre-ciclar (si no cicla, subir; si cicla sin límite, bajar; el rango razonable es 20–200 COP/kWh).
- **R4**: los tiempos de Exp B y la ventana del Exp A (3 días vs 14) deben estar explícitos en el paper para que el jurado no detecte la inconsistencia.

---

## 7. SEGUNDA RONDA DE CORRECCIONES — hallazgos post-fix (2026-08-27)

> **Motivación**: tras verificar los resultados regenerados (14 días, 27 14:49), el
> arbitraje diésel→red está eliminado (costos positivos 54,804/55,499/50,866/35,902
> COP; diésel 0 h; export ~2,200 kWh) PERO el análisis del perfil horario reveló
> **4 problemas nuevos de modelado/experimento** que invalidan la discusión del paper.

### 7.1 Hallazgos verificados (con evidencia en `expA_traces_smpc.csv`)

| # | Hallazgo | Evidencia | Por qué es problema |
|---|---|---|---|
| F1 | **La batería NUNCA carga** (`charge_kw = 0.0` en las 24 h × 14 días) | perfil horario S-MPC: ch=0 h00–h23 | La discusión afirma "la batería hace el arbitraje valle→pico (carga a 45, descarga a 140)" — **falso**: no carga nunca |
| F2 | **El SoC solo drena: 130 → 80.6 kWh** y nunca vuelve a subir | SoC min 80.69 / máx 130.0 (=0.65·200) | La discusión afirma "el SOC recorre el rango operativo completo [0.2, 0.95]·capacidad" — **falso**: solo [0.40, 0.65] |
| F3 | **Descarga en valle (45 COP/kWh) exportando a tarifa 0** | h00: dch 7.4 kW, grid −4.7 (exporta 4.7 a 0 COP) | Operación irracional: paga degradación (30 COP/kWh) para exportar a 0 — síntoma de F1/F2 |
| F4 | **PV del mediodía exportado entero (grid −24 kW a 0 COP)** en vez de cargar la batería para la noche (donde importa a 80–140 COP) | h10–h14: grid −20/−24 con ch=0 | Con `export_tariff=0` se regala energía mientras luego se compra cara |
| F5 | **HEUR gana al MPC (−8%)** con 0.04 ciclos/día | S-MPC 54,804 vs HEUR 50,866 | Legítimo PERO el MPC pierde por su batería irracional, no por inferioridad del método → la conclusión actual es un **artefacto**, no un hallazgo |
| F6 | **Carga del sitio ~3–7 kW plana** (no los ~34 kW nominales) | load_real ~2.9–7.4 kW | El experimento no ejercita ni la producción ni el diésel (0 L en todo) |

**Causa raíz única de F1–F5**: el modelo **no tiene valor terminal del SoC** ni
representación correcta del costo de oportunidad de la energía almacenada →
la batería inicial (130 kWh) es "gratis" y el horizonte finito (24 h) no la
valora al final → el MPC la drena sin recargarla (F2), nunca paga degradación
para recargar (F1), y exporta PV a 0 porque almacenarlo no tiene valor (F4).

### 7.2 Correcciones de código (archivo `optimization/solver/model_builder.py`)

**R1 — Valor terminal del SoC (F1, F2, F4) — CRÍTICO**

En MILP puro no puede usarse cuadrático suave (HiGHS sin QP), así que se usa
**penalización lineal por tramos del desvío al target** (patrón ya usado para la
Willans del diésel):

```python
# Tras definir SOC y antes del objetivo (dentro de `if storage_list:`):
SOC_TARGET_FRAC = 0.65          # o bmeta["initial_soc"]: conservar lo que entra
SOC_TERM_PEN = 100.0            # COP por kWh de desvío al final del horizonte
for bi, bmeta in enumerate(storage_vars):
    for s in s_ids:
        tH = horizon - 1
        model.add_component(
            f"soc_terminal_pos_{bi}_{s}",
            pyo.Constraint(expr=model.SOC[bi, tH, s] - SOC_TARGET_FRAC * cap <= model.TERM_DEV_POS[bi, s]))
        model.add_component(
            f"soc_terminal_neg_{bi}_{s}",
            pyo.Constraint(expr=SOC_TARGET_FRAC * cap - model.SOC[bi, tH, s] <= model.TERM_DEV_NEG[bi, s]))
```
con `model.TERM_DEV_POS/NEG = pyo.Var(..., domain=NonNegativeReals)` y
`+ SOC_TERM_PEN * (TERM_DEV_POS + TERM_DEV_NEG)` en la función objetivo
(ponderado por `prob` como el resto).

**Efecto esperado**: la batería deja de drenarse; el MPC recarga con PV de
mediodía (cuesta degradación 30 + dev terminal 0 si vuelve a 65%) y solo
descarga cuando el arbitraje o la demanda lo justifican → ch>0 diurno,
SoC recorriendo [0.2, 0.95], sin exportaciones absurdas en valle.

**R2 — Sanidad del arbitraje (F3): impedir carga/descarga simultánea ya existe
(Z big-M ✓); añadir prohibición de exportar mientras la batería descarga en valle**
— opcional; con R1 el síntoma desaparece por sí solo (la exportación a 0 solo
ocurría porque almacenar no tenía valor). Se valida después de R1: si aún hay
horas con dch>0 y grid<0 simultáneos en valle, añadir `P_export[t,s] <=
PV_esperado[t,s]` (exportar solo excedente renovable).

**R3 — Calibrar degradación + valor terminal juntos**: λ=30 COP/kWh está en rango
(≤ ~42 para que el arbitraje valle→pico sobreviva), pero verificar en los 14 días:
con R1 activo la batería debe ciclar ~0.5–1.0 ciclos/día (arbitraje real) sin
sobre-ciclar. Si no cicla: bajar degradación a 10–20. Si cicla sin límite: subir a 50–100.
(Sensibilidad documentada en el paper, igual que en la tesis con λ=200.)

**R4 — Ejercitar el diésel (F6): el experimento debe estresar la generación**

Opciones (elegir una, documentarla):
- **(a) Escalar la carga de prueba a la nominal** (~34 kW media, picos ~58 kW como la
  tesis): multiplicar `load_real` por un factor en `data_loader.test_period_days`/exp
  (perfil calibrado ya existe) — la red a 400 kW seguirá cubriendo todo → el diésel
  solo entra si se limita la red (opción b).
- **(b) Limitar `max_import_kw` del experimento** (~20–30 kW) → cuando la carga supera
  red, el diésel entra y E1 (binaria on/off) queda DEMOSTRADA en los traces (horas con
  U=1 intermitentes, no 336 h).
- **(c) Ventana con déficit real** (invierno nublado) — menos controlable.
Recomendada: **(a)+(b) en `experiments/config.py`** (bloque `grid.max_import_kw =
30`) y anunciarlo en el paper como "red limitada (fallback) — caso aislable".

**R5 — Reescribir discusión y tablas (F1–F5) — `expA_table.md` + `informe.md`**
- Eliminar: "la batería hace el arbitraje valle→pico", "el SOC recorre [0.2, 0.95]",
  "microred exportadora... se vende al precio variable", "0.27%", "1,112%".
- Nueva narrativa honesta: (1) con valor terminal + degradación calibrada, el MPC
  gestiona la batería (cargar de día, descargar en pico); (2) la comparación vs HEUR
  depende de la ventana; (3) E1 demostrado con diésel intermitente en red limitada;
  (4) MPC-PI sigue siendo cota superior (la brecha 52.65% actual es un artefacto del
  F5 — se recalcula con los fixes).
- Tabla: coherencia estricta periodos/fechas/números (P2 de la ronda 1).

**R6 — Re-correr y validar (cierre)**
```bash
cd optimization
python -m optimization.experiments.experiment_a --days 14
python -m optimization.experiments.experiment_b_solver_time   # MILP creció (R1 añade 2 vars/escenario)
```
Checklist post-run (`expA_traces_smpc.csv`):
- [ ] `charge_kw` > 0 en horas diurnas (PV→batería)
- [ ] SoC recorre al menos [0.40, 0.95]·cap y termina ≈ 65%
- [ ] Sin horas con `discharge>0` y `grid<0` simultáneos en valle
- [ ] Diésel: horas on/off intermitentes (si se aplicó R4b) o 0 L solo si la red ilimitada lo justifica físicamente
- [ ] Costos positivos y violaciones = 0
- [ ] Figuras regeneradas y coherentes (sin diésel 255 kW en pico)

### 7.3 Archivos afectados (resumen 2ª ronda)

| Archivo | Cambio |
|---|---|
| `optimization/solver/model_builder.py` | R1 (valor terminal SoC por tramos), R2 (si persiste), R3 tuning |
| `optimization/experiments/config.py` | R4 (red limitada 30 kW, λ degradación final), R6 |
| `optimization/experiments/data_loader.py` | R4a (escala de carga nominal) si se elige |
| `optimization/experiments/experiment_a.py` | R5 (textos), flags para R4 |
| `results/.../expA_table.md` + `informe.md` | R5 reescritura honesta |
| `Backend` / `Frontend` | sin cambios (UI ya consume los CSV — se actualiza sola) |

### 7.4 Riesgos 2ª ronda
- **R1 hace el MILP un poco más grande** (2 vars + 2 cons por batería/escenario):
  irrelevante vs 648 binarias actuales; Exp B lo confirma (< 1.5 s esperado).
- **R4b cambia la naturaleza del experimento** (red limitada): es un escenario
  legítimo ("operación con red débil") pero debe declararse — el jurado verá
  max_import=30 y preguntará; responder: es exactamente el caso de la tesis
  (microrred con respaldo diésel), y la UI permite cambiar la topología.
- **λ degradación**: el número exacto es calibrável; documentar la sensibilidad
  (la tesis usó λ=200 con la misma física y funcionó — aquí la escala de costos
  del sitio es ~10× menor, por eso 30 es el orden correcto).

---
*Fin de la 2ª ronda. Este §7 se marca ✅ solo cuando el checklist R6 pase completo.*

*Este documento es trazabilidad de auditoría. Los cambios de código ya están en `main` (commits B4ABBF9→7DEE660); los pendientes P1–P6 son de regeneración de artefactos, no de código.*