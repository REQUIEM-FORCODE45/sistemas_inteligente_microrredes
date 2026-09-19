# PAQUETE DE TRASPASO — MOS Fase 1 (sin reentrenamiento)

Este paquete contiene **todo lo necesario** para integrar el MOS en el repositorio
`sistemas_inteligente_microrredes` **sin reentrenar ningún modelo**. Los modelos ya
están entrenados y validados.

**Lee primero**: `SPEC_MOS_FASE1.md` (especificación completa de implementación).

---

## Estructura del paquete

```
MOS_FASE1/
├── README.md                          ← este archivo
├── SPEC_MOS_FASE1.md                  ← SPEC completa (PASO 1 + PASO 2)
├── models/
│   ├── lgbm_mos_shortwave_radiation.txt       ← GHI      (el principal)
│   ├── lgbm_mos_direct_normal_irradiance.txt  ← DNI
│   ├── lgbm_mos_diffuse_radiation.txt         ← DHI
│   ├── lgbm_mos_temperature_2m.txt
│   ├── lgbm_mos_relative_humidity_2m.txt
│   ├── lgbm_mos_cloud_cover.txt               ← ⚠️ pass-through (ver SPEC §3.5)
│   ├── lgbm_mos_wind_speed_100m.txt
│   ├── lgbm_mos_wind_speed_10m.txt
│   ├── lgbm_mos_surface_pressure.txt
│   └── lgbm_mos_precipitation.txt             ← ⚠️ pass-through (ver SPEC §3.5)
├── itransformer/
│   ├── modelo_b.pt                    ← iTransformer v1 (495K params) YA ENTRENADO
│   └── config_modelos.json            ← features (33), stats, transforms, tgt_idx
└── reference/
    ├── prediccion_en_vivo.py          ← implementación runtime COMPLETA de la receta
    └── mos_multivariable.py           ← definición de las 8 features + entrenamiento
```

---

## Qué es cada cosa

### `models/*.txt` — los 10 correctores MOS (LightGBM)
Modelos **ya entrenados**. Se cargan con:

```python
import lightgbm as lgb
model = lgb.Booster(model_file="models/lgbm_mos_shortwave_radiation.txt")
pred = model.predict(X)      # X = (n_horas, 8) con las features de SPEC §3.3
```

Hiperparámetros (solo para reproducibilidad; **no reentrenar**):
`n_estimators=500, learning_rate=0.04, num_leaves=63, min_child_samples=30,
subsample=0.8, colsample_bytree=0.7, random_state=42`

> El nombre del archivo corresponde **exactamente** al nombre de la variable del
> contrato (`WEATHER_VARIABLES`). No hay que renombrar nada.

### `itransformer/modelo_b.pt` — el iTransformer v1 **YA ENTRENADO**
Es la feature `v1` del MOS (SPEC §3.2). **NO reentrenar.**

- Arquitectura: `d_model=128, n_heads=8, e_layers=3, d_ff=256, dropout=0.2` (en inferencia dropout=0)
- Contexto L=512 h → horizonte H=72 h, cuantiles [0.1, 0.5, 0.9]
- 33 features, 10 targets — el orden está en `config_modelos.json → FEATURES`
- `config_modelos.json` incluye además: `stats` (media/std por variable para
  des-normalizar) y el resto de metadatos.
- Cómo se carga y decodifica: **copiar de `reference/prediccion_en_vivo.py`**
  (incluye el decode correcto: `z·std + mean` ANTES de invertir el transform).

**El iTransformer es AUTOCONTENIDO** — `config_modelos.json` ya trae:
- `stats`: `[media, std]` de las 33 features (para normalizar/desnormalizar)
- `clim`: climatología horaria (24 valores) de las 6 variables con transform `anomaly`
- `FEATURES` (33, orden exacto), `tgt_idx`, `L=512`, `H=72`, `Q=[0.1,0.5,0.9]`

Por lo tanto **NO se necesita el fichero ERA5 de entrenamiento** (`era5_v3.parquet`):
usa `cfg["stats"]` y `cfg["clim"]` del propio config.

> ⚠️ **BUG CONOCIDO — no usar `TRANSFORMS` del config**: en
> `config_modelos.json` el campo `TRANSFORMS` está **corrupto** (los dicts se
> serializaron como listas de claves, p. ej. `["type","denom"]`). El diccionario
> `TRANSFORMS` **correcto** está hardcodeado en `reference/prediccion_en_vivo.py`:
> `shortwave_radiation`→`divide/ghi_toa`, `direct_normal_irradiance`→`divide/sin_elev`,
> `diffuse_radiation`→`divide/ghi_toa`, y `anomaly` para temp/RH/nubes/viento100/
> viento10/presión, `none` para precipitación. **Copiar ese, no el del config.**

### `reference/prediccion_en_vivo.py` — la receta completa en runtime
Implementación de referencia del pipeline end-to-end (contexto + iTransformer +
ECMWF en vivo + aplicación del MOS). **Usar como guía**, no copiar tal cual (usa
rutas absolutas del proyecto de origen).

### `reference/mos_multivariable.py` — definición de features
Define las **8 features** por variable, el mapeo proxy, y cómo se entrenó cada
modelo. Es la fuente de verdad de la receta (SPEC §3.3 y §3.4).

---

## Reglas de integración (resumen; detalle en la SPEC)

1. **NO reentrenar** ningún modelo. Se portan los artefactos.
2. **NO modificar** los 3 providers existentes (`openmeteo`, `timesfm`, `patchtst`).
   Solo añadir `"mos"` a `_PROVIDERS` (2 líneas).
3. **Horizonte máximo 72 h** → `RuntimeError` si se piden más (igual que PatchTST).
4. **`cloud_cover` y `precipitation` → pass-through**: devolver el valor del ECMWF
   en vivo, NO la salida del LightGBM (el MOS no mejora esas dos y para
   precipitación no hay señal física). Ver SPEC §3.5.
5. **Advertencia metodológica obligatoria**: ERA5 (verdad) y ECMWF (entrada) son de
   la misma familia → el MAE es optimista. Reportar como *"NWP corregido con ML"*,
   nunca como *"ML puro"*.
6. **Sin fuga de datos**: `pers_h24` y `v1` solo usan información pasada.

---

## Origen y evidencia

- Proyecto origen: `C:\Users\2D\tesis-microrred`
- Evidencia y validación: `tesis-microrred/docs/HANDOFF_TECNICO.md §19`
- Resultados (MAE GHI jul-dic 2025): **MOS 29.26** vs referencia 51.17 (−42.8%)
- Validado en **doble periodo** (ene-feb 2025 y jul-dic 2025)

## Checklist de aceptación

- [ ] `FORECASTER=mos` devuelve `ClimateForecast` con **72 filas** y las **10 columnas** exactas.
- [ ] `hours=168` → error controlado (no excepción no capturada).
- [ ] Los 3 providers existentes siguen funcionando igual (sin regresión).
- [ ] Comparativa PASO 2 generada en `results/pasto_narino/forecast/`.
- [ ] Nota metodológica con la advertencia *same-family* y el límite de 72 h.
