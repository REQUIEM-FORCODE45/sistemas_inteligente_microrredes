# HANDOFF_TECNICO_2.md

## Documento de traspaso tecnico - Prediccion de clima con TimesFM 2.5 para energias renovables en Pasto, Colombia

**Fecha de generacion**: 30 de julio de 2026
**Ubicacion del proyecto**: `D:\prueba_IA\`
**Proposito**: Reunir TODO el trabajo realizado (datos, scripts, resultados, errores, conclusiones) para continuar en otro entorno/IA y usarlo como base de tesis. No omitir detalles importantes.

---

## 1. RESUMEN DEL PROYECTO

**Objetivo**: Predecir variables climaticas utiles para energias renovables en la ciudad de **Pasto, Colombia** (latitud 1.2136, longitud -77.2811) usando **TimesFM 2.5** (Google) como modelo base de forecasting de series temporales.

**Variables trabajadas**:
| Variable | Unidad | Uso renovable |
|----------|--------|---------------|
| `shortwave_radiation` (GHI) | W/m² | Energia solar fotovoltaica (principal) |
| `direct_normal_irradiance` (DNI) | W/m² | Termosolar / CSP |
| `diffuse_radiation` (DHI) | W/m² | Modelos de paneles |
| `global_tilted_irradiance` (GTI) | W/m² | Paneles inclinados |
| `temperature_2m` | °C | Eficiencia de paneles |
| `cloud_cover` | % | Impacto en generacion solar |
| `wind_speed_10m` | km/h | Aerogeneradores |
| `wind_speed_80m` / `wind_speed_120m` | km/h | Aerogeneradores a altura de hub |
| `wind_direction_80m` | grados | Orientacion de turbinas |
| `precipitation` | mm | Hidroenergia |
| `pressure_msl` | hPa | Densidad del aire (eolica) |
| `relative_humidity_2m` | % | Clima general |

**Linea de tiempo del trabajo**:
1. Script basico: prediccion de temperatura con TimesFM 2.5
2. Ampliacion a variables renovables (dashboard de 8 paneles)
3. Comparativa TimesFM 2.5 vs PatchTST (multivariante)
4. Modelo de correccion con PatchTST (entrada: pasado + forecast TimesFM)
5. Correccion con Ridge/XGBoost
6. Test de longitudes de contexto en TimesFM 2.5
7. Guias de uso (TimesFM 2.5 y PatchTST)
8. Script de fine-tuning LoRA para Pasto (pendiente de ejecutar)

---

## 2. ENTORNO Y DEPENDENCIAS

### 2.1 Hardware
- **GPU**: NVIDIA Quadro P400 (2 GB VRAM, driver 577.12, CUDA 12.9)
- **CPU**: disponible (TimesFM se ejecuta en CPU por limitacion de VRAM)
- **Sistema**: Windows (PowerShell 5.1)

### 2.2 Software y versiones
| Paquete | Version | Nota |
|---------|---------|------|
| Python | 3.11 | (uv cpython-3.11) |
| PyTorch | 2.6.0+cu124 | Instalado con CUDA (no venia por defecto) |
| Transformers | >=5.14 | Para TimesFM 2.5 |
| Accelerate | ultima | Requerido por device_map |
| PEFT | ultima | Para LoRA |
| scikit-learn | ultima | Ridge |
| XGBoost | ultima | Correccion ML |
| numpy, matplotlib, requests, pandas | ultima | Base |

### 2.3 Comandos de instalacion importantes
```bash
# Instalar PyTorch con CUDA (CRITICO: sin esto no usa la GPU)
python -m pip install torch --index-url https://download.pytorch.org/whl/cu124

# Librerias base
python -m pip install transformers accelerate numpy matplotlib requests

# Para fine-tuning LoRA
python -m pip install peft

# Para correccion ML
python -m pip install scikit-learn xgboost

