# 📌 ESTADO DEL MPC DE LA PLATAFORMA — Pendientes de validación

**Documento de continuidad** · Última actualización: 2026-09-19
**Repo**: `sistemas_inteligente_microrredes` (rama `main`, HEAD `2e60acf`)
**Regla vigente**: **NO tocar el programa** (código, solver, resultados) hasta retomar explícitamente. Este documento es solo registro.

---

## 1. RESUMEN DEL ESTADO (verificado)

| Ítem | Estado |
|---|---|
| Causa raíz del ENS fantasma (`setub(1e6)` anulaba el límite de isla) | ✅ Corregida y verificada (`model_builder.py:253`, `> 0` → `>= 0`) |
| Cota válida (MPC-PI mejor en los 3 modos) | ✅ 771,650 / 795,276 / 844,381 |
| Hallazgo isla (S-MPC: ENS −67%, CVaR_80 −10.8% vs D-MPC) | ✅ Con p-valor declarado (p=0.206 en costo medio) |
| Informe §7.5 (Exp A2) | ✅ Publicable |
| Significancia estadística (30 d) | ✅ Diferido con proyección documentada (~15-20 h, p≈0.06) |
| **Sensibilidad de fuente PV en días con ENS** | ⚠️ **PENDIENTE** (30-60 min) — ver §2 |
| **Vertido del 74% / mínimo técnico del diésel** | 📊 **PENDIENTE de documentar** — ver §3 |
| **Experimento D: validación del bucle en vivo** | ⚠️ PENDIENTE (no iniciado) — ver §4 |
| **Nodo "Red" del diagrama en 400 kW** | ⚠️ Ajuste recomendado — ver §5 |

### Hallazgos clave ya establecidos (para no re-descubrirlos)

- El **bucle del diagrama corre S-MPC** (`mpcScheduler.js:243` → `scenarios: null` → 3 escenarios P90/P50/P10 con probs 0.2/0.6/0.2). El frontend nunca envía escenarios.
- **Ranking por modo** (costo normalizado, 14 días):
  - grid30: MPC-PI 771k < HEUR 798k < D-MPC 833k < **S-MPC 839k** (D gana a S con p=0.003)
  - grid10: MPC-PI 795k < D-MPC 864k ≈ S-MPC 865k < HEUR 1,013k
  - isla: MPC-PI 844k < **S-MPC 936k** < D-MPC 965k < HEUR 1,013k
- **El valor del estocástico aparece solo en escasez** (ENS −67%, CVaR −10.8%); en red holgada paga un seguro que no se cobra.
- **MPC-PI = métrica VPI**: la brecha S-MPC vs MPC-PI en isla es **11%** → cuánto valdría un pronóstico perfecto.
- El ENS residual en isla es **diurno (09-17 h)** con diésel cerca del mínimo (52-54 kW) y **ocurre en días nublados** (08-03: PV 163 kWh; 08-05: PV 114 kWh).

---

## 2. ⚠️ PENDIENTE 1 — Sensibilidad de fuente de PV en los días CON ENS

**Por qué importa**: es la prueba de robustez del hallazgo principal (el ENS del S-MPC vs D-MPC). Sin ella, la sensibilidad está sin demostrar.

**El problema verificado**: el spot-check existente (`expA2_daily_era54d.csv`) cubrió **07-24→07-27** (días soleados, ENS = 0 en ambas fuentes). Los días con ENS son **08-03, 08-05, 08-06** → **solape = ∅**. Se validó el mecanismo donde no ocurre.

**Datos a comparar (14 días, mongo, isla)**:
| Estrategia | Días con ENS | ENS total |
|---|---|---|
| S-MPC | 08-03 (1.12 kWh), 08-05 (2.33 kWh) | 3.45 kWh |
| D-MPC | 08-03 (2.62), 08-05 (6.19), 08-06 (1.83) | 10.65 kWh |
| MPC-PI | ninguno | 0.04 kWh |

**Qué hacer** (30-60 min):
```bash
cd optimization
python -m optimization.experiments.experiment_a2_stochastic \
    --days 3 --start-date 2026-08-03 --modes isla --pv-source era5
```
*y repetir con `--pv-source mongo` (o reutilizar los 14 d existentes) para la misma ventana.*

**Criterio**: en esos 3 días adversos, ¿se mantiene que S-MPC deja **menos ENS** que D-MPC con la otra fuente de PV? Si sí → hallazgo robusto a la fuente. Si no → documentar la dependencia.

---

## 3. 📊 PENDIENTE 2 — Vertido del 74% del PV y el mínimo técnico del diésel

**Evidencia (S-MPC, isla, 14 días)**:
```
PV del periodo        ≈ 2,530 kWh
Vertido (curtailed)   = 1,868 kWh   ← 74% del PV
Diésel quemado        = 8,006 L
ENS                   = 3.45 kWh
```

