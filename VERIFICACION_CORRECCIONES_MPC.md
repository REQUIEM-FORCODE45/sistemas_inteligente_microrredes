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

*Este documento es trazabilidad de auditoría. Los cambios de código ya están en `main` (commits B4ABBF9→7DEE660); los pendientes P1–P6 son de regeneración de artefactos, no de código.*