# Para PatchTST (alternativa)
python -m pip install neuralforecast sktime
```

**NOTA**: La GPU Quadro P400 tiene solo 2GB VRAM. TimesFM 2.5 (200M parametros) se ejecuta en CPU. PatchTST pequeno si cabe en GPU. Con un GPU mejor, mover TimesFM a CUDA.

---

## 3. FUENTES DE DATOS (OPEN-METEO)

**Proveedor**: Open-Meteo (gratuito, sin API key, sin registro)

### 3.1 Forecast API (recientes + forecast)
```
URL: https://api.open-meteo.com/v1/forecast
Parametros clave:
- past_days: 0-92 (historial reciente, maximo 92 dias)
- forecast_days: 0-16 (prediccion futura)
- hourly: variables separadas por coma
- timezone: America/Bogota
```
Tiene TODAS las variables incluyendo `wind_speed_80m`, `wind_speed_120m`.

### 3.2 Archive API (historial largo)
```
URL: https://archive-api.open-meteo.com/v1/archive
Parametros clave:
- start_date: yyyy-mm-dd
- end_date: yyyy-mm-dd
- hourly: variables
- timezone: America/Bogota
```
**LIMITACION IMPORTANTE**: El Archive API **NO tiene** `wind_speed_80m` ni `wind_speed_120m` (devuelven todos None). Solo tiene `wind_speed_10m`. Para historial de 1 año hay que usar `wind_speed_10m`.

### 3.3 Ejemplo de request
```python
import requests
params = {
    "latitude": 1.2136,
    "longitude": -77.2811,
    "hourly": "shortwave_radiation,temperature_2m,wind_speed_10m,cloud_cover",
    "past_days": 92,
    "forecast_days": 5,
    "timezone": "America/Bogota",
}
data = requests.get("https://api.open-meteo.com/v1/forecast", params=params).json()
temps = data["hourly"]["temperature_2m"]
```

### 3.4 Manejo de valores None
- La API puede devolver `None` en algunos registros
- Filtrar filas con `None` manteniendo alineacion temporal con los timestamps
- `wind_speed_80m` y `wind_speed_120m` devuelven 100% `None` en Archive API

---

## 4. SCRIPTS CREADOS (todos en D:\prueba_IA\)

| Script | Proposito | Estado |
|--------|-----------|--------|
| `weather_forecast_pasto.py` | Prediccion basica + dashboard de 8 paneles renovables | FUNCIONA |
| `weather_hybrid_timesfm_patchtst.py` | Comparativa TimesFM vs PatchTST con 1 año | FUNCIONA |
| `weather_hybrid_correction.py` | Modelo de correccion PatchTST (pasado + forecast TimesFM) | FUNCIONA |
| `weather_hybrid_correction_ml.py` | Correccion con Ridge y XGBoost | FUNCIONA |
| `weather_timesfm_context_test.py` | Test de longitudes de contexto (72-720h) | FUNCIONA |
| `finetune_timesfm_pasto.py` | Fine-tuning LoRA de TimesFM 2.5 para Pasto | PENDIENTE (sin ejecutar) |
| `guia_timesfm2_5.md` | Guia completa de uso de TimesFM 2.5 | Documentacion |
| `guia_patchtst.md` | Guia de PatchTST sin errores de normalizacion | Documentacion |
| `HANDOFF_TECNICO_2.md` | Este documento | Documentacion |

### 4.1 Archivos de datos/modelos generados
| Archivo | Descripcion |
|---------|-------------|
| `forecast_pasto.png` | Grafico inicial de temperatura |
| `forecast_pasto_renovables.png` | Dashboard de 8 variables renovables |
| `comparativa_timesfm_patchtst.png` | Comparativa TimesFM vs PatchTST |
| `correccion_timesfm_patchtst.png` | Resultados del corrector PatchTST |
| `correccion_timesfm_ml.png` | Resultados Ridge/XGBoost |
| `timesfm_mejor_contexto.png` | Mejor contexto por variable |
| `patchtst_pasto.pth` | Modelo PatchTST entrenado (1 año) |
| `patchtst_correction_pasto.pth` | Modelo corrector PatchTST |
| `ridge_correction.pkl` | Modelo Ridge guardado |
| `xgb_correction.pkl` | Modelo XGBoost guardado |
| `correction_train_cache.npz` | Cache de datos correccion PatchTST |
| `correction_ml_cache.npz` | Cache de datos correccion ML |

---

## 5. RESULTADOS EXPERIMENTALES DETALLADOS

### 5.1 EXPERIMENTO 1: TimesFM 2.5 zero-shot basico (90 dias contexto)
Script: `weather_forecast_pasto.py`
- 2160 horas de historico, forecast real de Open-Meteo como ground truth
- MAE = error absoluto medio vs forecast real

| Variable | MAE | MAPE | Observacion |
|----------|-----|------|-------------|
| Temperatura | 1.03 °C | 6.93% | Muy bueno |
| GHI solar | 27.0 W/m² | 12.94% | Bueno |
| Cobertura de nubes | 15.1 % | 22.63% | Aceptable |
| Viento 80m | 2.54 km/h | ~84% | MAPE alto por vientos bajos |
| Viento 120m | 2.64 km/h | ~84% | MAPE alto por vientos bajos |

**Observaciones**:
- El viento en Pasto es muy bajo (zona de montaña), por lo que el MAPE se amplifica con errores pequenos
- La potencia eolica estimada fue muy baja (max ~1.5 kW de 1 MW nominal) - es realista
- La potencia PV estimada: ~0.83 kW pico por kWp instalado, 29.5 kWh en 5 dias (prometedor)

### 5.2 EXPERIMENTO 2: TimesFM vs PatchTST (1 año de datos, GPU)
Script: `weather_hybrid_timesfm_patchtst.py`
- 8808 horas de entrenamiento, 120h de test
- Variables: GHI, temperatura, wind_speed_10m, cloud_cover
- PatchTST: d_model=128, 3 capas, 100 epochs, entrenado en GPU
- TimesFM en CPU, PatchTST en GPU

**Resultados (MAE, TimesFM / PatchTST)**:
| Variable | TimesFM | PatchTST | Mejor |
|----------|---------|----------|-------|
| GHI | 30.81 | 36.71 | TimesFM |
| Temperatura | 0.53 | 1.09 | TimesFM |
| Viento 10m | 1.40 | 1.77 | TimesFM |
| Nubosidad | 9.87 | 18.34 | TimesFM |

**Observaciones visuales del usuario**:
- PatchTST captura mejor la tendencia de la nubosidad aunque el MAE es peor
- PatchTST captura mejor los cambios abruptos (subidas/bajadas)
- TimesFM gana en MAE porque produce predicciones mas suaves

**Conclusion**: PatchTST entrenado desde cero con 1 año de datos NO supera a TimesFM zero-shot. La razon principal: TimesFM fue preentrenado con millones de series, PatchTST solo vio 8808 horas.

### 5.3 EXPERIMENTO 3: Modelo de correccion con PatchTST
Script: `weather_hybrid_correction.py`
- Idea: PatchTST recibe pasado + forecast de TimesFM como covariables, y corrige el forecast
- 178 ventanas de entrenamiento (cada 48h)
- Corrector: `out = covariable_TimesFM + residual`

**Resultados (MAE, TimesFM / Corregido)**:
| Variable | TimesFM | Corregido | Resultado |
|----------|---------|-----------|-----------|
| GHI | 30.81 | 29.85 | CORRECTOR mejora leve |
| Temperatura | 0.53 | 0.52 | CORRECTOR mejora leve |
| Viento 10m | 1.40 | 1.42 | Similar |
| Nubosidad | 9.87 | 21.54 | TIMESFM mucho mejor |

**Conclusion**: La correccion con PatchTST apenas mejora (GHI, temperatura) y empeora mucho la nubosidad. Pocas ventanas de entrenamiento (178) y TimesFM ya es muy fuerte.

### 5.4 EXPERIMENTO 4: Correccion con Ridge y XGBoost
Script: `weather_hybrid_correction_ml.py`
- Features: forecast TimesFM de cada variable + 24h de historico + features temporales (hora, dia)
- 23,168 muestras de entrenamiento, 104 features
- Modelos: Ridge (alpha=1) y XGBoost (200 arboles, depth 6)

**Resultados (MAE, TimesFM / Ridge / XGBoost)**:
| Variable | TimesFM | Ridge | XGBoost | Mejor |
|----------|---------|-------|---------|-------|
| GHI | 30.81 | 47.72 | 32.33 | TimesFM |
| Temperatura | 0.53 | 0.61 | 0.86 | TimesFM |
| Viento 10m | 1.40 | 1.40 | 1.50 | Empate/TimesFM |
| Nubosidad | 9.87 | 23.09 | 14.61 | TimesFM |

**Conclusion**: NINGUN modelo de correccion ML mejora a TimesFM. Los correctores aprenden el ruido de TimesFM en lugar de correlaciones utiles. Ridge dio warning de matriz mal condicionada (features correlacionadas).

### 5.5 EXPERIMENTO 5: Longitudes de contexto en TimesFM 2.5 (CLAVE)
Script: `weather_timesfm_context_test.py`
- Probar 72, 96, 168, 336, 720 horas de contexto
- 1 año de datos, 120h de test

**Resultados (MAE por contexto)**:
| Variable | 72h | 96h | 168h | 336h | 720h | MEJOR |
|----------|-----|-----|------|------|------|-------|
| GHI | 37.15 | 32.78 | 27.95 | **26.49** | 26.83 | **336h** |
| Temperatura | 0.59 | **0.48** | 0.51 | 0.58 | 0.51 | **96h** |
| Viento 10m | 1.67 | 1.66 | 1.49 | **1.45** | 1.55 | **336h** |
| Nubosidad | 9.37 | 9.78 | **7.88** | 12.37 | 17.00 | **168h** |

**Mejoras vs contexto de 72h**:
- GHI: -29% (336h)
- Temperatura: -19% (96h)
- Viento: -13% (336h)
- Nubosidad: -16% (168h)

**CONCLUSION IMPORTANTE PARA TESIS**: Cada variable tiene su longitud de contexto optima. No existe un contexto unico ideal. Recomendacion:
```python
BEST_CONTEXTS = {
    "shortwave_radiation": 336,  # 2 semanas
    "temperature_2m": 96,        # 4 dias
    "wind_speed_10m": 336,       # 2 semanas
    "cloud_cover": 168,          # 1 semana
}
```

### 5.6 EXPERIMENTO 6 (pendiente): Fine-tuning LoRA
Script: `finetune_timesfm_pasto.py` (LISTO pero NO ejecutado)
- Usa PEFT LoRA, solo entrena ~0.6% de parametros (~1.4M de 232M)
- Basado en ejemplo oficial de Google (publicado abril 2026)
- Configuracion inicial: context 336, horizon 128, lora_r=4, lora_alpha=8, batch 8-16
- El intento de ejecucion fue abortado por el usuario (su GPU estaba en uso)
- **PENDIENTE**: ejecutar `python finetune_timesfm_pasto.py --epochs 5 --num_samples 2000 --batch_size 8`

---

## 6. ERRORES ENCONTRADOS Y SOLUCIONES (MUY IMPORTANTE PARA TESIS)

### 6.1 Error de codificacion Windows (Unicode)
- **Problema**: `UnicodeEncodeError: 'charmap' codec can't encode` con emojis y acentos en prints
- **Solucion**: eliminar emojis y caracteres especiales de los `print()`, usar texto plano ASCII en consola de Windows

