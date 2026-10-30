# SPRINT 1 — NWP andino + `cape`/`tcwv` sobre el MOS existente

> Spec corregida **contra el repo** (verificada leyendo `optimization/`, no contra el Dossier).
> Sustituye a la *Tarea 1–3* de `sprint_1_especificacion_agente_prediccion.md` **en lo que respecta a
> crear módulos nuevos**: casi todo lo que esa spec propone construir ya existe y funciona.
> Autor de la spec: el de la tesis (rol que especifica). Implementa y mide: el agente de la VM Linux.
> **Este documento no se ha pusheado**: está en la carpeta de la tesis para revisión del autor.

---

## 0. Correcciones a la spec original (antes de tocar nada)

| La spec dice | En el repo (verificado) |
|---|---|
| `modelos_itransformer/modelo_b.pt` | **Existe**, pero en `optimization/prediction/mos/itransformer/modelo_b.pt` (+ `config_modelos.json`) |
| `results/pasto_narino/patchtst_best.pt` | No existe ahí: el PatchTST vive en `optimization/prediction/patchtst/` |
| `results/pasto_narino/lstm_seed0_best.pt` | **No existe** en el repo. No hay LSTM versionado (sí `prediction/tft_predictor.py`) |
| `optimization/forecasting/` (8 módulos nuevos) | **No existe** y no hace falta: es `optimization/prediction/` |
| `optimization/mpc/stochastic_dispatch.py` | **No existe**: el MILP está en `optimization/solver/model_builder.py` |
| `openmeteo_client.py` nuevo | Ya hay cliente: `optimization/weather/openmeteo.py` (`WEATHER_VARIABLES`, `FORECAST_URL`) |
| Endpoint `api.open-meteo.com/v1/ecmwf` | El cliente usa `api.open-meteo.com/v1/forecast` con el campo `models` (`openmeteo.py:42,58`) |
| `MOSHybridPredictor` nuevo | Ya existe `prediction/mos_forecaster.py` → `MOSClimateForecaster`, registrado como `FORECASTER=mos` |
| `lgbm_mos_{var}_q{q}.txt` (3 por variable) | Hoy hay **1 por variable**: `prediction/mos/models/lgbm_mos_{var}.txt` (10 boosters) |
| Vector de 16 features | El MOS usa **8** (`_FEAT_NAMES`, `mos_forecaster.py:62`); el iTransformer usa **33** (`config_modelos.json:66`) |
| `tilt = 10°` | `pasto_narino.yaml:45` → **`tilt_deg: 2.0`** ("casi plano, latitud tropical"), `inverter_eta: 0.96` |
| Criterio "resuelve en < 0,7 s con HiGHS" | El proyecto mide **52–110 s/solve** (`validacion/fase_1/sonda_threads.json`, Fase 0). Inalcanzable |

**Conclusión**: el motor de la spec (iTransformer + LightGBM MOS + climatología + RevIN + kt/ghi_toa) **ya
está construido y registrado**. Lo que falta es mucho más pequeño — y hay **un bloqueo real** que la spec
no menciona (§3).

---

## 1. Estado real del motor (leído del código)

| Pieza | Dónde | Estado |
|---|---|---|
| Contrato de proveedor | `prediction/forecaster.py:37` `ClimateForecast(data, horizon_h, provider)` + `:48` `ClimateForecaster(ABC)` | ✅ |
| Factory | `prediction/forecaster.py:324` `get_climate_provider(site_cfg, name)` → `openmeteo\|patchtst\|mos` | ✅ |
| MOS LightGBM | `prediction/mos_forecaster.py:103` `MOSClimateForecaster` (8 features, 10 boosters) | ✅ |
| iTransformer v1 | `prediction/mos/itransformer/modelo_b.pt` + `config_modelos.json` (33 features, `tgt_idx [23..32]`, `L=512`, `H=72`, `Q=[0.1,0.5,0.9]`, `stats` RevIN, `clim` horaria) | ✅ |
| Boosters | `prediction/mos/models/lgbm_mos_*.txt` (10) | ✅ |
| Cliente NWP | `optimization/weather/openmeteo.py` (`WEATHER_VARIABLES`: 10 vars, sin `cape`/`tcwv`) | ✅ (a ampliar) |
| Conformal | `calibration/conformal.py` (`conformal_radius`, `split_conformal_residual`, `conformal_quantiles`) — **cambio 06** | ✅ |
| Greybox PV | `calibration/calibrated_plant.py` + `residual.py` — **cambio 09** | ✅ |
| Protocolo de medición | `prediction/evaluate.py:32` `walk_forward_mae` + `:122` `summarize`; `prediction/compare_providers.py` (`--providers mos,patchtst`, `ecmwf_crudo` siempre) | ✅ |

---

## 2. Lo que falta de verdad (y es poco)

1. **`cape` y `tcwv` en el cliente NWP** + leer el campo raíz `elevation` de la respuesta →
   `delta_h_topo = 2600.0 − elevation`.
2. **Features nuevas en el MOS**: `cape`, `tcwv`, `delta_h_topo`, `dct_high_freq_energy` → de **8 a 12**.
3. **Reentrenar los 10 boosters** con esas features (§3: aquí está el bloqueo).
4. **Ancho de banda por cuantil**: hoy el MOS emite P50 y la banda la pone el conformal; los boosters por
   cuantil son un cambio de diseño, **no un rename** (30 boosters, no 10).
5. Nada más. **No se crea ninguna carpeta nueva.**

---

## 3. 🔴 El bloqueo que la spec no menciona: **no hay pipeline de entrenamiento**

`prediction/mos/` contiene **solo** `itransformer/` y `models/`. **No hay script que entrene** los
boosters ni el iTransformer, ni **dataset de entrenamiento versionado**. Los artefactos están congelados
(lo cual está bien: son la línea base), pero significa que:

