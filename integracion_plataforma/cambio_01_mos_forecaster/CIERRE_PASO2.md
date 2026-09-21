# CIERRE DEL PASO 2 — con los datos que ya tenemos

**Decisión del autor**: no se re-corre la comparativa (cuota Open-Meteo agotada —
verificado `HTTP 429 "Daily API request limit exceeded"`). Se cierra con lo verificado.

**Commit de código**: `1a0c19d` (fix del proxy IFS + figura de skill + N/A explícitos).
**Artefactos de resultados**: siguen siendo los de `98ff052` (**pre-fix**) — ver §4.

---

## 1. Ingeniería: demostrada ✅

| Verificación | Resultado |
|---|---|
| `providers=()` → regresión cero | **max\|Δmae\| = 0.000e+00** en 2424 filas (vs el commit anterior) |
| Aliasing de radiación | ✅ resuelto: GHI con muestras en los **6 horizontes** (n=559/651×5) |
| Opción B (contexto del archive) | ✅ solo en la rama `anchor`; corte anti-fuga conservado; caché no contaminado |
| Panel en el Dashboard | ✅ 4 rutas con `validateJwt`, servicio que degrada, montado con `ErrorBoundary` |
| Servicio Node **ejecutado** | ✅ 276 filas, 5 contendientes, skill ✓ |
| Fix del proxy IFS | ✅ aplicado y correcto (`mos_forecaster.py`, `models="ecmwf_ifs025"`) |
| Figura de barras reescrita | ✅ ahora es **skill vs persistencia** (adimensional, un solo eje) con N/A explícitos |

---

## 2. Hallazgos VÁLIDOS (contendientes sin contaminación) ✅

MAE a **h = 24** (filtro diurno en radiación). Solo `ecmwf_crudo`, `patchtst`,
`persistence`, `climatology` (el MOS queda fuera por §3):

| variable | ecmwf_crudo | patchtst | persistence | climatology | gana |
|---|---|---|---|---|---|
| **shortwave_radiation** | **63.50** | 107.04 | 124.07 | 102.54 | 🟢 **NWP crudo** |
| direct_normal_irradiance | — | **180.93** | 210.82 | 185.98 | patchtst |
| diffuse_radiation | — | 46.65 | 53.17 | **42.83** | climatology |
| temperature_2m | 1.14 | **0.89** | 1.00 | 0.99 | patchtst |
| surface_pressure | 1.81 | **0.68** | 0.75 | 0.81 | patchtst |
| relative_humidity_2m | 7.59 | **6.26** | 6.93 | 7.31 | patchtst |
| cloud_cover | 30.62 | **13.19** | 16.03 | 15.87 | patchtst |
| precipitation | — | **0.53** | 0.67 | 0.65 | patchtst |
| wind_speed_100m | — | **1.97** | 2.38 | 2.04 | patchtst |
| wind_speed_10m | 5.01 | **1.35** | 1.59 | 1.36 | patchtst |

**Conclusión publicable (y consistente con la arquitectura construida)**:

1. **Para GHI el NWP es la base correcta**: el ECMWF crudo (63.5) le gana a PatchTST
   (107.0) por **41%**. Un modelo de ML sobre observaciones no compite con la física
   del NWP en radiación → **el camino es corregir el NWP (MOS), no sustituirlo**.
2. **Para las otras 9 variables gana PatchTST** (ML puro) frente al NWP crudo
   (temp 0.89 vs 1.14, presión 0.68 vs 1.81, RH 6.26 vs 7.59, viento10 1.35 vs 5.01).
   Única excepción: DHI, donde gana la climatología (42.8).
3. Esto **justifica la arquitectura híbrida**: MOS/NWP para radiación +
   PatchTST/iTransformer para termodinámica y viento.
4. `ecmwf_crudo` **no tiene** DNI, DHI ni precipitación (el producto IFS no las expone
   en el archive) → esas celdas van como **N/A**, no como cero.

---

## 3. Lo que NO se puede concluir: la fila del MOS ⚠️

**Prueba de la contaminación**: las 2 variables que el MOS pasa sin corregir
(cloud_cover, precipitation) dan **exactamente 0.000** → el proxy del backtest **es
bit a bit la verdad** (ERA5). Y como ese proxy es además una de las 8 features del
LightGBM, **todas** las filas del MOS están contaminadas.

→ **La fila del MOS de esta tabla no mide su habilidad** y no debe usarse para concluir.

**La evidencia válida del MOS ya existe** y no depende de este backtest: la del propio
proyecto (`reports/stacking/mos_multivariable.json`), hecha con el proxy correcto
(ECMWF IFS) y la verdad ERA5 sobre jul-dic 2025 → **MOS GHI 29.44 vs ECMWF crudo 30.93**
(all-hours, protocolo distinto al diurno de esta tabla: no mezclar).

**El fix ya está en el código** (`1a0c19d`): al re-correr, la fila queda válida y las 2
variables pass-through dejan de ser tautológicas.

---

## 4. Estado de los artefactos y del panel ⚠️

| Artefacto | Estado |
|---|---|
| `comparativa_detalle.csv`, `_resumen.csv`, `skill.json` | 🟠 **pre-fix** (12 filas en 0.000) |
| `comparativa_detalle_2025-*.csv` (12 parciales) | 🟠 pre-fix |
| `fig_compare_bars.png` | 🟠 pre-fix (MAE en un solo eje; el código ya la reescribió) |
| `fig_compare_ghi.png` | 🟠 pre-fix (leyenda con series no dibujadas) |
| `comparativa_series.json` (overlay) | ❌ **no existe** → la vista de overlay sale vacía |

**El panel HOY muestra los números pre-fix.** No presentarlo como resultado final.

### Recomendación concreta para la UI (barata y de credibilidad)

El `comparativa_skill.json` ya guarda `meta.commit` y `meta.fecha`. Que el servicio Node
compare ese `commit` con el `HEAD` actual y, si no coinciden, el panel muestre
**"datos previos al fix (commit X) — re-correr"**. Así nadie lee una tabla vieja como si
fuera la actual, y no hace falta tocar nada más.

---

## 5. Pendiente (no bloquea la tesis)

1. **Re-correr la comparativa** → ⚠️ **decisión del autor: se descarta la de 12 meses** y se
   hace una **comparativa corta de 4 meses** (misma ventana para todos, fila del MOS válida).
   Plan y comando exactos en `../cambio_04_comparativa_corta/README.md` (~3 h, reanudable).
   ⚠️ **Antes de correr: borrar los parciales mensuales**
   (`rm -f results/pasto_narino/forecast/comparativa_detalle_20*.csv`). Si no, el resume
   los salta y produce **exactamente la tabla vieja** en segundos — el fallo silencioso
   más probable de todo este paso.
2. Marcar **N/A** en la tabla del panel (la figura ya lo hace).
3. `comparativa_series.json` se genera en esa misma corrida (overlay).
4. Re-verificar la fila del MOS: **sin degenerados**, con el proxy correcto.

---

## Resumen del cierre

| | |
|---|---|
| **PASO 2 — ingeniería** | ✅ cerrado y verificado |
| **PASO 2 — evidencia de radiación/viento/etc.** | ✅ válida para los 4 contendientes no contaminados |
| **PASO 2 — fila del MOS** | ⚠️ pendiente de re-corrida (fix listo); su evidencia válida es la del proyecto |
| **Fase 1** | prácticamente cerrada; solo queda una re-corrida por cuota |