### 6.2 device_map requiere accelerate
- **Problema**: `ValueError: Using a device_map... requires accelerate`
- **Solucion**: `pip install accelerate`

### 6.3 Valores None en la API
- **Problema**: `TypeError: must be real number, not NoneType` al pasar series con None a torch
- **Solucion**: filtrar valores None antes de convertir a tensor

### 6.4 wind_speed_80m/120m no disponibles en Archive API
- **Problema**: `wind_speed_80m` y `wind_speed_120m` devuelven 100% None en archive-api
- **Solucion**: usar `wind_speed_10m` para entrenamiento con historial largo

### 6.5 GPU no detectada
- **Problema**: `torch.cuda.is_available()` devolvia False aunque existia GPU
- **Causa**: PyTorch instalado sin soporte CUDA (version CPU)
- **Solucion**: `pip install torch --index-url https://download.pytorch.org/whl/cu124`

### 6.6 ERROR CRITICO DE NORMALIZACION EN PATCHTST
- **Problema**: PatchTST devolvia predicciones absurdas (MAE de temperatura 15°C, GHI 252 W/m²)
- **Causa raiz**: El modelo desnormalizaba su salida con media/std de la ventana, pero las predicciones NO se multiplicaban por el std global ni se sumaba la media global del entrenamiento
- **Solucion**: en la funcion de prediccion:
  ```python
  pred = pred_norm * train_std + train_mean  # CRITICO
  ```
