# Cambio 02 — Correcciones del provider MOS

**Estado**: 🟢 **Listo para implementar**.
**Origen**: hallazgos de la revisión QA del Cambio 01
(ver `../cambio_01_mos_forecaster/REVISION_QA.md`, evidencia ejecutada).
**Prerequisito**: Cambio 01 aplicado (ya está en `2d9f816`).
**Bloquea a**: el PASO 2 del Cambio 01 y cualquier uso real del provider en Windows.

---

## Resumen

El provider del Cambio 01 **funciona** (probado end‑to‑end), pero tiene 3 defectos:
2 bloqueantes y 1 de robustez. Se corrigen aquí, en orden.

| # | Defecto | Severidad | Archivos que toca |
|---|---|---|---|
| 1 | git/CRLF corrompe los 10 modelos LightGBM | 🔴 Crítica | `.gitattributes` (**nuevo**) |
| 2 | `precipitation` devuelve GHI crudo (W/m²) | 🔴 Crítica | `mos_forecaster.py` |
| 3 | Import circular `mos_forecaster` ↔ `forecaster` | 🟠 Media | `forecaster.py` |

---

## Fix 1 — CRLF rompe los modelos (bloqueante en Windows)

**Síntoma**: `[LightGBM] [Fatal] Model format error, expect a tree here` y el
proceso **muere** (no es excepción capturable).

**Causa raíz demostrada**: `core.autocrlf = true` en el gitconfig del sistema y el
repo **no tiene `.gitattributes`**. El blob en git está en **LF** (repo sano), pero
el checkout en Windows escribe **CRLF** (+9,647 bytes = exactamente los CR).

**Arreglo**:

1. Crear `.gitattributes` en la raíz del repositorio con:
   ```
   # Artefactos de modelo: sin conversión de fin de línea
   optimization/prediction/mos/** -text
   *.pt binary
   ```
2. Renormalizar el working tree:
   ```bash
   rm -rf optimization/prediction/mos/models/*.txt
   git checkout -- optimization/prediction/mos/models/
   ```
3. **Verificar** (debe imprimir OK):
   ```bash
   python -c "import lightgbm as lgb; \
   lgb.Booster(model_file='optimization/prediction/mos/models/lgbm_mos_shortwave_radiation.txt'); \
   print('OK')"
   ```

---

## Fix 2 — `precipitation` devuelve GHI

**Síntoma medido**: `precipitation` acumula **16,139** en 72 h; valores horarios
785–933 (imposible para mm/h).

**Causa**: la rama pass‑through usa `_PROXY[var]` y `_PROXY["precipitation"] = "ghi"`
→ copia el **GHI crudo del NWP**. Además `precipitation` **no se pide a ECMWF**
(`_ECMWF_COLS` no tiene tag de precipitación), así que no existe fuente real.

**Prueba**: `precipitation` ≈ GHI con máx |Δ| = 104 → es el GHI **crudo**, mientras
`shortwave_radiation` es el GHI **corregido por el MOS**.

**Arreglo**:

1. Pedir la precipitación en el NWP: `_ECMWF_COLS["precipitation"] = "precip"`.
2. Usar un mapa **propio** para el pass‑through (no `_PROXY`):
   ```python
   _PASS_SRC = {"cloud_cover": "nubes", "precipitation": "precip"}
   central[var] = np.nan_to_num(proxy_src[_PASS_SRC[var]].values[:horizon])
   ```
3. **No tocar** el vector de features del MOS: ahí `precipitation` debe seguir
   siendo `0.0` (`_PROXY_SCALE["precipitation"] = 0.0`) para reproducir el
   entrenamiento. El MOS no predice precipitación; solo se **transfiere** el NWP.

**⚠️ Impacto si no se corrige**: la precipitación entra al pipeline aguas abajo con
cientos de "mm/h" → puede corromper derating/suciedad y cualquier modelo que la use.

---

## Fix 3 — Import circular

**Síntoma**: `import optimization.prediction.mos_forecaster` →
`ImportError: cannot import name 'MOSClimateForecaster' from partially initialized module`.

**Causa**: `mos_forecaster.py` importa `forecaster.py` (línea 32) y `forecaster.py`
importa `mos_forecaster.py` (línea 408) **a nivel de módulo**.

**Alcance real**: la API **no** se rompe (`main.py` no importa `forecaster`), pero
falla todo import **directo**: tests y el script del PASO 2 (que necesita
`MOSClimateForecaster`).

**Arreglo** (elegir una):

- **(a)** Resolver el provider de forma **perezosa** dentro de `get_climate_provider()`
  en lugar de importarlo a nivel de módulo; o
- **(b)** mover `ClimateForecast` / `ClimateForecaster` a un módulo compartido
  (p. ej. `predictor_interface.py`) e importarlos desde ahí en ambos.

**Decisión recomendada**: (a) — es el cambio más pequeño y no mueve código existente.

---

## Criterio de cierre

- [ ] `python -c "import lightgbm as lgb; lgb.Booster(model_file='.../lgbm_mos_shortwave_radiation.txt')"` → **OK** en Windows (sin `[Fatal]`).
- [ ] `import optimization.prediction.mos_forecaster` (directo) → **sin ImportError**.
- [ ] `forecast()` en vivo: **`precipitation` total < 50 mm** en 72 h y **≠ GHI** (comparar hora a hora).
- [ ] `forecast()` sigue devolviendo `(72, 10)`, tz `America/Bogota`, **0 NaN**.
- [ ] Los providers `openmeteo`, `timesfm`, `patchtst` siguen funcionando idéntico.
- [ ] Los otros 9 targets **no cambian** respecto al Cambio 01 (regresión cero).

## Verificación de regresión (obligatoria)

Comparar antes/después del Fix 2: los 9 targets distintos de `precipitation` deben
ser **byte‑idénticos**. Solo `precipitation` puede cambiar.

---

## Trazabilidad

- Evidencia completa: `../cambio_01_mos_forecaster/REVISION_QA.md`
- Spec original del provider: `../cambio_01_mos_forecaster/SPEC_MOS_FASE1.md`
- Verificación ejecutada: 42/42 pesos del iTransformer cargados; predicciones de
  los 10 LightGBM **idénticas** a las originales (no hubo reentrenamiento).
