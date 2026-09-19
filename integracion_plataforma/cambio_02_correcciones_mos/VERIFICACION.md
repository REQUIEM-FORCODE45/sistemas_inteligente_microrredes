# VERIFICACIÓN — Cambio 02 (correcciones del MOS)

**Commits verificados**: `b67ba09` (fixes) y `b92c72c` (cierre del hueco de `.gitattributes`).
**Método**: pruebas ejecutadas sobre **clones limpios** del repo (no sobre un working
tree heredado), más la comprobación de salud del clon de trabajo.

**Veredicto**: ✅ **Cambio 02 CERRADO**. Los 3 fixes correctos, regresión **cero**, y el
hueco del `.gitattributes` corregido y verificado.

---

## ✅ Fix 3 — Import circular · RESUELTO

| Prueba | Resultado |
|---|---|
| `import optimization.prediction.mos_forecaster` (directo) | **exit 0** → `OK mos` |
| `FORECASTER=mos` → `get_climate_provider()` | `MOSClimateForecaster` / `mos` — **sin** warning `desconocido` |

Implementación revisada: el import perezoso está **antes** del test de pertenencia
(`if name == "mos"` → resuelve → recién después `if name not in _PROVIDERS`), que es
justo el detalle que evita la degradación silenciosa a `openmeteo`. ✔️

---

## ✅ Fix 2 — `precipitation` · RESUELTO

| Prueba | Antes | Ahora |
|---|---|---|
| Total en 72 h (backtest) | **16,139** | **1.00** mm |
| Máximo horario | 933 | **0.30** mm/h |
| ¿`precipitation == GHI`? | Sí (bug) | **False** |
| Negativos | — | **ninguno** (rango 0.00–0.30) |
| En vivo (ECMWF, 24 h) | — | **0.70–0.80 mm**, `≠ GHI`, 0 NaN, tz OK |

Implementación revisada: `_ECMWF_COLS` ahora pide `"precipitation": "precip"` y el
pass‑through usa el mapa propio `_PASS_SRC` (no `_PROXY`). El vector de features del
MOS **no se tocó** (`_PROXY_SCALE["precipitation"] = 0.0` sigue igual) → el
entrenamiento se reproduce. ✔️

---

## ✅ Regresión — CERO

Comparación **elemento a elemento** (arrays de 72×10) entre el commit anterior
(`2d9f816`) y `b67ba09`, mismo `anchor=2026-09-10`, mismos modelos:

```
variable                         max|delta|   veredicto
shortwave_radiation               0.000e+00   IDENTICO
direct_normal_irradiance          0.000e+00   IDENTICO
diffuse_radiation                 0.000e+00   IDENTICO
temperature_2m                    0.000e+00   IDENTICO
relative_humidity_2m              0.000e+00   IDENTICO
cloud_cover                       0.000e+00   IDENTICO
wind_speed_100m                   0.000e+00   IDENTICO
wind_speed_10m                    0.000e+00   IDENTICO
surface_pressure                  0.000e+00   IDENTICO
precipitation                     9.519e+02   CAMBIO   <-- el fix
```

**9/10 con diferencia exactamente 0.000e+00.** Solo cambió `precipitation`, que es
lo buscado. ✔️

---

## ✅ Fix 1 — `.gitattributes` · RESUELTO (`b92c72c`)

La regla `optimization/prediction/mos/** -text` **no cubría las copias del paquete**
(`integracion_plataforma/…/models/`), que es de donde se copian los modelos.
Con `b92c72c` se añadió `integracion_plataforma/** -text`.

**Verificación en clon NUEVO** (con `autocrlf=true`, como una máquina recién clonada):

| Carpeta | CRs antes | CRs ahora | Modelos que cargan |
|---|---|---|---|
| `optimization/prediction/mos/models/` | 9,649 | **0** | **10/10** |
| `integracion_plataforma/cambio_01_mos_forecaster/models/` | 9,649 | **0** | **10/10** |

**Clon de trabajo** (tras la renormalización local `rm` + `git checkout`):

| Carpeta | CRs | Modelos que cargan |
|---|---|---|
| `optimization/prediction/mos/models/` | 0 | **10/10** |
| `integracion_plataforma/cambio_01_mos_forecaster/models/` | 2 | **10/10** |

> ⚠️ **Nota operativa**: el `.gitattributes` solo actúa al **escribir** archivos. Un
> clon que ya tenía los `.txt` en CRLF necesita **una vez** por máquina:
> ```bash
> rm -rf optimization/prediction/mos/models/*.txt \
>        integracion_plataforma/cambio_01_mos_forecaster/models/*.txt
> git checkout -- optimization/prediction/mos/models/ \
>                 integracion_plataforma/cambio_01_mos_forecaster/models/
> ```

---

## Resumen final

| # | Fix | Estado |
|---|---|---|
| 1 | CRLF vía `.gitattributes` (provider + paquete) | ✅ **Resuelto y verificado en clon nuevo** |
| 2 | Precipitación pass-through | ✅ Resuelto y verificado |
| 3 | Import perezoso | ✅ Resuelto y verificado |
| — | Regresión (9 targets) | ✅ **Cero** (0.000e+00) |
| — | Renormalización del clon de trabajo | ✅ Hecha |

**Cambio 02 cerrado.** Siguiente: PASO 2 (comparativa) del Cambio 01 —
spec en `../cambio_01_mos_forecaster/SPEC_MOS_FASE1.md §4`.