- **Ver** `guia_patchtst.md` para los detalles completos de este error

### 6.7 PatchTST con pocas ventanas
- **Problema**: `ValueError: __len__() should return >= 0` con dataset insuficiente
- **Causa**: `len(data) < context_len + horizon_len`
- **Solucion**: verificar `self.n = len(data) - context - horizon + 1` y lanzar error claro

### 6.8 Ridge matriz mal condicionada
- **Problema**: `LinAlgWarning: An ill-conditioned matrix detected`
- **Causa**: 104 features muy correlacionadas entre si
- **Solucion**: reducir features o usar regularizacion mas fuerte

### 6.9 Cache de datos (evitar regenerar)
- **Problema**: generar forecasts de TimesFM para entrenamiento es lento (horas en CPU)
- **Solucion**: guardar en `.npz` cache y cargar si existe
- Archivos: `correction_train_cache.npz`, `correction_ml_cache.npz`

### 6.10 Importacion de PatchTST
- `sktime` no tenia `PatchTSTForecaster` en la version instalada
- `neuralforecast` tenia conflictos de dependencias (ray, pyarrow)
- **Solucion final**: implementar PatchTST manualmente en PyTorch (arquitectura propia)

---

## 7. ARQUITECTURAS Y CODIGOS CLAVE

