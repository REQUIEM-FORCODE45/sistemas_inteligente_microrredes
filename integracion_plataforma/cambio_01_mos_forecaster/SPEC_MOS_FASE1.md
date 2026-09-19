# SPEC — FASE 1: Integración del MOS en el repositorio `sistemas_inteligente_microrredes`

> **Destinatario**: la IA/programador que IMPLEMENTA (no este asistente).
> **Alcance**: PASO 1 (adaptador `mos_forecaster.py` → contrato `ClimateForecast`) y
> PASO 2 (comparativa MOS vs PatchTST/OpenMeteo con el protocolo del repo).
> **Regla**: NO se reescribe nada existente. Solo se AÑADE un provider y un script de comparación.
> **Nivel**: especificación de implementación — qué construir, con qué contrato exacto y cómo se verifica.

---

## 0. Resumen ejecutivo (qué se busca y por qué)

El repositorio ya tiene una arquitectura de pronóstico climático con **contrato fijo** y **factory por variable de entorno**. Se debe integrar el **MOS (Model Output Statistics)** desarrollado en `tesis-microrred` — un corrector LightGBM que post-procesa el pronóstico NWP ECMWF— como un **cuarto provider** con el mismo contrato, sin romper los tres existentes.

**Evidencia que motiva el cambio** (validada en doble periodo, `tesis-microrred/docs/HANDOFF_TECNICO.md` §19):

| Variable | Provider actual (referencia) | MOS |
|---|---|---|
| GHI (MAE, jul-dic 2025) | 51.17 W/m² (iTransformer histórico) | **29.26 W/m² (−42.8%)** |
| DNI | 95.09 | **62.05 (−34.7%)** |
| DHI | 22.04 | 17.95 (−18.5%) |
| Temperatura | 0.89 °C | **0.59 (−33.9%)** |
| Presión | 0.78 hPa | **0.40 (−49.1%)** |
| RH | 6.55 % | 4.42 (−32.4%) |
| Nube | 14.95 | 15.14 (**sin mejora**) |
| Precipitación | 0.40 | 0.44 (**sin mejora**) |

⚠️ **Advertencia metodológica obligatoria**: el MOS se calibró con ECMWF de *archive/reanálisis*, que es de la **misma familia** que ERA5 (la verdad). El MAE es por ello **optimista** frente a un ECMWF operativo real (emitido horas antes). Debe reportarse como *"pronóstico NWP corregido con ML"*, nunca como *"ML puro"*.

---

## 1. Contrato del repositorio (EXACTO — no inventar)

### 1.1 Objeto de salida

```python
# optimization/prediction/forecaster.py
@dataclass
class ClimateForecast:
    data: pd.DataFrame      # index timestamp tz-aware (America/Bogota), horario
    horizon_h: int
    provider: str
```

`data` debe tener **exactamente las 10 columnas** de `WEATHER_VARIABLES`, en ese orden:

```python
# optimization/weather/openmeteo.py (línea ~29)
WEATHER_VARIABLES = [
  "shortwave_radiation",       # GHI  [W/m2]
  "direct_normal_irradiance",  # DNI  [W/m2]
  "diffuse_radiation",         # DHI  [W/m2]
  "temperature_2m",            #      [C]
  "relative_humidity_2m",      #      [%]
  "cloud_cover",               #      [%]
  "wind_speed_100m",           #      [m/s]
  "wind_speed_10m",            #      [m/s]
  "surface_pressure",          #      [hPa]
  "precipitation",             #      [mm]
]
```

### 1.2 Clase base e interfaz

```python
class ClimateForecaster(ABC):
    provider_name: str = "abstract"
    @abstractmethod
    def forecast(self, days: float = 1.0) -> ClimateForecast: ...
```

### 1.3 Factory (único punto de registro)

```python
# optimization/prediction/forecaster.py (línea ~408)
_PROVIDERS = {
    "openmeteo": OpenMeteoClimateForecaster,
    "timesfm":   TimesFMClimateForecaster,
    "patchtst":  PatchTSTClimateForecaster,
}
def get_climate_provider(site_cfg=None, name=None):
    name = (name or os.environ.get("FORECASTER") or "openmeteo").lower()
    if name not in _PROVIDERS: name = "openmeteo"   # fallback silencioso
    return _PROVIDERS[name](site_cfg or load_site(DEFAULT_SITE)["site"])
```