- **Añadir features exige reconstruir el pipeline** (features → dataset → `lgb.train` por variable →
  booster) o **recuperar el que los generó**, si existe fuera del repo.
- **Sin ese paso, el Sprint 1 no es implementable**, y cualquier "mejora del MOS" sería un booster
  entrenado con otro pipeline → **no comparable con el publicado**.

**Paso 0 del sprint, por tanto**: localizar (en la VM o en el autor) el script de entrenamiento y el
dataset, o reconstruirlo replicando exactamente `FEATURES`/`TRANSFORMS`/`stats` de
`config_modelos.json` y comprobar que **reproduce los 10 boosters actuales** (MAE igual con las mismas 8
features). Sin esa comprobación, no se sigue.

---

## 4. Tarea 0 — el dashboard pasa a `mos` (el iTransformer ya va dentro)

**Decisión**: el proveedor operativo pasa a **`FORECASTER=mos`**. No existe `FORECASTER=itransformer`
y no hace falta: el iTransformer v1 **es una feature del MOS** (`_FEAT_NAMES` incluye `v1`,
`mos_forecaster.py:62`). Pedir "el transformer en el dashboard" es pedir `mos`, que es **el transformer
mas** el corrector LightGBM.

**Evidencia** (`results/pasto_narino/forecast/comparativa_resumen.csv`, mismo `walk_forward_mae`,
**mismo horizonte** — comparar MOS h24 contra PatchTST h1 sería el error de siempre):

| variable | MOS h24 | PatchTST h24 | Δ |
|---|---|---|---|
| shortwave_radiation (GHI) | **48,67** | 93,11 | **−47,7 %** |
| temperature_2m | **0,811** | 1,013 | **−19,9 %** |
| cloud_cover | **13,61** | 21,36 | **−36,3 %** |
| relative_humidity_2m | **6,99** | 9,30 | **−24,9 %** |
| direct_normal_irradiance | **162,5** | 195,4 | **−16,8 %** |
| surface_pressure | **0,433** | 0,638 | **−32,1 %** |
| precipitation | **0,113** | 0,127 | **−11,0 %** |
| diffuse_radiation | 45,56 | **41,78** | +9,1 % |
| wind_speed_10m | 2,62 | **1,75** | +50,1 % |
| wind_speed_100m | 4,83 | **2,91** | +65,8 % |

**MOS gana 7/10 a 24 h y 8/10 a 72 h**, y gana justo en lo que el MPC usa: **GHI, temperatura y nubes**.
Pierde en **viento** (las dos) y en `diffuse`.

- **Viento**: no entra al despacho (se descartó), pero **si lo usa `pvlib`** para el enfriamiento del
  módulo. Se declara como limitación: la temperatura de celda se estimará con un viento peor. No se tapa.
- **`diffuse`**: +9,1 % de MAE y participa en el cierre `GHI ≈ DNI*cos θ + DHI`. Se mide el efecto
  sobre el POA en la verificación, no se asume.

**Donde se cambia de verdad** (hoy hay **tres** sitios incoherentes):

| Sitio | Hoy | Debe quedar |
|---|---|---|
| `optimization/experiments/data_loader.py:154` | `name="patchtst"` **hardcodeado** | `FORECASTER` (default `mos`) |
| `deploy_pi.sh:52` | `FORECASTER=patchtst` | `FORECASTER=mos` |
| default en `forecaster.py` | `openmeteo` (local) | `mos` + `.env.example` versionado |

**Lo que este cambio mueve, y hay que decirlo**: los experimentos (ExpA/ExpA2) son la fuente de la
**Fase 1** (ENS -26 %, V2, V7). Si el proveedor cambia, **esas cifras cambian**: el pronostico entra al
MPC. No es cosmético.

- **Criterio de cierre**: **re-correr la Fase 1 con `mos`** y publicar la tabla **nueva junto a la
  anterior** (append-only, sin borrar). El cuello de botella es el solver, no el forecast, así que el
  costo en horas es el mismo.
- **Hasta que exista esa tabla, las cifras del capítulo son las de `patchtst`** y se citan como tales.

**Dos huecos del artefacto, declarados**: (1) `comparativa_resumen.csv` **no declara su periodo** ni el
`step_h`; hay que anotarlos antes de citar la tabla (el cambio 01 reporto GHI 29,26 vs 51,17 para
jul-dic 2025, que **no** es este CSV: no mezclar periodos). (2) `n = 320` muestras por celda.

**Riesgo de hardware**: `mos` carga torch (iTransformer) **y** lightgbm. `DESPLIEGUE_RASPBERRY.md:376`
ya advierte que PatchTST+torch son ~500 MB en una Pi de 2 GB. Con `mos` es más. **Si no cabe en la Pi,
la Pi usa `openmeteo` y se declara** — no se finge que corre el MOS.

**Advertencia que viaja con estas cifras**: el MOS se calibró con ECMWF *archive*, de la misma familia
que ERA5 (la verdad) → su MAE es **optimista**. Se reporta como *"NWP corregido con ML"*, **nunca** como
*"ML puro"*.

## 4.1 Lo que produce el iTransformer **solo** (medido, no supuesto)

Medido en el clon de revisión (2026-10-28) cargando `mos/itransformer/modelo_b.pt` y haciendo el pase
**sin** los boosters LightGBM. Figura: `docs/fig_ghi_itransformer_vs_mos.png`.

### Integridad del checkpoint

| Comprobación | Resultado |
|---|---|
| Claves del checkpoint vs arquitectura del código | **42 / 42**, 0 faltantes, 0 sobrantes, 0 formas distintas |
| Parámetros | **495.192** → **coincide con el Dossier** |
| Latencia del pase (mediana de 20, CPU) | **4,8 ms** (min 4,4 / max 5,7) → cumple `< 50 ms` |
| Primer pase (arranque en frío) | **130 ms** — es *warm-up*, no régimen |
| Forma de salida | `(72, 10, 3)`, **0 NaN / 0 Inf** |