### 7.1 Prediccion con TimesFM 2.5 (patron basico)
```python
import numpy as np
import torch
from transformers import TimesFm2_5ModelForPrediction

model = TimesFm2_5ModelForPrediction.from_pretrained(
    "google/timesfm-2.5-200m-transformers",
    device_map=device,  # cpu para VRAM limitada
)

# NOTA: TimesFM normaliza internamente (RevIN). NO normalizar externamente.
serie = serie[~np.isnan(serie)]  # filtrar NaN
tensor = torch.tensor(serie, dtype=torch.float32, device=model.device)

with torch.no_grad():
    out = model(past_values=[tensor], return_dict=True)

media = out.mean_predictions[0].cpu().numpy()      # (128,)
cuantiles = out.full_predictions[0].cpu().numpy()  # (128, 9)
```

### 7.2 PatchTST (sin normalizacion interna - normalizar externamente)
```python
class PatchTST(nn.Module):
    def __init__(self, n_vars, context_len, horizon_len, patch_len=24,
                 d_model=128, n_heads=4, n_layers=3, d_ff=256, dropout=0.1):
        # patch_embed: Linear(patch_len, d_model)
        # var_embed: (1, n_vars, 1, d_model)
        # pos_embed: (1, 1, n_patches, d_model)
        # transformer: TransformerEncoder(n_layers)
        # head: Linear(d_model, d_ff) -> ReLU -> Linear(d_ff, horizon_len)

    def forward(self, x):  # x: (B, T, V) ya normalizado externamente
        B, T, V = x.shape
        x = x.permute(0, 2, 1).reshape(B, V, n_patches, patch_len)
        x = patch_embed(x) + var_embed + pos_embed
        x = x.reshape(B, V*n_patches, d_model)
        x = transformer(x)
        x = x.reshape(B, V, n_patches, d_model).mean(dim=2)
        out = head(x).permute(0, 2, 1)  # (B, horizon, V)
        return out
```