### 1.4 Patrón obligatorio de los providers ML (copiar de PatchTST)

`PatchTSTClimateForecaster` (línea ~196) es el modelo a imitar. Sus reglas:

| Regla | Detalle |
|---|---|
| `MAX_HORIZON_H = 72` | Si `days*24 > 72` → `raise RuntimeError(...)` (el repo lo captura en `main.py` y devuelve `{"status":"error"}`) |
| Carga **lazy** | El modelo pesado se carga en la 1ª llamada a `.forecast()`, no en `__init__` |
| Anclaje a `now` | El contexto termina en la **hora actual** (Open-Meteo `past_days`, NO ERA5 archive); el pronóstico arranca en `now` |
| Param `anchor` | `forecast(days, anchor: pd.Timestamp|None)` — permite emitir el pronóstico "como si fuera" una fecha pasada. **Requerido por el backtest (Experimento A)** |
| Cuantiles | Internamente el modelo produce P10/P50/P90, pero **el contrato solo expone la serie central (P50)**. La incertidumbre la añade después la capa de calibración/conformal |
| Recorte | `out = out.iloc[:horizon]` |
| Clip | Radiación/viento/precipitación → `np.clip(..., 0, None)` |

### 1.5 Consumidores del contrato (no romper)

- `optimization/prediction/main.py` → `GET /predict/weather?provider=`
- `optimization/prediction/sensor_predictor.py` → bandas P10/P50/P90 del sensor calibrado
- `optimization/calibration/*` → física (pvlib) + residuo GBR + conformal
- `Backend/services/predictionPipeline.js` → pipeline Node→Python

---

## 2. Artefactos a portar desde `tesis-microrred`

| Artefacto | Origen | Destino en repo | Notas |
|---|---|---|---|
| 10 modelos LightGBM MOS | `reports/stacking/lgbm_mos_<variable>.txt` | `optimization/prediction/mos/models/` | Nombres **exactos por variable** (`lgbm_mos_shortwave_radiation.txt`, …). Ver §2.2 |
| Config iTransformer v1 | `modelos_itransformer/modelo_b.pt` + `config_modelos.json` | `optimization/prediction/mos/itransformer/` | Para la feature `v1` (§3.3) |
| Script de referencia | `scripts/prediccion_en_vivo.py` | — (solo referencia) | Implementa la receta completa en runtime |
| Script de entrenamiento | `scripts/mos_multivariable.py` | — (solo referencia) | Define features/params del modelo |

### 2.1 Variables con modelo MOS (10 archivos)

`shortwave_radiation`, `direct_normal_irradiance`, `diffuse_radiation`, `temperature_2m`,
`relative_humidity_2m`, `cloud_cover`, `wind_speed_100m`, `wind_speed_10m`,
`surface_pressure`, `precipitation`.

> **Ojo**: en `reports/stacking/` existe además `lgbm_mos_ghi.txt` (experimento piloto de solo GHI). **NO usar** — el canónico es `lgbm_mos_shortwave_radiation.txt`.

### 2.2 Hiperparámetros del modelo (reproducibilidad)

```python
lgb.LGBMRegressor(n_estimators=500, learning_rate=0.04, num_leaves=63,
                  min_child_samples=30, subsample=0.8, colsample_bytree=0.7,
                  random_state=42)
```

---

## 3. PASO 1 — `MOSClimateForecaster`

### 3.1 Ubicación propuesta

```
optimization/prediction/mos_forecaster.py     # clase nueva (aislada)
optimization/prediction/forecaster.py         # SOLO 2 líneas: import + registro en _PROVIDERS
optimization/prediction/mos/models/*.txt      # 10 modelos
optimization/prediction/mos/itransformer/     # checkpoint + config
```

Registro (cambio mínimo, no invasivo):