> Nota de conteo: `495.202` incluye el buffer `tgt_idx` (10 índices). Los **parámetros entrenables** son
> **495.192**, que es la cifra del Dossier. El `load_state_dict(strict=False)` del código **no hace
> falta** (encaja perfecto), pero tampoco hace daño.

### GHI hora a hora — los tres, lado a lado (10-28, hora local)

| hora | iT P10 | iT P50 | iT P90 | MOS | PatchTST |
|---|---|---|---|---|---|
| 09:00 | 363,1 | 575,4 | 768,1 | **644,8** | 508,4 |
| 10:00 | 417,0 | 726,1 | 1006,0 | **802,5** | 665,6 |
| 11:00 | 435,7 | 776,3 | 1029,8 | **822,9** | 722,2 |
| 12:00 | 466,3 | 772,4 | 1023,6 | **808,0** | 731,4 |
| 13:00 | 429,8 | 735,7 | 968,7 | **768,6** | 703,6 |
| 14:00 | 354,9 | 619,2 | 863,9 | 469,2 | **618,8** |
| 15:00 | 226,1 | 476,4 | 682,9 | 458,5 | **485,0** |
| 16:00 | 107,9 | 285,7 | 429,1 | 254,3 | **294,9** |

### Media 72 h (unidades físicas)

| variable | iTransformer | MOS | PatchTST |
|---|---|---|---|
| GHI (W/m²) | 219,20 | 199,14 | 208,61 |
| DNI (W/m²) | 195,81 | **111,83** | 154,50 |
| DHI (W/m²) | 85,12 | **110,15** | 80,89 |
| temperatura (°C) | 14,40 | 14,35 | 14,49 |
| humedad (%) | 93,31 | 91,61 | 91,69 |
| nubes (%) | 97,01 | 93,76 | 96,34 |
| viento 100 m (m/s) | 3,99 | **1,56** | 4,10 |
| viento 10 m (m/s) | 3,02 | **1,11** | 3,01 |
| presión (hPa) | 758,54 | 757,70 | 758,17 |
| precipitación (mm) | 0,40 | 0,64 | 0,44 |

### Tres defectos medidos en la salida cruda del iTransformer

1. **Cruces de cuantiles**: **5 en 2160** comparaciones (GHI 3, difusa 2). Poco, pero **viola la
   monotonía en la variable que importa**. Es exactamente lo que la spec original pedía arreglar con
   `torch.sort(out, dim=-1)`: **una línea**.
2. **Violaciones físicas**: humedad > 100 % en **55/72** horas, nubes > 100 % en **62/72**,
   precipitación < 0 en **43/72**, DNI < 0 en 1. El valor central de GHI sí es físicamente correcto
   (curva diurna, 0 de noche).
3. **Banda muy ancha**: GHI P10-P90 ≈ **200-300 W/m²** (±38 % del P50). El MOS no usa estos cuantiles:
   toma solo el P50 (`_v1_phys`, *"P50, cuantil 1"*) y aplica el radio conformal global del cambio 06.

### Qué aporta entonces el LightGBM del MOS

**No el valor central**: el P50 del iTransformer (219,20 W/m²) está **entre** el MOS (199,14) y el
PatchTST (208,61), todos dentro del ±10 %. Lo que aporta es:

- **corrección física**: los boosters llevan humedad y nubes a rango válido y la precipitación a ≥ 0;
- **una banda calibrada**: el conformal global en vez de la banda ancha y a veces cruzada del iTransformer.

Y ojo con el viento: el MOS llega a **1,56 m/s** frente a 3,99 del iTransformer (−61 %). Es la variable
donde el MOS pierde en MAE (+65,8 % a 24 h), y este dato sugiere que el LightGBM **está corrigiendo a la
baja** un NWP que sobreestima. Que no importe para el despacho (viento descartado) **no lo hace
irrelevante** para `pvlib`, que lo usa en el enfriamiento del módulo.

### Consecuencia para este sprint

- **Nueva tarea 5.4**: `torch.sort` en el `forward` del iTransformer (`mos_forecaster.py:191-200`) +
  test de monotonía. Efecto medible, arreglo de una línea.
- **Nueva tarea 5.3**: registrar `FORECASTER=itransformer` como provider **solo-iTransformer**, para
  poder medir su MAE con `compare_providers.py`. Hoy **no existe**: el iTransformer vive dentro del MOS y
  esta medición hubo que hacerla a mano. Sin ese provider, "cuánto aporta el MOS" no se puede tabular.
- **Nueva tarea 5.5**: recortar la salida a rango físico (humedad y nubes a [0,100], precipitación ≥ 0)
  **antes** de devolverla, con conteo de cuántas veces se recorta (declarado, no silencioso).

---

## 4.2 Sprint 1a — estado tras el pull (2026-10-28)

Llegó el **paquete A completo** (`a5a29ab` tests+sort+recorte+strict, `f7e5fc1` provider, `f60b849`
`--providers`, `79e469d` VERIFICACION + tabla).

**Verificado por mí, ejecutando:**

- **9/9 tests del MOS PASS** (tuve que instalar `pytest`: no estaba en el venv).
- **Tabla de MAE recalculada** desde su CSV: **coincide exacto** (GHI −43,7 %, nubes +70,3 %, viento +128 %).
- **5 sha256** de `reference/resultados/`: los **5 coinciden** con el blob.
- **La captura**: 6 series — real(ERA5), real, mos, patchtst, **itransformer**, ecmwf_crudo.
- **El código**: `torch.sort`, `clip_itransformer_phys` (función **pura**, sin E/S, con conteo),
  `strict=True`, y un provider que **compone** el MOS sin duplicar el checkpoint.

### Los 5 hallazgos, con veredicto