**Causa**: el **mínimo técnico del diésel (50 kW) ≈ la carga media (44 kW)**. Con el diésel clavado en su mínimo y la carga ya cubierta, el PV no tiene a dónde ir → se vierte. Eso explica 3 cosas:
1. por qué el ENS residual es diurno con el diésel a ~52 kW;
2. por qué aparece en días nublados (menos PV → el margen se rompe);
3. **por qué el PV adicional no desplaza diésel** → la "insensibilidad a la fuente de PV" **no es una virtud del diseño, es consecuencia del cuello de botella**.

**Qué documentar** (sin re-correr nada):
- Subsección en `informe.md` §7.5: "Limitación de dimensionamiento: mínimo técnico del diésel y vertido del PV".
- Mensaje: en isla, **más PV no ayuda** (se vierte); la palanca es **reducir el mínimo técnico del generador** o **ampliar el almacenamiento**.
- Cautela: sin esto, un jurado puede leer "robustez a la fuente de PV" donde en realidad hay un cuello de botella.

---

## 4. ⚠️ PENDIENTE 3 — Experimento D: ¿sirve el MPC *en su bucle real*?

**Pregunta sin responder**: los experimentos A/A2 validan el mismo `build_and_solve`, pero con **topología fija del config** y **pronóstico anclado a fechas pasadas**. No existe evidencia del comportamiento del ciclo real del diagrama: **no hay logs ni resultados de producción guardados** (`.dev-logs/` no existe; `results/` solo tiene los experimentos), y el lazo **no es cerrado** (el MPC propone el plan; no ejecuta acciones).

**Qué falta medir**:
| Eje | Métrica |
|---|---|
| Deriva plan → realidad | Error de seguimiento por hora; cuántas horas hubo que corregir |
| Estabilidad entre ciclos (15 min) | Volatilidad de la primera acción entre ciclos consecutivos |
| Pronóstico en vivo vs anclado | MAE del PV predicho vs medido (PatchTST con `past_days` vs `anchor`) |
| MPC en vivo vs heurística | Replay de una ventana real: MPC con pronóstico en vivo vs HEUR con realizados |

**Entregable esperado**: registro de ciclos (job, topología, plan) + tabla de deriva/estabilidad + conclusión "sirve / sirve con reservas / no sirve" para el bucle.

---

## 5. ⚠️ PENDIENTE 4 — El nodo "Red" del diagrama está en 400 kW

**Hallazgo**: la topología por defecto del bucle (`mpcScheduler.js` `DEFAULT_TOPOLOGY`) tiene `max_import_kw: 400`, `min_import_kw: -300`; el experimento validó con **30 / 10 / 0 kW**.

**Implicación**: con 400 kW el diagrama opera el S-MPC **en el único régimen donde su ventaja no se mide** (no hay ENS que reducir; el determinista es marginalmente mejor, p=0.003).

**Acción recomendada**: ajustar el nodo Red del diagrama a la **capacidad real del sitio** (Pasto: red débil → 30 kW; isla → 0). Si el sitio realmente tiene 400 kW, el hallazgo honesto es que el MPC no aporta ahorro medible ahí (solo robustez ante contingencias). Además: revisar si el sitio permite **exportación** (`min_import_kw` negativo).

---

## 6. Contexto técnico para retomar

**Commits relevantes** (rama `main`):
- `2e60acf` sensibilidad de fuente PV + §7.5 del informe
- `84fb70f` cota con serie realizada + diagnóstico horario del ENS
- `85b2045` Experimento A2 completo
- `80cbcf5` Exp A: columna SoC final + costo normalizado
- `1b0af86` SOC propagado entre días (lazo continuo)
- `645918e` ventana 14 d contigua con `--start-date`
- `b0ba888` HEUR cubre déficit > grid_max · `41d8aad` cierre correcciones

**Archivos clave**:
- `optimization/solver/model_builder.py` — modelo MILP (bucle de producción)
- `optimization/experiments/{experiment_a,experiment_a2_stochastic,backtest,strategies,metrics,config}.py`
- `Backend/services/mpcScheduler.js` — ciclo automático cada 15 min
- `results/pasto_narino/experiments/expA2_*` — salidas del A2 (métricas, daily, hourly, figuras, tabla)
- `informe.md` §7.5 — sección del A2
- Documentos de auditoría: `docs/PLAN_CORRECCION_MPC.md`, `docs/VERIFICACION_CORRECCIONES_MPC.md`, `docs/CORRECCIONES_FINALES_MPC.md`, `docs/CIERRE_CORRECCIONES_MPC.md`

