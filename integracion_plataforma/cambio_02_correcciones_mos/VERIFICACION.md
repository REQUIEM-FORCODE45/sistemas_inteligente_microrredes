# VERIFICACIÓN — Cambio 02 (correcciones del MOS)

**Commit verificado**: `b67ba09` (`fix(mos): CRLF vía .gitattributes + precip
pass-through real + import perezoso`).
**Método**: pruebas ejecutadas sobre un **clon limpio** del repo (no sobre el
working tree local, que todavía arrastra el estado anterior).

**Veredicto**: los 3 fixes son **correctos** y la regresión es **cero**. Quedan
**2 pendientes** (uno en el repo, uno local).

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
| En vivo (ECMWF, 24 h) | — | **0.70 mm**, `≠ GHI`, 0 NaN, tz OK |

Implementación revisada: `_ECMWF_COLS` ahora pide `"precipitation": "precip"` y el
pass‑through usa el mapa propio `_PASS_SRC` (no `_PROXY`). El vector de features del
MOS **no se tocó** (`_PROXY_SCALE["precipitation"] = 0.0` sigue igual) → el
entrenamiento se reproduce. ✔️

---

## ✅ Regresión — CERO

Comparación **elemento a elemento** (arrays de 72×10) entre el commit anterior
(`2d9f816`) y el actual (`b67ba09`), mismo `anchor=2026-09-10`, mismos modelos:

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

## 🟠 Fix 1 — `.gitattributes` · PARCIAL

**Lo correcto**: el archivo está bien escrito y **funciona**:
- En un **clon nuevo** (con `autocrlf=true`, igual que una máquina nueva) los modelos
  quedan en **LF (0 CRs)** y **cargan 10/10** con LightGBM. ✔️

**Pendiente 1 — hueco en el `.gitattributes`** (a corregir en el repo):

La regla `optimization/prediction/mos/** -text` **no cubre las copias del paquete**:

```
integracion_plataforma/cambio_01_mos_forecaster/models/lgbm_mos_shortwave_radiation.txt
  → CRs = 9,649  (CRLF)  → LightGBM muere
```

Es la **fuente de la que se copian los modelos** — un clon nuevo la entrega rota.
Ampliar la regla:

```
optimization/prediction/mos/** -text
integracion_plataforma/** -text
*.pt binary
```

**Pendiente 2 — renormalizar este clon** (operación local, una vez por máquina):

El `.gitattributes` solo se aplica al **escribir** archivos. Como la pull no
re-escribe los `.txt` (no cambiaron en el commit), este clon sigue con CRLF:

```bash
rm -rf optimization/prediction/mos/models/*.txt
git checkout -- optimization/prediction/mos/models/
```

Sin este paso, el provider **sigue fallando en esta máquina** aunque el repo esté bien.

---

## Resumen

| # | Fix | Estado |
|---|---|---|
| 1 | CRLF vía `.gitattributes` | 🟠 Correcto pero **parcial** (hueco en `integracion_plataforma/` + renorm. local) |
| 2 | Precipitación pass-through | ✅ Resuelto y verificado |
| 3 | Import perezoso | ✅ Resuelto y verificado |
| — | Regresión (9 targets) | ✅ **Cero** (0.000e+00) |