| # | Hallazgo | Estado |
|---|---|---|
| **H1** | La captura muestra `itransformer` en gris, pero el código ya le puso `#0ea5e9` | 🔵 **anotado**: la captura es anterior al color → **re-capturar**. No puedo hacerlo aquí (sin navegador ni `node_modules`) |
| **H2** | **Dos series "real"** en la leyenda | 🔴 **es un bug, no cosmético**: `comparativa_series.json` trae `real` **en la raíz Y dentro de `contendientes`**, así que el overlay pinta la misma serie dos veces. **Fix de 1 línea** → tarea 1a.5 |
| **H3** | `")` al final del `VERIFICACION.md` | ✅ **arreglado** (línea 125 eliminada) |
| **H4** | En la ventana reciente (2 meses, h=24) el **NWP crudo (47,30) gana al MOS (56,82)** en GHI | 🟠 **al final, con el MOS**: es la misma familia que el **−2,6 % vs crudo** de los 20 meses. No se tapa ni se ajusta |
| **H5** | Paquete B bloqueado: sin parquet de entrenamiento en repo ni VM, e **ingesta parada desde el 13-oct** | ✅ **responde mis dos preguntas** — y **bloquea el paquete B** hasta que haya datos |

### Los números cambiaron, y hay que saber por qué

Los CSV canónicos pasaron de **4 meses** (jun–sep 2026) a **20 meses** (feb 2025 – oct 2026) con
**step 24 h** → solo quedan filas diurnas en **h=12**, n=518 por celda. Los defaults de
`compare_providers.py` son `--months 20 --step-h 24`: **los anteriores eran la anomalía**.

**No son intercambiables**: la tabla de §4.1 (h=24, 4 meses) y la del VERIFICACION (h=12, 20 meses) no se
pueden citar juntas sin declarar el cambio de método.

### Nueva tarea 1a.5 — la leyenda duplicada

`Frontend/GestionFront/src/Dashboard/components/prediction/ForecastOverlayChart.jsx:19`:
al iterar `Object.entries(series.contendientes)` hay que **saltar la clave `real`**, porque la verdad ya
se pinta aparte como `real (ERA5)`. Criterio de cierre: la leyenda muestra **5** entradas y ninguna
repetida. Es UI, así que la ejecuta el agente; no la toco yo.

---



## 5. Plan del Sprint 1 (6 pasos, cada uno con criterio de cierre)

### 5.0 — Reconstruir el pipeline de entrenamiento y **reproducir** los boosters actuales

**Estado: [EJECUTABLE] — NO esta bloqueado.** Correccion del 2026-10-28: el pipeline existe y los datos
tambien, en la maquina del autor (el implementador solo miro dentro del repo):

| Pieza | Donde | Estado |
|---|---|---|
| Script de entrenamiento | `scripts/mos_multivariable.py` (250 l., tambien versionado en `cambio_01/reference/`) | OK |
| Variante | `scripts/mos_multivariable_v2.py`, `mos_stacking_ghi.py`, `stacking_ghi.py` | OK |
| NWP de entrada | `data/ecmwf/ecmwf_AAAA_MM.parquet` — **24 meses** (2024-01 .. 2025-12) | OK |
| Verdad (ERA5) | `experimentos_kaggle/04_itransformer/resultados_v3/era5_v3.parquet` (2,3 MB) | OK |
| Checkpoint iTransformer | `modelos_itransformer/modelo_b.pt` | OK |
| Descargadores | `scripts/descargar_ecmwf*.py` (si hiciera falta ampliar el periodo) | OK |

El script **no entrena el iTransformer**: lo carga con `torch.load` y entrena **10 boosters**
`LGBMRegressor(n_estimators=500, lr=0.04, num_leaves=63)` sobre 2.500 muestras (test: jul-dic 2025,
400). Escribe en `reports/stacking/`, **no** en los checkpoints publicados.

### 5.0 EJECUTADO Y VERIFICADO (2026-10-28, en la maquina del autor)

Se corrio `python scripts/mos_multivariable.py` (termino en ~9 min). **Reproduce la linea base**:

| variable | v1 MAE | MOS MAE | d % | dossier |
|---|---|---|---|---|
| shortwave_radiation | 51.17 | **29.26** | **-42.8** | **-42.8** OK |
| direct_normal_irradiance | 95.09 | 62.05 | -34.7 | -34.7 OK |
| diffuse_radiation | 22.04 | 17.95 | -18.5 | -18.5 OK |
| temperature_2m | 0.89 | 0.59 | -33.9 | -33.9 OK |
| relative_humidity_2m | 6.55 | 4.42 | -32.4 | -32.4 OK |
| cloud_cover | 14.95 | 15.14 | **+1.2** | +1.2 OK |
| wind_speed_100m | 0.58 | 0.53 | -9.4 | -9.4 OK |
| wind_speed_10m | 0.39 | 0.37 | -6.0 | -6.0 OK |
| surface_pressure | 0.78 | 0.40 | -49.1 | -49.1 OK |
| precipitation | 0.40 | 0.44 | **+11.5** | +11.5 OK |

**Los 10 MAE coinciden al centesimo con el dossier.** Y los boosters reentrenados son reproducibles:

- **9 de 10 byte-identicos** (sha256 igual tras normalizar CRLF; el script escribe `

` en Windows).
- **1 de 10** (`surface_pressure`) mismo tamano y **876 bytes distintos en el 17o digito**
  (`-0.022753139110026539` vs `...566`): ruido de coma flotante por hilos, no otro modelo.

**Pitfall para el 5.1/5.2**: `booster_.save_model()` escribe con `

` en Windows, y eso rompe el
sha256 respecto al blob de git (LF). Al versionar boosters nuevos, normalizar a LF o comparar siempre
en LF.