**Aviso**: existe `origin/experimental` divergente (`efe8495` "Trabajo sesión SIGE…") que **no está en `main`** — confirmar cuál es la rama de trabajo activa.

**Convenciones del experimento** (no cambiar): SOC inicial 0.65; lazo continuo con SOC propagado; `export_tariff = 0`; degradación BESS 40 COP/kWh; `ENS` penalizado 5,000 COP/kWh (métrica, no violación); costo normalizado `= costo + (130 − SoC_final)·80`; fuente de PV principal = **mongo**, sensibilidad = **era5**.

---

## 7. Respuesta corta a "¿sirve el MPC del bucle?"

> El motor es **sólido** (0.45 s p50, 120/120 óptimos, margen 1,525× sobre el ciclo de 15 min) y su valor es **claro en escasez** (ENS −67%, CVaR −10.8% vs determinista). En **operación normal con red holgada no supera a la heurística** (y el determinista le gana marginalmente). Su desempeño **en el ciclo real del diagrama aún no tiene evidencia** (sin logs de producción, lazo no cerrado) → eso es el Experimento D. Y el nodo Red en 400 kW lo mantiene hoy en el régimen equivocado.

---

## 8. BLOQUE FINAL — Validación diferida (decisión del autor, 2026-10-09)

> **Decisión explícita**: el esfuerzo se concentra en el **desarrollo de producción** (eje del
> programa / bucle del diagrama). La **validación en escenarios se ejecuta al final**. No se
> elimina nada: queda registrado aquí con su comando y su criterio.

| # | Qué | Cuándo se retoma | Por qué se difiere |
|---|---|---|---|
| V1 | Re-corrida del **Exp A2** (14 d, isla) con la **banda corregida** del cambio 06 | Al cerrar el desarrollo | Necesita la banda nueva para ser interpretable |
| V2 | **Escenarios de red** (grid30 / grid10 / isla) con la banda corregida | Al final | Es el experimento que mide el valor del S-MPC |
| V3 | **Sensibilidad de fuente PV** en días con ENS (08-03, 08-05) | Al final | 30-60 min; no bloquea nada |
| V4 | **Significancia estadística** (~35 d, p<0.05) | Al final | ~30-40 h de solver; proyección ya documentada |
| V5 | **Experimento D** — validación del bucle en vivo (deriva plan→realidad, estabilidad entre ciclos, pronóstico en vivo vs anclado) | Al final, sobre el programa ya desarrollado | Mide el programa terminado, no el intermedio |
| V6 | Verificación de que el **S-MPC se separa del D-MPC** con la banda real | Al final (junto a V1/V2) | Es la pregunta que la banda corregida habilita |
| V7 | Re-correr **ExpA/A2 con el job que ya incluye el inversor** (cambio 13: PV efectivo −3 %; cifras publicadas = **anteriores al inversor**, no reproducibles con el job nuevo). Al hacerla: **grid30 con/sin inversor** (mismas fechas, mismo solver; única diferencia el inversor) y reportar delta de costo/ENS/litros diésel (+ par en ISLA como contraste: ahí el PV ya se vertía ~74 %, el delta debería ser ~0) | Bloque final (con V1/V2) | Sonda 2026-10-12: 1 día grid30 no termina en <280 s (HiGHS) → 3 d × 2 ≥ ~30 min, en el límite; no se fuerza (decisión del autor: sin cómputo largo en este paso) |
| V8 | **ExpA2 con los switches (cambio 15)**: (a) modo `impuesta` → el **sha256 de la tabla de costos** debe ser idéntico al de antes (es el C6 del 15, no cerrable sin Mongo); (b) modo `solver` **end-to-end** (solo se construyó y verificó el job) para ver qué topología elige y a qué costo | Bloque final (con V1/V2/V7) | No se pudo correr en el entorno del implementador (sin Mongo). **Además**: la evidencia pre-cambio del C6 debe versionarse como artefacto (`reference/resultados/golden_impuesto.json`), no vivir en el texto del VERIFICACION |

**Regla de esta decisión**: ningún cambio de **producción** queda bloqueado esperando a la
validación. Los criterios de cierre de los cambios de producción se verifican con **pruebas
unitarias + medición local**, no con re-corridas experimentales.

---

## 9. PENDIENTES TÉCNICOS ABIERTOS (no son validación; bloquean cierres)

Estos **no** son experimentos diferidos: son criterios de cierre sin satisfacer o defectos
conocidos. Se listan juntos para no perderlos entre auditorías.