### 7.3 Pipeline normalizacion correcto PatchTST
```python
# Entrenar
train_mean = data_train.mean(axis=0)
train_std = data_train.std(axis=0) + 1e-8
train_norm = (data_train - train_mean) / train_std

# Guardar en checkpoint junto al modelo

# Predecir
contexto_norm = (contexto - train_mean) / train_std
pred_norm = model(contexto_norm)
pred = pred_norm * train_std + train_mean   # <-- PASO CRITICO
```

### 7.4 Estimacion de potencia (util para tesis)
```python
# Potencia PV
def estimate_pv_power(ghi, temp_c, panel_kw=1.0, temp_coeff=-0.004):
    t_cell = temp_c + 0.0256 * ghi  # NOCT simplificado
    efficiency = np.clip(1 + temp_coeff * (t_cell - 25), 0, 1)
    return np.clip(panel_kw * (ghi / 1000.0) * efficiency, 0, panel_kw)

# Potencia eolica
def estimate_wind_power(wind_ms, turbine_kw=1000, cut_in=3, rated=12, cut_out=25):
    power = np.zeros_like(wind_ms, dtype=float)
    mask = (wind_ms >= cut_in) & (wind_ms <= cut_out)
    s = wind_ms[mask]
    p = turbine_kw * ((s - cut_in) / (rated - cut_in)) ** 3
    power[mask] = np.clip(p, 0, turbine_kw)
    return power
# NOTA: wind_ms = wind_kmh / 3.6  (conversion)
```

### 7.5 Fine-tuning LoRA (patron oficial)
```python
from peft import LoraConfig, get_peft_model, PeftModel
from transformers import TimesFm2_5ModelForPrediction

model = TimesFm2_5ModelForPrediction.from_pretrained(
    "google/timesfm-2.5-200m-transformers",
    torch_dtype=torch.bfloat16, device_map=device,
)
lora_config = LoraConfig(r=4, lora_alpha=8, target_modules="all-linear",
                         lora_dropout=0.05, bias="none")
model = get_peft_model(model, lora_config)

# forward con future_values computa la perdida nativamente:
outputs = model(past_values=context, future_values=target, forecast_context_len=context_len)
loss = outputs.loss

# Guardar solo el adapter:
model.save_pretrained("adapter_dir")
# Cargar:
ft_model = PeftModel.from_pretrained(base_model, "adapter_dir")
```

---

## 8. CONCLUSIONES Y HALLAZGOS PRINCIPALES

### 8.1 Sobre TimesFM 2.5
1. **TimesFM 2.5 es un modelo univariante**: predice cada variable por separado. NO captura correlaciones entre variables en zero-shot.
2. **Es muy fuerte como zero-shot**: supera a PatchTST entrenado desde cero con 1 año de datos.
3. **La longitud de contexto importa MUCHO**: no es monotona. Cada variable tiene un optimo:
   - GHI: 336h (2 semanas)
   - Temperatura: 96h (4 dias)
   - Viento: 336h (2 semanas)
   - Nubosidad: 168h (1 semana)
4. **Tiene normalizacion interna (RevIN)**: NO normalizar datos externamente.
5. **Soporta hasta 16,384 pasos de contexto** y 128 de horizonte por defecto.
6. **Es fuerte en variables con patrones claros** (GHI, temperatura) y mas debil en variables ruidosas (viento, nubosidad).

### 8.2 Sobre PatchTST
1. **PatchTST entrenado desde cero NO supera a TimesFM zero-shot** con solo 1 año de datos.
2. **Si captura correlaciones entre variables** (channel-mixing) y sigue mejor la tendencia/cambios bruscos en nubosidad, aunque el MAE sea peor.
3. **Necesita muchos mas datos** para superar a un modelo preentrenado.
4. **El mayor riesgo es la normalizacion**: doble normalizacion o desnormalizacion incorrecta arruinan las predicciones.