Las variables climaticas **si** se pueden reentrenar y verificar, y la linea base es reproducible. Lo que no tiene el repo es el
*parquet*, no el pipeline; y el parquet se regenera con `descargar_ecmwf.py` o se copia desde la
maquina del autor. Esto convierte 5.1 y 5.2 en ejecutables, no en bloqueados.  

- Script `prediction/mos/train_mos.py` (nuevo) que reproduzca `FEATURES` (las 8 de `_FEAT_NAMES`),
  `TRANSFORMS` y `stats` del `config_modelos.json`.
- **Criterio de cierre**: los 10 boosters reentrenados deben dar **el mismo MAE** que los actuales
  (tolerancia a declarar; p. ej. ±2 %) medido con `compare_providers.py` sobre el mismo holdout.
  Si no reproduce, **parar**: el pipeline no es el que generó la línea base.

### 5.1 — `cape`, `tcwv`, `delta_h_topo`: **EJECUTADO, NO SE ADOPTA**

**Estado: [CERRADO - NO ADOPTADO]** (2026-10-30). Tres premisas de la spec cayeron al medirlas:

| pieza | lo que decía la spec | lo medido |
|---|---|---|
| `cape` | feature clave para nubes | **no existe en el archive sin `models`** (0 de 17.544). Con `models=ecmwf_ifs025`: **91 % válido** |
| `tcwv` | `total_column_integrated_water_vapor` | **la API lo rechaza**: el nombre correcto es `..._vapour` (británico) |
| `delta_h_topo` | "500–1.200 m de diferencia" | **54 m** (`elevation` de la celda = 2.546 m, sitio 2.600 m) → constante, no aporta |

**Experimento (fuente correcta `ecmwf_ifs025`, mismo idx y semilla, jul-dic 2025, 10 boosters):**

| variable | BASE (8 feat) | EXTRA (+cape +tcwv) | Δ |
|---|---|---|---|
| shortwave_radiation | 29,26 | 29,58 | **+1,1 % (peor)** |
| direct_normal_irradiance | 62,05 | 63,71 | **+2,7 % (peor)** |
| diffuse_radiation | 17,95 | 18,30 | **+1,9 % (peor)** |
| cloud_cover | 15,14 | 15,40 | **+1,8 % (peor)** |
| temperature_2m | 0,59 | 0,58 | −1,3 % |
| relative_humidity_2m | 4,42 | 4,40 | −0,6 % |
| wind_speed_100m | 0,53 | 0,51 | −3,0 % |
| wind_speed_10m | 0,37 | 0,35 | −4,4 % |
| surface_pressure | 0,40 | 0,39 | −0,6 % |
| precipitation | 0,44 | **0,40** | **−9,6 %** |

**Criterio de cierre, fijado de antemano**: mejorar nubes y precipitación SIN empeorar GHI/temp.
**Resultado: FALLA.** Nubes empeora +1,8 % y GHI +1,1 %; solo precipitación mejora de forma clara.

**El hallazgo que sí vale para la tesis.** El primer intento usó `archive` **sin** `models` (= ERA5 = la
verdad) más `dew_point_2m`, y dio GHI **−13,5 %** y temperatura **−78,7 %**. Con la fuente correcta
(`ecmwf_ifs025`, la misma del MOS) y sin `dew_point_2m` —que es la temperatura disfrazada— **la mejora
desaparece**. Lo que parecía una mejora era el sesgo de la fuente, y ahora está cuantificado.

**Descartado también**: `dew_point_2m` y `vpd` como features (transformación directa de `temperature_2m`).

### 5.2 — `dct_high_freq_energy` (intermitencia de nubes)
  
**Estado: [PENDIENTE]** — la etiqueta anterior ("bloqueado por 5.0") quedo obsoleta el 2026-10-28, cuando 5.0 se ejecuto y reprodujo la linea base. Ya se puede hacer.

- Feature: energía de los coeficientes de alta frecuencia de la DCT de las últimas 6 h de `kt`.
- **Criterio de cierre**: mismo protocolo; se adopta **solo** si mejora nubes o precipitación respecto a
  A.1 (con A.1 ya dentro, para aislar el efecto).

**Todo el incremento se mide con `walk_forward_mae` y `compare_providers.py`**, el protocolo que ya usa
la tesis. No se inventa una métrica nueva.

### 5.3 — `FORECASTER=itransformer`: que la página pueda mostrar el iTransformer solo
  
**Estado: [HECHO]** (`f7e5fc1` + `f60b849`) — el panel muestra itransformer + mos + patchtst + crudo.

**El problema real, localizado.** La página **ya** tiene el panel que pinta las predicciones
(`Dashboard/components/prediction/`: `ForecastOverlayChart`, `ForecastMaeChart`, `ForecastMetricsTable`,
`ForecastSkillChart`), y el overlay es **genérico**: itera `Object.entries(series.contendientes)`
(`ForecastOverlayChart.jsx:19`). Lo que hace que solo se vean MOS y PatchTST es que **no existe el
provider** y el comando corre con el default:

- `optimization/prediction/compare_providers.py:90` → `--providers` default **`mos,patchtst`**
- `Backend/services/forecastComparisonService.js:108` → no pasa `--providers`, hereda ese default

**Por tanto este cambio es: un módulo nuevo corto + una línea.** Nada de reescribir la UI.

**Paso 1 — provider nuevo** `optimization/prediction/itransformer_forecaster.py`:

```python
class ITransformerClimateForecaster(ClimateForecaster):
    """iTransformer v1 SOLO (sin el corrector LightGBM del MOS)."""
    provider_name = "itransformer"

    def __init__(self, site_cfg=None):
        from optimization.prediction.mos_forecaster import MOSClimateForecaster
        self._mos = MOSClimateForecaster(site_cfg)

    def variables(self):
        return self._mos.variables()

    def forecast(self, days=1.0, anchor=None):
        self._mos._load_lazy()                      # reutiliza la carga del checkpoint
        ctx = self._mos._context_df(anchor)
        fut_idx = pd.date_range(ctx.index[-1] + pd.Timedelta(hours=1),
                                periods=min(int(days * 24), 72), freq="h",
                                tz=ctx.index.tz)
        out = self._mos._v1_phys(ctx, fut_idx)      # P50 del iTransformer
        return ClimateForecast(data=pd.DataFrame(out, index=fut_idx),
                               horizon_h=len(fut_idx), provider=self.provider_name)
```

**No duplica el modelo**: compone el `MOSClimateForecaster` y usa sus métodos. Si mañana se cambia el
checkpoint, los dos providers lo ven.

**Paso 2 — registrarlo** en `prediction/forecaster.py`, junto al caso `mos` (`:324-338`): un `if name ==
"itransformer"` con import perezoso, igual que el del MOS.

**Paso 3 — que la página lo pida**: `Backend/services/forecastComparisonService.js:108` →
`--providers mos,patchtst,itransformer`.

**Orden obligatorio**: hacer **5.4** (`torch.sort`) y **5.5** (recorte físico) **antes** de exponerlo, o
la página mostrará humedad > 100 % en 55 de 72 horas y cuantiles cruzados. Lo que se publica en la UI
tiene que ser sano primero.

**Criterio de cierre (verificable, no "debería")**:

1. `python -m optimization.prediction.compare_providers --providers itransformer` termina y escribe sus
   filas en `comparativa_resumen.csv` / `comparativa_series.json`.
2. El panel `/prediction/forecast/comparison` muestra **tres** contendientes en el overlay:
   `mos`, `patchtst`, `itransformer`. Se versiona **captura** con su sha256 (precedente del cambio 17).
3. La tabla de MAE incluye al iTransformer → **ese número es la respuesta a "¿cuánto aporta el
   LightGBM?"**, y es lo que hoy no se puede tabular.
4. El `provider` que devuelve el endpoint se declara en el estado del servicio (cambio 09.5) — la UI no
   debe adivinar qué cadena de pronóstico está viendo.

### 5.4 — `torch.sort` (monotonía de cuantiles)
  
**Estado: [HECHO]** (`a5a29ab`) — test sobre 11.520 tripletas; antes de A.1, ~27 cruces.

En `mos_forecaster.py:199-200`, antes de devolver:

```python
y = (out * std.unsqueeze(-1) + mean.unsqueeze(-1)).index_select(2, self.tgt_idx)
y, _ = torch.sort(y, dim=-1)      # P10 <= P50 <= P90
return y
```

Hoy se midieron **5 cruces en 2160** comparaciones (GHI 3, difusa 2). Poco, pero en la variable que
importa. Criterio: un test que recorra 72×10×3 y exija `P10 <= P50 <= P90` **sin excepciones**.

### 5.5 — Recorte a rango físico, con conteo

**Estado: [HECHO]** (`a5a29ab`) — `clip_itransformer_phys`, función pura con conteo; en vivo
{hr:1, nubes:11, precip:21}, en backtest {nubes:40-65, precip:4-48}.

Antes de devolver la salida del iTransformer: humedad y nubes a `[0, 100]`, precipitación y radiación a
`>= 0`. **Contar cuántas veces se recorta y reportarlo** (`recortes: {hr: 55, nubes: 62, prec: 43}`).

Regla del proyecto: nada de correcciones silenciosas. Si el modelo produce humedad de 105 %, se recorta
**y se declara**, no se esconde.

---

## 5.9 Estado del sprint a 2026-10-30 (lo que falta es el MOS)

| paso | estado |
|---|---|
| **5.0** pipeline y linea base | ✅ EJECUTADO y VERIFICADO (10 boosters reproducidos) |
| **5.1** cape/tcwv/delta_h_topo | ✅ CERRADO, NO ADOPTADO (medido, criterio falla) |
| **5.2** DCT | 🔵 PENDIENTE (ya desbloqueado) |
| **5.3** provider itransformer | ✅ HECHO |
| **5.4** torch.sort | ✅ HECHO |
| **5.5** recorte fisico | ✅ HECHO |
| **5.6** tests del MOS | ✅ HECHO (9/9) |
| **5.7** quitar pass-through de nubes + proxy x1.3 del viento | 🔴 **NO ESCRITO COMO PASO** — nace de la seccion 11, no estaba en el plan original |
| **Tarea 0** FORECASTER=mos global | 🔴 PENDIENTE (decision del autor; mueve la Fase 1) |
| **P1/P2/P3** pagina | ✅ HECHO |
| **P10** historico -10 h | ✅ CERRADO |

**Lo que queda abierto es, literalmente, el MOS**: 5.2, 5.7 y la Tarea 0. Y el **viento**, que hay que
someter al mismo test de sospecha que las nubes (seccion 11) antes de decidir nada.

Fuera del sprint: **P8** (deriva plan->realidad), que espera el lazo sobre un diagrama conectado.

## 6. Lo que NO se toca en el Sprint 1

- **El MILP** (`solver/model_builder.py`) — ni una línea.
- **El conformal** (`calibration/conformal.py`) — eso es el Sprint 2.
- **Las cifras del capítulo** (Fase 1: ENS −26 %, V2, V7): el sprint 1 **no cambia el solver**, así
  que no las toca. Si en algún momento las toca, se para y se avisa.
- **Los checkpoints congelados**: `mos/itransformer/modelo_b.pt`, `mos/models/lgbm_mos_*.txt`,
  `patchtst/`. Se entrenan **nuevos**, con nombre propio (precedente del proyecto: no sobrescribir).

---

## 7. Los otros sprints (para que el orden no se negocie)