```python
from optimization.prediction.mos_forecaster import MOSClimateForecaster
_PROVIDERS = {..., "mos": MOSClimateForecaster}   # añadir "mos"
```

Uso: `FORECASTER=mos` (env) o `?provider=mos` (query). El fallback y la validación de nombre ya existen.

### 3.2 Datos de entrada en runtime (3 fuentes)

| Fuente | Para qué | Cómo obtenerla |
|---|---|---|
| **ECMWF en vivo** (`models=ecmwf_ifs025`) | feature `proxy_ecmwf` + contexto (`nubes/temp/viento`) | `https://api.open-meteo.com/v1/forecast` (gratis). **Reintentar ante HTTP 503 "overloaded"** con backoff (visto en producción) |
| **Contexto ERA5/observado reciente (~32 días)** | feature `v1` (contexto del iTransformer) + `pers_h24` | `archive-api.open-meteo.com/v1/archive` para las últimas ~32 jornadas |
| **iTransformer v1 (72 h)** | feature `v1` | Inferencia local con `modelo_b.pt` + `config_modelos.json` (mismo decode que `prediccion_en_vivo.py`) |

> **Restricción**: `wind_speed_100m` no existe en el archive de Open-Meteo para Pasto (100% NaN). Debe derivarse/rellenarse con la mediana del train, como ya hace el pipeline de referencia.

> **Autocontenido**: `config_modelos.json` incluye `stats` (33 features), `clim`
> (climatología horaria de las 6 variables `anomaly`), `FEATURES`, `tgt_idx`,
> `L/H/Q`. **No se requiere el fichero ERA5 de entrenamiento.**

> ⚠️ **No usar `TRANSFORMS` del config** (corrupto: dicts como listas de claves).
> El `TRANSFORMS` correcto está hardcodeado en `reference/prediccion_en_vivo.py`.

### 3.3 Receta de features (EXACTA — 8 features por variable)

Por **cada hora del horizonte** y **cada variable objetivo**, construir el vector:

```python
FEAT_NAMES = ["proxy_ecmwf", "v1", "pers_h24", "ghi_toa", "hora",
              "nubes_ecmwf", "temp_ecmwf", "viento_ecmwf"]
```

| Feature | Definición |
|---|---|
| `proxy_ecmwf` | variable homóloga del ECMWF en vivo, según §3.4 |
| `v1` | predicción del iTransformer v1 para esa hora (**solo 72 h**; más allá, media de las 72 h) |
| `pers_h24` | valor observado de esa variable a la **misma hora del día anterior** (último disponible del contexto) |
| `ghi_toa` | irradiancia extraterrestre (geometría solar determinista) |
| `hora` | 0–23 |
| `nubes_ecmwf` / `temp_ecmwf` / `viento_ecmwf` | contexto ECMWF en vivo |

### 3.4 Mapeo proxy por variable (EXACTO)

```python
PROXY = {
  "shortwave_radiation":      "ghi",
  "direct_normal_irradiance": "ghi",
  "diffuse_radiation":        "ghi",
  "temperature_2m":           "temp",
  "relative_humidity_2m":     "rh",
  "cloud_cover":              "nubes",
  "wind_speed_100m":          "viento",   # ¡escalado × 1.3!
  "wind_speed_10m":           "viento",
  "surface_pressure":         "pres",
  "precipitation":            "ghi",      # ¡escalado × 0.0!
}
PROXY_SCALE = {"wind_speed_100m": 1.3, "precipitation": 0.0}
```

### 3.5 🚨 Decisión de diseño obligatoria (honestidad de resultados)

El MOS **NO mejora** `cloud_cover` (+1.2%) ni `precipitation` (+11.5% peor). Además, para `precipitation` el proxy es constante 0.0, es decir **el modelo no tiene señal física** para esa variable.

**Implementación requerida**: para esas dos variables, el provider debe devolver **el valor del ECMWF en vivo tal cual (pass-through)**, NO la salida del LightGBM. Motivo: no introducir una regresión silenciosa. Documentar en el docstring.

### 3.6 Salida (contrato)

