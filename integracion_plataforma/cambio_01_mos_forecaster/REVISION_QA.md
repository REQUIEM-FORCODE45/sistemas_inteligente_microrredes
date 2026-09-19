# REVISIÓN QA — Cambio 01 (MOS provider)

**Revisor**: verificación independiente sobre el commit `2d9f816`.
**Método**: pruebas ejecutadas (no lectura). Import del módulo, carga de artefactos,
backtest con `anchor`, modo en vivo ECMWF, integridad de pesos, hashes.

**Veredicto**: el PASO 1 **funciona** (probado end‑to‑end), pero tiene **3 defectos**
(2 bloqueantes) y el **PASO 2 no está implementado**.

---

## ✅ Lo que se verificó correcto

| Check | Evidencia |
|---|---|
| Cambio en `forecaster.py` | Exactamente 2 líneas (import + `_PROVIDERS["mos"]`). Nada más tocado. |
| Artefactos sin alterar | sha256 coincide con `MANIFEST.json` tras normalizar CRLF → **no se reentrenó nada**. |
| Predicciones idénticas | Los 10 modelos del repo predicen igual que los originales. |
| Pesos del iTransformer | **42/42** tensores cargados, 0 faltantes, 0 sobrantes, 0 con forma distinta (`strict=False` es inocuo aquí). |
| Carga | `_load_lazy()` OK: 10 boosters + iTransformer. |
| Guardia de horizonte | `forecast(days=4)` → `RuntimeError: MOS: horizonte máx 72h (se pidió 96)` ✅ |
| Backtest con `anchor` | shape `(72, 10)`, índice tz‑aware America/Bogota, 0 NaN, `horizon_h=72`. |
| Modo en vivo | 72 h desde `2026-09-19 14:00-05:00`, GHI pico 827 W/m², Temp 14.7 °C, Presión 758.3 hPa → **físicamente coherentes**. |
| `cloud_cover` pass‑through | Correcto (usa el `cloud_cover` de ECMWF). |

---

## 🔴 DEFECTO 1 (bloqueante en Windows) — git corrompe los 10 modelos LightGBM

**Síntoma**: `lgb.Booster(model_file=...)` → `[LightGBM] [Fatal] Model format error,
expect a tree here` y **mata el proceso** (no es una excepción capturable).

**Causa raíz** (demostrada):
- `core.autocrlf = true` (gitconfig del sistema) y el repo **no tiene `.gitattributes`**.
- El blob en git está **en LF (0 CRs)** → el repositorio está sano.
- El working tree en Windows queda **con CRLF (9,649 CRs)** → git convirtió al hacer checkout.
- Diferencia de bytes = **9,647 = exactamente los CR insertados**.
- **Experimento controlado**: el mismo archivo con LF carga OK; con CRLF falla. → **el CRLF es la causa**.

**Impacto**: en cualquier máquina Windows con `autocrlf=true`, el provider MOS **no
puede cargar ninguno de sus 10 modelos**. En Linux/Colab funciona.

**Arreglo** (a nivel repo):

1. Crear `.gitattributes` en la raíz del repo:
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
3. Verificar:
   ```bash
   python -c "import lightgbm as lgb; lgb.Booster(model_file='optimization/prediction/mos/models/lgbm_mos_shortwave_radiation.txt'); print('OK')"
   ```

---

## 🟠 DEFECTO 2 — Import circular

**Síntoma**: `import optimization.prediction.mos_forecaster` →
`ImportError: cannot import name 'MOSClimateForecaster' from partially initialized module`.

**Causa**: `mos_forecaster.py` importa `forecaster.py` (línea 32) y `forecaster.py`
importa `mos_forecaster.py` (línea 408, a nivel de módulo).

**Alcance real**:
- ✅ Funciona si se importa **primero** `forecaster` (y `main.py` no importa
  `forecaster`, así que la API no se rompe).
- ❌ Falla en cualquier import **directo** de `mos_forecaster`: tests y el script
  del PASO 2 (que necesita `MOSClimateForecaster`).

**Arreglo** (una de dos):
- (a) Resolver el provider de forma perezosa dentro de `get_climate_provider()`
  en lugar de importarlo a nivel de módulo; o
- (b) mover `ClimateForecast` / `ClimateForecaster` a un módulo compartido
  (p. ej. `predictor_interface.py`) e importarlos desde ahí en ambos.

---

## 🔴 DEFECTO 3 — `precipitation` devuelve **GHI** (W/m²) en vez de mm/h

**Síntoma** (medido): `precipitation` total = **16,139** en 72 h. Valores horarios
785–933 — imposible para precipitación.

**Causa**: en la rama pass‑through se usa `_PROXY[var]`, y
`_PROXY["precipitation"] = "ghi"` → **se copia el GHI crudo del NWP**. Además
`precipitation` **no se pide a ECMWF** (`_ECMWF_COLS` no tiene tag de precipitación),
así que no hay fuente real de precipitación.

**Prueba**: `precipitation` ≈ GHI pero **no iguales** (máx |Δ| = 104) → es el GHI
**crudo** del NWP, mientras `shortwave_radiation` es el GHI **corregido por el MOS**.

**Arreglo**:
1. Añadir la precipitación al request: `_ECMWF_COLS["precipitation"] = "precip"`.
2. Usar un mapa propio para el pass‑through en vez de `_PROXY`:
   `_PASS_SRC = {"cloud_cover": "nubes", "precipitation": "precip"}`.
3. **No tocar** el vector de features del MOS: ahí
   `precipitation` debe seguir siendo `0.0` (`_PROXY_SCALE["precipitation"] = 0.0`)
   para reproducir el entrenamiento.

**Impacto si no se corrige**: la precipitación entra al pipeline aguas abajo con
valores de cientos de "mm/h" → puede corromper derating/suciedad y cualquier
modelo que la consuma.

---

## ⚪ PASO 2 — NO implementado

El commit solo contiene el PASO 1 (14 archivos: `forecaster.py` + 12 artefactos +
`mos_forecaster.py`). **Falta el script de comparativa** con el protocolo del repo:

- Mismos horizontes (1/6/12/24/48/72 h), mismo periodo, misma verdad (ERA5).
- Contendientes: `mos` vs `patchtst` (con `anchor`) vs **ECMWF archive crudo** vs
  persistencia/climatología.
- `daytime_only` para radiación; MAE, nRMSE, bias, Skill Score.
- ⚠️ `openmeteo` **no** puede backdatearse (solo `now`) → fuera del backtest.

---

## Resumen para el implementador

| # | Defecto | Severidad | ¿Bloquea? |
|---|---|---|---|
| 1 | CRLF rompe los 10 modelos LightGBM | 🔴 Crítica | Sí (Windows) |
| 2 | Import circular | 🟠 Media | No (API), sí (tests/PASO 2) |
| 3 | `precipitation` = GHI crudo | 🔴 Crítica | Sí (datos inválidos) |
| 4 | PASO 2 sin implementar | ⚪ Pendiente | — |