| # | Qué | Por qué después |
|---|---|---|
| **B** | **ACI** sobre `calibration/conformal.py` (extender, no duplicar) | Criterio: **cobertura ≈ nominal AL MENOR ANCHO** vs el radio actual (87,5 % / 4,26 kW). La spec original pedía solo cobertura (77–83 %) y eso repite el error del cambio 06: sobrecobertura = más reserva = más diésel |
| **C** | **Blending MQTT 0–4 h** (τ = 1,5 h) | Requiere **historial real** de `pasto_solar_pv`. Hoy Mongo está vacío (`"PV Mongo vacio; usando planta calibrada ERA5"`): sin datos, no hay blending que medir. Se implementa **con** datos o no se implementa |
| **D** | **Reserva chance-constrained** en `solver/model_builder.py` | **Último**, porque toca el MILP. Obliga a **re-medir la Fase 1** y a demostrar **no-regresión por sha256** (el mismo criterio que se exigió al cambio 18). Además: el S-MPC y el D-MPC **ya se separan en ENS (−26 %)**; el criterio de esta reserva tiene que ser **ENS/diésel**, no costo (el costo está dentro del ruido de re-optimización ±5 %) |

---

## 8. Reglas que se mantienen

1. **Nada de cifras a mano**: toda cifra sale de un artefacto versionado; lo que no se mida se declara y
   no se tabula.
2. **Append-only**: checkpoints y resultados nuevos con nombre propio + manifiesto con sha256 completo.
3. **No mezclar ejes**: si se cambia la fuente NWP y las features a la vez, no se sabe qué mejoró.
4. **Comparaciones justas**: mismo holdout, mismo decode, mismos baselines.
5. **Si un criterio no se cumple, no se ajusta el criterio**: se reporta el resultado real.
6. `git add` solo de las carpetas propias; push solo con autorización del autor.

---

## 9. Lo que necesito del autor antes de arrancar

1. **¿Existe el script de entrenamiento** del MOS/iTransformer fuera del repo (VM, otro disco)? Si sí, se
   versiona y A.0 se salta.
2. **¿Hay historial real en `pasto_solar_pv`** o seguimos con la planta calibrada ERA5? (Decide si el
   Sprint 3 es posible o se declara imposible.)
3. **¿El `modelo_b.pt` es el de 495.192 parámetros** del Dossier? Se verifica al cargarlo (`sum(p.numel())`)
   y se deja la cifra en un artefacto, no en prosa.

## 10. Auditoría del MOS: ¿está bien implementado?

Revisado leyendo `prediction/mos_forecaster.py` (505 líneas) y **ejecutándolo** en este clon
(2026-10-28). No es una lectura de superficie: los números de abajo son de corridas reales.

### Veredicto

**Está mejor de lo que la spec original sugiere**: la corrección física funciona y el contrato se
respeta. Sus dos debilidades reales no son de física, son de **ingeniería de software**: **no tiene ni un
test** y **desperdicia la banda probabilística** del iTransformer.

### Lo que está bien (verificado)

| Comprobación | Resultado |
|---|---|
| Contrato `ClimateForecast` | 72 filas × **10 columnas exactas**, índice tz-aware ✓ |
| NaN en la salida | **0** (el código lanza `RuntimeError` si aparece, `:502`) |
| Coherencia de boosters | el código **compara** `b.num_feature()` contra `_FEAT_NAMES` y falla si no cuadra (`:164-167`) ✓ |
| **Rango físico de la salida** | **0 filas fuera de rango** en las 10 variables: humedad máx **99,91 %**, nubes máx **100,00 %**, radiación ≥ 0, precip ≥ 0 |
| Recorte inferior | `np.clip(..., 0, None)` en las 6 columnas no negativas (`:497-500`) ✓ |
| Pass-through declarado | `cloud_cover` y `precipitation` **no** pasan por LightGBM (`_PASS_THROUGH`, `:61`), con origen propio `_PASS_SRC` — bien pensado: mapear `precip -> ghi` copiaría GHI crudo |
| Latencia | **~1,0 s** por llamada de 72 h (99 % es NWP + LightGBM; el pase del iTransformer son 4,8 ms) |
| Checkpoint | 42/42 claves, **495.192** params, encaja perfecto |

### Hallazgos (por severidad)

**🔴 M1 — El MOS no tiene ni un test.** `optimization/tests/test_forecaster.py` cubre la factory
(4 casos), `openmeteo` (1) y **PatchTST (3: contrato, horizonte 72 h, checkpoint faltante)**. Del MOS:
**cero**. Es el provider que se quiere promover a producción y es el único sin red de seguridad: si un
cambio rompe la construcción de features o la carga de un booster, **nada lo detecta**. Esto tiene que
ir **antes** de exponerlo en la página.

**🟠 M2 — Desperdicia los cuantiles.** `_v1_phys` toma literalmente solo `pr[..., ti, 1]`
(*"P50, cuantil 1"*, `:432`). El iTransformer está entrenado para dar P10/P50/P90 y **P10 y P90 se
tiran**. La banda la pone el radio conformal global del cambio 06. No está mal *per se* (una banda
calibrada global puede ser mejor que una banda cruda del modelo), pero **se está pagando el coste de un
modelo probabilístico para usar solo su mediana**. Merece una comparación: cobertura **y ancho** del
conformal actual contra los cuantiles del iTransformer.

**🟠 M3 — `load_state_dict(..., strict=False)`.** Hoy encaja perfecto (42/42), así que no hace daño
ahora. Pero `strict=False` **ignora en silencio** claves que falten o sobren: el día que se cambie el
checkpoint, el modelo cargaría a medias **sin error** y produciría basura plausible. Con la comprobación
ya hecha, se puede poner `strict=True` y quedarse con la garantía.

**🟡 M4 — `torch.sort` ausente.** Se midieron **5 cruces en 2160** comparaciones (GHI 3, difusa 2). Hoy
**no afecta a la salida del MOS**, porque solo se usa el P50. Pasa a ser obligatorio **si M2 se adopta**.

