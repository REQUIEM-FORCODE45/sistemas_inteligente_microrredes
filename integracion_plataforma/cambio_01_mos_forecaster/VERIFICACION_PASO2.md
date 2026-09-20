# VERIFICACIÓN — PASO 2 (comparativa + panel)

**Commit verificado**: `98ff052` (`feat(paso2): comparativa MOS vs resto (motor + panel) — Opción B, step_h=6`).
**Método**: ejecución (no lectura) — regresión comparada contra el commit anterior,
inspección de los artefactos, de las figuras y del panel.

**Veredicto**: la **ingeniería está muy bien** (regresión cero, aliasing resuelto, Opción B
correcta, panel completo). Pero **la comparativa todavía no sirve para concluir sobre el
MOS**: hay 12 filas degeneradas y una causa raíz que distorsiona la fila del MOS.

---

## ✅ Verificado correcto

| # | Qué | Evidencia |
|---|---|---|
| 1 | **Regresión cero** | `providers=()` comparado contra el `evaluate.py` del commit anterior, misma entrada, 2424 filas: **max|Δmae| = 0.000e+00**, 0/2424 distintas. Columnas nuevas `se`/`err` puramente aditivas. |
| 2 | **Aliasing resuelto** | GHI ahora tiene muestras en los **6 horizontes**: n = 559 / 651 / 651 / 651 / 651 / 651 (antes solo h=12). |
| 3 | **`ecmwf_crudo` no degenerado** | Usa `models="ecmwf_ifs025"` → MAE GHI 61–64 W/m² (no 0). Coherente con nuestro 29 W/m² medido sin filtro diurno. |
| 4 | **Opción B bien hecha** | Contexto del archive **solo** en la rama `anchor is not None`; corte anti-fuga `index < anchor` conservado; **la trampa del caché se evitó** (return temprano, `_ctx_raw` intacto en la ruta en vivo). |
| 5 | **Panel completo** | 4 rutas con `validateJwt`; servicio que **degrada** (`available:false`, nunca 500); montado con `ErrorBoundary compact`; paleta/estilos Plotly coherentes con el Dashboard. |
| 6 | **Reanudable** | Corrida por mes calendario (12 parciales) + `--no-resume`; `--step-delay` para no tumbar la cuota. |
| 7 | **Artefactos** | 276 filas (5 contendientes × 6 horizontes × 10 variables − 24 que el crudo no tiene), `skill.json`, 2 figuras. |

---

## 🔴 Problema 1 — 12 filas degeneradas: `mos` ≈ 0.0 en cloud_cover y precipitation

```
contendiente  horizonte_h   variable        mae    n
mos                 1..72   cloud_cover     0.0  1304   (× 6 horizontes)
mos                 1..72   precipitation   0.0  1304   (× 6 horizontes)
```

**Causa**: en el backtest el **proxy del MOS es el archive ERA5 = la verdad misma**, y esas
dos variables son **pass-through** del proxy (decisión de diseño correcta). Comparar el
pass-through contra la verdad da 0 por construcción.

**Efecto visible ya**: en `fig_compare_bars.png` la barra del MOS en `cloud_cover`
**no se dibuja** → parece un modelo perfecto, y quien mira la figura no puede saber si es
un cero real o un dato faltante. Es exactamente la ambigüedad a evitar.

---

## 🔴 Problema 2 — El proxy del backtest NO es el del entrenamiento (causa raíz)

| Vía | Proxy que recibe el MOS |
|---|---|
| **Entrenamiento** (`scripts/mos_multivariable.py`, features `proxy_ecmwf`, `nubes_ecmwf`, `temp_ecmwf`, `viento_ecmwf`) | **ECMWF IFS** (`data/ecmwf/*.parquet`) |
| **En vivo** (`mos_forecaster.py:278`) | `models="ecmwf_ifs025"` ✅ |
| **Backtest** (`mos_forecaster.py:329`) | cliente **sin `models`** → **ERA5** ❌ |

Consecuencia grave: como en el backtest el proxy **es** la verdad, la corrección aprendida
por el LightGBM **distorsiona una entrada perfecta**. Lo que se mide no es la habilidad
del MOS, sino **la magnitud de su propia corrección**.

Esto **explica el Problema 1** y probablemente también las pérdidas del MOS en las
variables cuyas features son proxies (`temp_ecmwf`, `viento_ecmwf`, `nubes_ecmwf`).

**Arreglo (una línea)**: `models="ecmwf_ifs025"` en el cliente del proxy de la rama de
backtest → **arregla los dos problemas a la vez**. Requiere re-correr la fila del MOS.

---

## 🟠 Problema 3 — El resultado honesto: el MOS **solo domina en radiación**

MAE (filtro diurno), horizonte 24 h:

| Variable | mos | patchtst | ecmwf_crudo | gana |
|---|---|---|---|---|
| **shortwave_radiation** | **46.0** | 107.0 | 63.5 | 🟢 MOS (−27% vs crudo) |
| **direct_normal_irradiance** | **136.0** | 180.9 | — | 🟢 MOS |
| **diffuse_radiation** | **40.4** | 46.6 | — | 🟢 MOS |
| temperature_2m | 0.706 | **0.521** | 1.144 | 🔴 patchtst |
| surface_pressure | 1.165 | **0.365** | 1.810 | 🔴 patchtst |
| relative_humidity_2m | 6.028 | **3.385** | 7.587 | 🔴 patchtst |
| wind_speed_100m | 3.497 | **1.527** | — | 🔴 patchtst (**MOS es el peor**) |
| wind_speed_10m | 2.424 | **1.067** | 5.503 | 🔴 patchtst |

**No se debe concluir nada todavía sobre temp/RH/presión/viento**: son justo las variables
cuyas features del MOS son proxies, así que el Problema 2 las contamina. Radiación sí es
concluyente (y favorable).

---

## 🟠 Problema 4 — La figura de barras es ilegible para 5 de 10 variables

`fig_compare_bars.png` usa **un solo eje 0-210** para GHI (~45 W/m²), DNI (~138), nubes
(~12 %) y temperatura (~0.7 °C) → las barras de **precipitation, temperature, pressure,
wind100, wind10 quedan invisibles**.

Además: `ecmwf_crudo` figura en la leyenda pero **no se dibuja** en DNI/DHI (no las tiene).

**Recomendación**: separar en paneles por familia (radiación / termodinámica / viento),
o graficar **skill score** normalizado en vez de MAE absoluto; y no dibujar series
inexistentes (leyenda filtrada por disponibilidad) ni la barra del MOS en las 2 variables
pass-through (marcarlas **N/A**).

---

## 🟠 Problema 5 — Falta el artefacto del overlay: la 4.ª vista del panel está muerta

El servicio Node, ejecutado de verdad (no leído):

```
STATUS: available=true, running=false, files={detalle:…, resumen:…, skill:…,
                                              comparativa_series.json: null}
DETALLE 276 filas · contendientes: climatology, ecmwf_crudo, mos, patchtst, persistence
RESUMEN 30 filas · SKILL: skill_vs_persistence ✓
SERIES: available = false
```

`comparativa_series.json` / `.parquet` **no existen** — ni en el repo ni en todo el disco.
El componente `ForecastOverlayChart` los necesita (`if (!series || !series.time) return
"Sin serie de ejemplo."`) → **la vista de overlay temporal sale vacía**.

El código que los escribe existe (`compare_providers.py:218–241`), está **antes** de
`_figuras()` (que sí generó los PNG) y **no está ignorado por git**. Conclusión: ese bloque
**nunca se ejecutó** — el runner se corrió completo con una versión anterior (sin el bloque
de series) y no se volvió a ejecutar después de añadirlo.

**Arreglo**: ejecutar la cola del runner (o el runner completo) para que se generen
`comparativa_series.parquet` + `.json`, y **confirmar en la UI** que el overlay dibuja.
Si no se va a regenerar, al menos **ocultar el overlay** en el panel: una pestaña que
siempre dice "Sin serie de ejemplo" se lee como bug.

---

## Criterios de cierre — estado

| Criterio | Estado |
|---|---|
| `providers=()` → resultados idénticos | ✅ 0.000e+00 |
| 5 contendientes × 6 horizontes sin huecos | ⚠️ 24 filas del crudo sin datos (DNI/DHI/precip no existen en `ecmwf_ifs025`) → marcar N/A |
| MAE **por variable** | ✅ presente |
| Figuras revisadas | 🟠 legibles pero la de barras no comunica 5 variables |
| MOS gana o empata en radiación | ✅ gana en las 3 |
| Caveat same-family declarado | ⚠️ verificar que esté en el panel/figura |
| Panel carga <2 s y no rompe el Dashboard | ✅ por construcción (lee archivos; `available:false`) |

## Qué falta para cerrar el PASO 2

1. `models="ecmwf_ifs025"` en el proxy del backtest (**1 línea**).
2. Marcar N/A las variables que el proxy no tiene (y las 2 pass-through del MOS).
3. **Re-correr la fila del MOS** ⚠️ decisión: el resume por mes salta si el parcial existe
   → hay que borrar los parciales (`--no-resume`) o añadir un modo "re-correr un contendiente".
4. Rehacer `fig_compare_bars.png` (paneles por familia o skill normalizado).
5. Re-verificar la fila del MOS con la tabla de arriba como referencia.