```python
def forecast(self, days: float = 1.0, anchor=None) -> ClimateForecast:
    horizon = max(1, int(days * 24))
    if horizon > self.MAX_HORIZON_H:           # 72
        raise RuntimeError("MOS: horizonte máx 72h (se pidió %d)" % horizon)
    # ... construir features (3.3) -> predecir 10 LightGBM -> armar DataFrame
    out = pd.DataFrame(central, index=fc_times)[WEATHER_VARIABLES].iloc[:horizon]
    return ClimateForecast(data=out, horizon_h=len(out), provider="mos")
```

Requisitos de `out`:
- índice `DatetimeIndex` **tz-aware** `America/Bogota`, frecuencia horaria, **arrancando en `now`** (o en `anchor`),
- columnas = las 10 de `WEATHER_VARIABLES`, en ese orden,
- sin NaN, sin valores negativos en radiación/viento/precipitación,
- `float64`.

### 3.7 Fallback y robustez

| Situación | Comportamiento requerido |
|---|---|
| Faltan los modelos `.txt` | `raise RuntimeError("MOS: modelos no encontrados en <ruta>")` |
| ECMWF en vivo 503/timeout | reintentos con backoff (≥5); si falla → `RuntimeError` (el caller ya maneja el error) |
| sin contexto suficiente (<512 h) | `RuntimeError` con el conteo (mismo estilo que PatchTST) |
| `days*24 > 72` | `RuntimeError` (igual que PatchTST) |

**No** implementar fallback silencioso a otro provider dentro de la clase: el `main.py` decide.

### 3.8 Criterios de aceptación (PASO 1)

1. `FORECASTER=mos python3 -c "...provider.forecast(3)"` devuelve `ClimateForecast` con 72 filas, 10 columnas exactas, índice tz-aware.
2. `GET /predict/weather?provider=mos&hours=72` responde 200 con 10 variables.
3. `GET /predict/weather?provider=mos&hours=168` responde `{"status":"error"}` (horizonte > 72) sin excepción no capturada.
4. Los 3 providers existentes siguen funcionando idéntico (no regresión).
5. La primera llamada carga lazy (no bloquea el import del módulo).

---

## 4. PASO 2 — Comparativa con el protocolo del repo

### 4.1 Protocolo (usar el MISMO del repo)

El repo ya tiene el evaluador: `optimization/prediction/evaluate.py` (`walk_forward_mae`) y los baselines en `optimization/prediction/baselines.py`.

```bash
python3 -m optimization.prediction.evaluate --months 8 --horizons 1,6,12,24
```

**Parámetros de comparación justa (obligatorio)**:
- Mismo **periodo** y misma **ventana de entrenamiento** para todos los providers.
- Mismos **horizontes**: 1, 6, 12, 24, 48, 72 h.
- Misma **referencia de verdad**: ERA5/Open-Meteo archive de Pasto.
- `daytime_only=True` para las variables de radiación (es el default y evita inflar el MAE con ceros nocturnos).
- **No mezclar fuentes como verdad** (regla del autor): cada comparación contra una única referencia.

### 4.2 Contendientes

| Contendiente | Cómo se invoca |
|---|---|
| `mos` | `get_climate_provider(..., name="mos")` |
| `patchtst` | `get_climate_provider(..., name="patchtst")` |
| `openmeteo` (NWP crudo) | `get_climate_provider(..., name="openmeteo")` |
| Baselines clásicos | `persistence`, `climatology`, `arima` (ya en `baselines.py`) |

### 4.3 Métricas a reportar (por variable y por horizonte)

- **MAE** (principal)
- **nRMSE** (relativo)
- **Bias / MBE** (detectar sesgo)
- **Skill Score vs persistencia** = `1 − MAE_modelo/MAE_persistencia`
- IC del MAE por bootstrap (opcional, recomendado para la tesis)

### 4.4 Salidas

```
results/pasto_narino/forecast/         # ya es la ruta del repo
  compare_providers_mae.csv            # tabla variable × horizonte × provider
  compare_providers_summary.json       # + metadatos (fecha, hardware, commit)
  fig_compare_ghi.png                  # figuras para la tesis
```