**🟡 M5 — `_PROXY_SCALE["wind_speed_100m"] = 1.3`** (`:59`). Está **documentado como decisión**
(`SPEC_MOS_FASE1.md:202`: *"¡escalado × 1.3!"*), pero **sin fuente física**. Es la razón por la que el
MOS baja el viento a ~1,6 m/s frente a los 4,0 del iTransformer. Se declara; no se cambia a ciegas.

**🟡 M6 — `_sol_geo` propio, sin `pvlib`.** Declinación + ángulo horario + excentricidad (`:80-90`),
correcto como aproximación, pero es **otra** geometría solar que la de `pvlib` que se usa en el modelo
gris. Cambiar a `pvlib` aquí **movería los resultados**: si se hace, va con re-corrida, no de paso.

### Lo que NO he verificado (y no puedo desde aquí)

- **Fallback sin internet**: no corté la red para probarlo. `_proxy_df(live=...)` tiene camino de
  archive, pero **no está medido** que sobreviva a un `ConnectTimeout`.
- **El comportamiento en la Raspberry**: la RAM de torch + lightgbm en una Pi de 2 GB sigue sin medirse.

### Consecuencia para el sprint: nuevo paso obligatorio

**5.6 — Tests del MOS, antes de producción.** Mínimo: (a) contrato 72×10 y sin NaN; (b) los 10 boosters
cargan y declaran 8 features; (c) salida dentro de rango físico; (d) recorte declarado cuando se recorta.
Y el test debe **fallar** si se rompe la lista de features — el criterio de siempre: un test que no puede
fallar no es un test.

## 11. Nubes: el NWP es peor que no decir nada (medido 2026-10-30)

Nace de una objeción del autor: *"es imposible que el iTransformer dé mejores resultados en nubes,
porque esa era justo la razón por la que aplicamos el MOS"*. Tenía razón. Lo que estaba mal era la
métrica, y el diagnóstico cambia la conclusión.

### 11.1 El "ganador" no predecía nada

En la serie del walk-forward (`comparativa_series.json`, n=24):

| modelo | media | **std** | **corr con la verdad** | MAE |
|---|---|---|---|---|
| real (ERA5) | 92,25 | **17,09** | — | — |
| **itransformer** | 99,78 | **0,42** | 0,314 | **7,81** |
| patchtst | 100,77 | 1,92 | 0,144 | 9,16 |
| mos / ecmwf_crudo | 64,67 | 27,78 | **0,555** | 27,58 |

**Un constante de 100 % da MAE 7,75**, mejor que el iTransformer (7,81). Con desviación de **0,42 puntos**
sobre una verdad que varía con std **17**, el iTransformer está diciendo *"100 % nublado"* todo el
tiempo. **Gana por cómo está hecha la métrica, no porque prediga.** En Pasto, con nubosidad media 92 %,
"siempre nublado" es un baseline brutal.

Con una verdad de media alta y std moderada, el **MAE premia estructuralmente al que dice un valor alto y
constante**. Para nubosidad hay que mirar **correlación, skill y desviación**.

### 11.2 Pero el NWP tiene señal y mucho sesgo

Test jul-dic 2025, n=4.416 (verdad: media 84,6, std 24,8). `nubes_diagnostico.csv`:

| modelo | MAE | corr | std | media | skill |
|---|---|---|---|---|---|
| **NWP crudo** | **30,03** | 0,42 | 31,69 | 59,86 | **−0,47** |
| constante 100 | 15,35 | 0,00 | 0,00 | 100,00 | 0,25 |
| media de train | 20,42 | 0,00 | 0,00 | 81,90 | 0,00 |
| NWP + offset (+29,0) | 17,75 | 0,41 | 22,53 | 80,01 | 0,13 |
| NWP × escala (1,55) | 21,66 | 0,41 | 31,18 | 74,63 | −0,06 |
| lineal (0,28x + 67,3) | 16,80 | 0,42 | 8,74 | 83,81 | 0,18 |
| **LightGBM (9 feat)** | **15,64** | **0,45** | 16,83 | 83,57 | **0,23** |

- **El NWP crudo subestima 25 puntos** (59,86 contra 84,6) y su **skill es negativo**: es peor que
  decir la media. Hoy el MOS publica exactamente eso, porque `cloud_cover` está en `_PASS_THROUGH`.
- **Solo quitar el sesgo** (offset de +29) baja el MAE de 30,03 a **17,75 (−41 %)** sin tocar el modelo.
- **Un LightGBM real** (las 9 features del MOS, sin el iTransformer) llega a **15,64 (−48 %)** y es el
  **único con correlación 0,45**.
- **Pero el constante 100 da 15,35**, todavía 0,3 puntos mejor en MAE. La ventaja del LightGBM **no es el
  MAE**: es que varía (std 16,8) y sigue la verdad (corr 0,45). El constante tiene corr 0.

### 11.3 Qué se concluye

1. **Quitar `cloud_cover` del `_PASS_THROUGH`** y entrenar el booster deja de publicar un NWP con sesgo
   de −25 puntos. Ganancia medida: **MAE −48 %**.
2. **La tabla de nubes debe llevar correlación y skill, no solo MAE.** Con solo MAE, el mejor modelo de
   la tabla es una constante.
3. **El iTransformer no sirve para nubes** (std 0,42). Queda retirada la recomendación anterior de
   "usarlo para nubes": era un artefacto de la métrica.
4. **Ningún modelo captura bien la nubosidad de Pasto.** El techo realista es corr ≈ 0,45. Eso es un
   resultado, no un defecto: es un sitio difícil y el capítulo debe decirlo así.

Evidencia: `reference/resultados/nubes_diagnostico.csv`, `fig_nubes_correccion.png`,
`fig_nubes_diagnostico.png` (sha256 en `reference/README.md`).