| # | Pendiente | Origen | Por qué importa | Cuándo | Estado |
|---|---|---|---|---|---|
| **P1** | **Medir C1/C2 (fluidez del cambio 16)** con el harness del C0 (`fpsMeter.js` ya versionado): pares intercalados en la misma sesión, orden aleatorio, mediana, pares crudos, contador de renders. Criterio: mediana post ≥ umbral (−5 % sobre el C0 re-basado con el mismo método). | `AUDITORIA_16.md` §3.1 | **El cambio 16 no puede cerrarse sin esto.** Dos intentos fallidos **por entorno** (Chrome headless y Firefox+geckodriver); causa raíz: gate de auth (`sensor_user`) + degradación en sesiones largas. | Medido 2026-10-19 | ✅ **cerrado** (`fps_pares_2026-10-19.json`, manifiesto completo): OFF mediana 17.75 → umbral 16.86, ON mediana 19.85 → **PASA** |
| **P2** | **`fetchDevices` con `includeInactive` por llamada** (default `false`) y que solo la pantalla de gestión pida `true`. Además: filtrar por `status` en `SensorMappingPanel` y/o avisar *“sensor inactivo: no recibirá datos nuevos”*. | `REVISION_CRUD_SENSORES.md` §3.1 | El thunk es **compartido**: el **diagrama** y el **selector de sensores** ahora ofrecen sensores inactivos/en mantenimiento, enlazables en `sensor_mappings`. Un sensor inactivo **no ingiere** → el bucle calibrar→predecir→optimizar queda **mudo** y el panel no lo advierte. | Antes de operar el diagrama con sensores desactivados | ✅ **cerrado** (fetchDevices(opts), modo persistente en el slice, panel activos+enlazados con aviso declarado) |
| **P3** | **Borrado de sensor no destructivo**: archivar en vez de `dropCollection` (renombrar a `_deleted_<id>_<ts>`), decir en la UI **cuántas lecturas** se archivan, y **detectar referencias** (`sensor_mappings` del diagrama / calibración que usa ese histórico) declarándolo en la respuesta. | `REVISION_CRUD_SENSORES.md` §3.2 | Hoy **borra la colección completa de lecturas de un tirón**, sin retorno y sin comprobar si el MPC o una calibración dependen de ese sensor. Va contra la regla del proyecto (*“los artefactos no se borran: se archivan”*). | **Antes de borrar cualquier sensor de la planta real** | ✅ **cerrado** (rename a `_deleted_*`, 409 con impact + `?force=true`, preflight `GET /sensors/:id/impact` en la UI) |
| **P4** | `canManageSensor`: añadir `if (!sensor.userId) return false;` | `REVISION_CRUD_SENSORES.md` §3.3 | Es **fail-open** en el caso límite. Función pre-existente, pero ahora **gobierna un borrado**. | Al siguiente toque de ese archivo | ✅ **cerrado** (guard + 6/6 tests) |
| **P5** | Tests de autorización mínimos para las rutas nuevas: `PATCH /sensors/:id/status` y `DELETE /sensors/:id` → **403** para no-dueño, **200** para dueño. | `REVISION_CRUD_SENSORES.md` §3.4 | El repo **no tiene suite JS** y este PR estrena dos rutas **destructivas** sin red automatizada. | Al montar runner (o antes de tocar esas rutas otra vez) | ✅ **cerrado con artefacto** (`8cc0f87`): `Backend/tests/README.md` versiona comando + **TAP 6/6 (exit 0)** + **sha256 del test** (verificado por la auditoría contra el blob) y corre contra **BD propia de test** |
| **P6** | **Registrar el CRUD de sensores en el índice** (`integracion_plataforma/README.md`) y en `AGENTS.md`: estados `active/inactive/maintenance`, qué implica cada uno (solo `active` ingiere MQTT) y que el borrado archiva el histórico. | `REVISION_CRUD_SENSORES.md` §4 | El índice es el estado oficial del proyecto; hoy no menciona que los sensores ya se gestionan desde la UI. | Con el siguiente cambio que toque sensores | ✅ **cerrado** (fila S1 + notas en AGENTS.md) |
| **P7** | **Cambio 05 (contexto climático)**: auto-reporte pendiente del implementador — `yarn build` / `yarn lint`, V1–V5 en navegador y criterio 10 (espejo Mongo). | `cambio_05_contexto_climatico_visual/VERIFICACION_MVP.md` | F1/F2 quedaron **medidos** (5/5 PASS, anclas idénticas al cross-check Python); lo que falta es el build y la verificación visual. | Al retomar el 05 (eje del capítulo climático) | ⬜ abierto (P1 del 16 ya no lo bloquea) |

**Cómo se cierra cada uno**: P1 con el artefacto de la medición (pares crudos) → cierra el cambio 16.
P2–P6 con el PR correspondiente **y su fila en el índice**. P7 con el auto-reporte del implementador.
Ninguno de ellos cambia resultados publicados: P2/P3 son de UI-servicio, P1 es de rendimiento. (docs(sensores): P6 registro S1 + seccion 9 de pendientes)