> **Formato heredado**: nombres/estructura según lo que ya produce `evaluate.py`; no inventar un esquema nuevo.

### 4.5 Criterio de éxito (para justificar el cambio en producción)

- MOS mejora MAE de GHI a 24 h ≥ 20 % frente al provider operativo actual.
- MOS **no empeora** temperatura, presión, RH ni viento (tolerancia ±5 %).
- `cloud_cover` y `precipitation` se reportan como **paridad** (pass-through), no como mejora.
- Sin degradación de latencia superior a ~2 s por predicción en CPU (comparar con PatchTST).

---

## 5. Verificación (la hace el asistente, NO programa)

Checklist que se ejecutará sobre la implementación entregada:

1. **Contrato**: 10 columnas exactas, orden correcto, índice tz-aware, 72 filas, sin NaN.
2. **No regresión**: `openmeteo`, `timesfm`, `patchtst` responden igual que antes.
3. **Límites**: `hours=168` → error controlado; `hours=72` → OK.
4. **Reproducibilidad**: dos corridas con la misma entrada → misma salida (LightGBM determinista con `random_state`).
5. **Comparativa**: tabla MAE por variable/horizonte y figuras; verificación de que la comparación usa el mismo periodo/verdad.
6. **Auditoría de fuga de datos**: las features del MOS en tiempo real **no** deben usar la verdad del horizonte (solo el ECMWF previo + contexto pasado). Revisar `pers_h24` y `v1` para confirmar que son causalmente válidas.

---

## 6. Riesgos y advertencias (leer antes de implementar)

1. **Optimismo same-family**: ERA5 (verdad) y ECMWF (entrada) son parientes → el MAE del MOS es optimista. Reportar como NWP-corregido.
2. **Horizonte 72 h**: es el del iTransformer y el límite operativo validado. Más allá, el error de GHI se multiplica ×4 (hindcast 18–25 ago 2026). **No extender.**
3. **Datos sintéticos**: parte de la validación del MOS usó datos `SINTETICO_FASE1` declarados en la Fase 2. **No citar MAE sintéticos como resultado científico.**
4. **`wind_speed_100m`**: nulo en el archive de Pasto; el proxy `viento × 1.3` es una aproximación (documentarla).
5. **503 de Open-Meteo**: documentado en producción; los reintentos son obligatorios.
6. **No tocar** la lógica de calibración, solver, MPC ni el resto de providers.

---

## 7. Archivos de referencia (solo lectura)

| Ruta | Para qué |
|---|---|
| `optimization/prediction/forecaster.py` | contrato + factory + patrón PatchTST |
| `optimization/weather/openmeteo.py` | `WEATHER_VARIABLES`, cliente de descarga |
| `optimization/prediction/main.py` | endpoints `/predict/weather` |
| `optimization/prediction/evaluate.py` | protocolo walk-forward (PASO 2) |
| `optimization/prediction/baselines.py` | persistencia/climatología/ARIMA |
| `optimization/config/sites/pasto_narino.yaml` | sitio + 10 variables contratadas |
| `optimization/prediction/patchtst/` | ejemplo de paquete de modelo ML ya integrado |
| `tesis-microrred/docs/HANDOFF_TECNICO.md §19` | evidencia y validación del MOS |
| `tesis-microrred/scripts/prediccion_en_vivo.py` | receta runtime completa |
| `tesis-microrred/scripts/mos_multivariable.py` | features y entrenamiento del MOS |

---

## 8. Entregables del PASO 1 + 2

- [ ] `optimization/prediction/mos_forecaster.py` (clase `MOSClimateForecaster`)
- [ ] `_PROVIDERS["mos"]` registrado (2 líneas en `forecaster.py`)
- [ ] `optimization/prediction/mos/models/*.txt` (10 LightGBM)
- [ ] `optimization/prediction/mos/itransformer/` (checkpoint + config)
- [ ] Script de comparación + `results/pasto_narino/forecast/compare_providers_*`
- [ ] Figuras para la tesis (GHI y temperaturas clave)
- [ ] Nota metodológica con la advertencia same-family y el límite de 72 h