### 8.3 Sobre correcciones ML
1. **Ninguna correccion (PatchTST, Ridge, XGBoost) mejoro de forma significativa a TimesFM**.
2. Los correctores tienden a aprender el ruido de TimesFM en vez de correlaciones utiles.
3. La nubosidad fue la variable mas dificil de corregir (empeoro en todos los intentos).

### 8.4 Sobre energias renovables en Pasto
1. **Pasto tiene vientos muy bajos**: la potencia eolica estimada fue minima (max 1.5 kW de 1 MW). El viento NO es viable como fuente principal en Pasto segun estos datos.
2. **La energia solar si es viable**: potencia PV estimada de ~0.83 kW pico por kWp instalado, con 29.5 kWh en 5 dias para 1 kWp.
3. **GHI y temperatura son las variables mejor predichas** (MAE 26-30 W/m² y 0.48-0.53°C).
4. **Nubosidad es la mas dificil** de predecir pero es CRITICA para solar (afecta directamente el GHI).

### 8.5 Recomendacion final para produccion
- **Usar TimesFM 2.5 directo** con contexto optimo por variable
- **NO usar correccion ML** con los datos actuales
- **El camino mas prometedor es el fine-tuning LoRA** (pendiente de probar)
- Considerar obtener **mas anos de datos** o estaciones locales propias para mejorar

---

## 9. PASOS SIGUIENTES (PARA CONTINUAR LA TESIS)

1. **Ejecutar el fine-tuning LoRA** (`finetune_timesfm_pasto.py`) y comparar zero-shot vs fine-tuned
2. **Obtener 2-3 anos de datos historicos** de Open-Meteo Archive API y re-evaluar
3. **Probar PatchTST con mas datos** (2-3 anos) o con un modelo preentrenado
4. **Probar iTransformer u otros modelos multivariantes** para comparar
5. **Incorporar variables locales reales** si hay estaciones meteorologicas en Pasto (Universidad de Narino, IDEAM)
6. **Evaluar economicamente**: estimar produccion energetica mensual PV para Pasto
7. **Comparar con benchmarks clasicos**: ARIMA, SARIMA, ETS, Prophet
8. **Publicar el pipeline completo** como base de la tesis

---

## 10. LINKS DE REFERENCIA

### TimesFM 2.5
- Documentacion HF: https://huggingface.co/docs/transformers/v5.14.0/en/model_doc/timesfm2_5
- Modelo: https://huggingface.co/google/timesfm-2.5-200m-transformers
- Repo oficial: https://github.com/google-research/timesfm
- Paper: https://arxiv.org/abs/2106.09685
- Ejemplo fine-tuning: https://github.com/google-research/timesfm/tree/master/timesfm-forecasting/examples/finetuning
- Notebook HF (kashif): https://github.com/huggingface/notebooks/blob/main/examples/timesfm2_5.ipynb

### PatchTST
- Paper: https://arxiv.org/abs/2211.14730
- Implementacion Nixtla: https://github.com/Nixtla/neuralforecast

### LoRA/PEFT
- Libreria: https://github.com/huggingface/peft
- Paper LoRA: https://arxiv.org/abs/2106.09685

### Open-Meteo
- Docs forecast: https://open-meteo.com/en/docs
- Docs archive: https://open-meteo.com/en/docs/historical-weather-api

---

## 11. NOTAS FINALES

- Todos los scripts usan `print()` en ASCII plano (sin emojis ni acentos) por compatibilidad con consola Windows (cp1252)
- El modelo TimesFM 2.5 se carga cada vez desde Hugging Face (descarga ~500MB al primer uso, luego cache local)
- Para ejecutar sin reentrenar PatchTST: el script detecta `patchtst_pasto.pth` y lo carga
- Para forzar reentrenamiento: `--retrain`
- El cache de datos de entrenamiento evita regenerar forecasts de TimesFM (que es lo mas lento)
- Tiempos estimados en CPU: generar 1 forecast de TimesFM ~1-2 segundos por variable; con 178 ventanas y 4 variables fueron ~12-30 min
