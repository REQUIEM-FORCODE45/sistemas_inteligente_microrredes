# HANDOFF TÉCNICO — Tesis: Plataforma de Gestión de Microrredes con ML

> **Propósito de este documento**: resumen técnico completo del estado del proyecto para (a) el autor de la tesis y (b) cualquier IA/asistente que continúe la investigación. Contiene decisiones, arquitectura, código, métricas, bugs encontrados y pendientes. Todo lo que se necesita para seguir sin repetir descubrimientos.

**Fecha de emisión**: 24 de julio de 2026
**Proyecto**: `C:\Users\2D\tesis-microrred`
**Venv**: `.venv` (Python 3.11.9, activar con `source .venv/Scripts/activate` en git-bash)
**GPU**: NVIDIA RTX 4050 Laptop (6 GB VRAM), PyTorch 2.6.0+cu124 (CUDA)

---

## 1. VISIÓN Y CONTEXTO DE LA TESIS

**No es una microrred específica**: el objetivo es una **PLATAFORMA/SISTEMA site-agnostic** que administre CUALQUIER microrred. Cada microrred se define con un YAML (coords, activos, capacidades) y la plataforma hace todo lo demás.

Pilares de la tesis:
1. **Predicción**: forecast climático propio (PatchTST) → alimenta modelos dinámicos → estimación de generación y energía.
2. **Detección de parámetros**: análisis de datos de sensores de la microrred.
3. **Control**: acciones sobre la microrred a partir de la predicción (despacho BESS, MPC a futuro).

**Filosofía del autor**: control total del pipeline. NO depender de forecast de terceros como producto final (Open-Meteo solo como *proveedor de datos*, no como motor de forecast). Interés en lo actual/óptimo (transformers, LLMs).

**Idea futura (documentada, no implementada)**: capa LLM que ajuste el forecast con alertas meteorológicas oficiales (fuentes fiables, JSON estructurado validado, no texto libre). Brechas de seguridad reconocidas (confiabilidad de noticias) → mitigar con whitelist de fuentes + schema.

---

## 2. ARQUITECTURA DECIDIDA

```
┌─────────────────────────────────────────────────────────────┐
│ FUENTES                                                     │
│ • Open-Meteo Archive API (ERA5 histórico, gratis, sin key)  │
│ • Open-Meteo Forecast API (NWP: GFS/ECMWF/ICON) → features  │
│ • Sensores reales de microrred (futuro)                     │
│ • Alertas meteorológicas oficiales → LLM (futuro)           │
└──────────────┬──────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│ MÓDULO 1: FORECAST CLIMÁTICO (PatchTST) │
│ GHI, temperatura, viento @72h            │
│ cuantiles P10/P50/P90 (pinball loss)     │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│ MÓDULO 2: MODELOS DINÁMICOS              │
│ PV: pvlib (POA → temp celda → DC → AC)   │
│ Eólica: curva potencia + perfil log      │
│ BESS: SoC, eficiencias, restricciones    │
│ Carga: perfil sintético (placeholder)    │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│ MÓDULO 3: CONTROL / ESTIMACIÓN           │
│ balance generación vs carga + BESS       │
│ (MPC futuro)                             │
└──────────────────────────────────────────┘
               ▲
               │ expuesto como
┌──────────────────────────────────────────┐
│ API REST (FastAPI, Python) en :8000      │
│ consumida por el backend Node/JS del     │
│ sistema web del usuario                  │
└──────────────────────────────────────────┘
```

**Stack**: ML en Python (PyTorch, pvlib) expuesto como FastAPI; la app web del usuario es JavaScript/Node que consume la API.

---

## 3. CASO DE ESTUDIO: PASTO, NARIÑO

- **Coords**: 1.2136, −77.2811, ~2600 msnm, timezone America/Bogota.
- **Datos**: 6 años ERA5 horario (2020-01-01 → 2025-12-31), **52.608 horas, 0 NaN, 0 gaps**.
- **Decisión clave**: Pasto ciudad tiene viento NULO (1.48 m/s a 100m, max 7.7) → **caso SOLAR + BESS, no híbrido eólico**. El altiplano Túquerres-Ipiales (4.27 m/s) fue evaluado y descartado.
- **Valor de investigación**: variabilidad nubosa orográfica extrema (GHI cae 1000→200 W/m² en 1h) → caso difícil que justifica el forecast.
- **Segunda microrred ejemplo**: `guajira_cabovela.yaml` (Cabo de la Vela, solar+eólica) para demostrar generalización multi-sitio.

---

## 4. ESTRUCTURA DEL PROYECTO

```
tesis-microrred/
├── config/sites/
│   ├── pasto_narino.yaml      # microrred caso de estudio (solar+BESS)
│   └── guajira_cabovela.yaml  # ejemplo híbrido (solar+eólica)
├── data/
│   ├── raw/<site_id>/openmeteo_{lat}_{lon}_{year}.parquet + merged
│   └── processed/<site_id>/{train,val,test}.parquet + norm_stats.csv
├── src/
│   ├── data/
│   │   ├── download_openmeteo.py   # descarga ERA5 por año con reintentos
│   │   └── build_dataset.py        # features + split + normalización
│   ├── models/
│   │   ├── patchtst.py             # modelo (REVISAR SECCIÓN 6)
│   │   ├── train.py                # entrenamiento + evaluación
│   │   ├── plot_forecast.py        # gráficas de evaluación
│   │   ├── predict_live.py         # forecast operativo con datos recientes
│   │   └── validate_today.py       # validación forecast vs observado
│   ├── dynamic_models/
│   │   ├── pv.py                   # planta PV con pvlib
│   │   ├── wind.py                 # turbina con curva de potencia
│   │   └── bess.py                 # batería con SoC
│   └── api/main.py                 # FastAPI
├── results/<site_id>/
│   ├── patchtst_best.pt            # checkpoint
│   ├── metrics.json                # métricas de test
│   └── plots/                      # gráficas PNG
├── train_overnight.bat             # entrenamiento 100 épocas + gráficas
└── HANDOFF_TECNICO.md              # este archivo
```

---

## 5. PIPELINE DE DATOS

### 5.1 Descarga (`download_openmeteo.py`)
- URL archive: `https://archive-api.open-meteo.com/v1/archive` (ERA5 reanálisis).
- Params clave: `hourly` con 11 variables (shortwave_radiation, dni, dhi, temperature_2m, relative_humidity_2m, cloud_cover, wind_speed_100m, wind_direction_100m, wind_speed_10m, surface_pressure, precipitation), `timezone` local, `wind_speed_unit=ms`.
- Por año con reintentos exponenciales (2^attempt seg) — robusto a timeouts.
- **NOTA**: la API archive sirve datos recientes también (usado para validación operativa).
- Comando: `python -m src.data.download_openmeteo --site config/sites/pasto_narino.yaml`

### 5.2 Feature engineering (`build_dataset.py`)
- Variables cíclicas: hora del día y día del año en sen/cos.
- Geometría solar (Spencer/Cooper): `ghi_toa` (radiación extraterrestre), `sin_elev`.
- **Índice de claridad** `kt = GHI/ghi_toa` (clip a [0, 1.2]) — proxy de nubosidad.
- Viento vectorial: componentes u/v (mejor que dirección angular cruda).
- `wind_power_proxy = v³` (proporcional a potencia eólica).
- `cloud_delta_1h` (cambio horario de nubosidad), `kt_roll3h` (rolling 3h).
- **Total: 23 features de entrada**.

### 5.3 Split temporal y normalización (CRÍTICO, sin leakage)
- Split **temporal estricto sin shuffle**: 70% train (36.825 h) / 15% val (7.891) / 15% test (7.892).
- **Los stats de normalización (media/std z-score) se calculan SOLO sobre train** y se guardan en `norm_stats.csv`. Nunca recalculados en val/test/inferencia.
- El test cubre aproximadamente oct-2024 → dic-2025 (datos nunca vistos por el modelo).

---

## 6. MODELO: PATCHTST (implementación propia)

### 6.1 Arquitectura (`src/models/patchtst.py`)
- **Patching**: serie dividida en parches (patch_len=16, stride=8) → proyecto lineal a d_model=128 → Transformer encoder (3 capas, 16 heads, d_ff=256, dropout 0.2, GELU, norm_first).
- **Channel independence**: cada canal pasa por el MISMO transformer (pesos compartidos) — regulariza con datasets chicos, gana a TFT en benchmarks LTSF.
- **RevIN** (Reversible Instance Normalization): normaliza cada ventana por su media/std y desnormaliza a la salida. Clave para no-estacionariedad (ciclo diario).
- **Salida por cuantiles**: cabeza lineal produce H×n_quantiles por canal → forecast probabilístico P10/P50/P90 con **pinball loss** (necesario para control BESS: energía garantizada = P10).
- **target_idx**: selecciona qué canales devolver (los targets del YAML), el resto de canales se usan como covariables.
- Parámetros: ~2.1M.

### 6.2 Configuración (en YAML del sitio)
```
context_length: 512   # horas de historia (~21 días)
horizon: 72           # horas a predecir
patch_len: 16, stride: 8, d_model: 128, n_heads: 16, e_layers: 3
d_ff: 256, dropout: 0.2, epochs: 20 (probado hasta 20), batch_size: 256, lr: 1e-4
quantiles: [0.1, 0.5, 0.9]
```

### 6.3 ⚠️ BUG CRÍTICO ENCONTRADO Y CORREGIDO (RevIN denorm)
La primera versión desnormalizaba con `permute+reshape` a (B,H,C*Q) que **entrelazaba canales y cuantiles** → corrompía el canal de temperatura (salidas sin sentido en z-score). **Solución**: operar sobre (B,H,C,Q) con broadcasting:
```python
mean = self.rev_in.mean.squeeze(1)          # (B,C)
std = self.rev_in.std.squeeze(1)
if self.rev_in.affine:
    w = self.rev_in.weight.unsqueeze(-1)    # (C,1)  ← clave: ejes para C, no Q
    b = self.rev_in.bias.unsqueeze(-1)
    out = (out - b) / (w + self.rev_in.eps**2)
out = out * std.unsqueeze(1).unsqueeze(-1) + mean.unsqueeze(1).unsqueeze(-1)
```
**Lección**: la salida del modelo está en **z-score GLOBAL** (los datos entran z-scoreados con stats de train, RevIN solo normaliza por ventana internamente). Para unidades reales: `pred_real = pred_z * std_global[target] + mean_global[target]`. La evaluación en z-score × target_scale = unidades reales (correcto en train.py).

**Si una IA retoma esto**: el checkpoint `patchtst_best.pt` fue entrenado con el código CORREGIDO. No re-entrenar con la versión vieja.

### 6.4 Entrenamiento (`train.py`)
- Ventanas deslizantes: 36.242 train / 7.308 val / 7.309 test.
- Optimizador AdamW (lr 1e-4, weight_decay 1e-4) + OneCycleLR (max_lr=10×, pct_start 0.2) + grad clip 1.0.
- **Mixed precision AMP** (torch.amp.autocast + GradScaler) — ~2× más rápido en GPU.
- Checkpoint del mejor val_pb; métricas en test en unidades reales (MAE, RMSE, pinball).
- **Velocidad**: ~100-150 s/época en RTX 4050 (con AMP). CPU era ~15-20 min/época (inviable).

### 6.5 Resultados obtenidos (test, horizonte 72h, Pasto)

| Métrica | 10 épocas | 20 épocas |
|---|---|---|
| GHI MAE | 78.86 W/m² | **78.75 W/m²** |
| GHI RMSE | 115.4 | **111.6** |
| Temp MAE | 1.027 °C | **1.008 °C** |
| Pinball | 0.1125 | **0.1102** |

**Conclusión del experimento 10→20 épocas**: mejora marginal (~2%). La curva de val_pb oscila sin tendencia clara a partir de la época ~14. **Las 100 épocas del config actual NO valen la pena** (1-3% extra, riesgo de overfitting, 3h GPU). Mejores palancas: reducir contexto (512→336h), d_model 128→256, o early stopping (paciencia 8). Aun así, `train_overnight.bat` queda listo por si se quiere el run largo.

### 6.6 Validación operativa (la que más vale para la tesis)
`validate_today.py` simula "correr el sistema ayer": emite forecast con contexto que termina 24h antes del último dato y compara con las observaciones reales (descargadas frescas de la API).

Resultado del 23-jul-2026 → 24h de horizonte:

| Variable | MAE | RMSE | Sesgo | Cobertura P10-P90 |
|---|---|---|---|---|
| GHI | 77.1 W/m² | 106.7 | **−31.3 (subestima)** | 67% (ideal ~80%) |
| Temp | 0.91 °C | 1.08 | −0.24 | 67% |

**Hallazgos de investigación (material de tesis):**
1. **Sesgo negativo en GHI**: el modelo subestima en días despejados → post-procesamiento tipo MOS (Model Output Statistics) o corrección de sesgo calibrada.
2. **Sobreconfianza de la banda**: cobertura 67% < 80% nominal → calibrar cuantiles (p.ej. ensanchado isotónico/conformal). La calibración probabilística es un capítulo por sí mismo.
3. El MAE en vivo (77.1) ≈ MAE de test (78.9) → **sin degradación train-serve**, el modelo generaliza a datos de 2026 que no vio.

---

## 7. MODELOS DINÁMICOS

### 7.1 PV (`src/dynamic_models/pv.py`) — VALIDADO
Cadena física completa con pvlib:
1. Posición solar (pvlib `get_solarposition`) → 2. Irradiancia en plano POA (`get_total_irradiance`, tilt=2°, azimut=180°) → 3. Temp de celda (**sapm_cell** con a=−3.56, b=−0.075, deltaT=3.0 — NO usar `fuentes()` que pide `noct_installed`) → 4. Potencia DC (`pvwatts_dc`, gamma=−0.38%/°C) → 5. AC (η_inv=0.96, pérdidas 14%).

**⚠️ Pitfall de timezone (corregido)**: los timestamps de Open-Meteo son hora local *naive*; pvlib debe localizarlos a la TZ del sitio o el pico solar se desfasa a las 16h en vez del mediodía. Fix: `times = times.tz_localize(self.timezone)` si `times.tz is None`.

Resultados con 50 kWp en Pasto: mejor día ~296 kWh (dic), pico 39.4 kW al mediodía, **factor de capacidad anual ~12%** (realista para la nubosidad).

### 7.2 Eólica (`src/dynamic_models/wind.py`) — VALIDADO
- Perfil logarítmico de 100m→hub: `v_hub = v_ref · ln(z_hub/z0)/ln(z_ref/z0)`, z0=0.1.
- Corrección por densidad del aire (presión/temp) escalando viento por ∛(ρ/1.225).
- Curva genérica IEC III normalizada (cut-in 3, nominal 11, **cut-out 25 m/s**).
- **Pitfall de dataclass**: array numpy por defecto requiere `field(default_factory=lambda: ...)`, NO `field(default=...)`.
- Para Guajira (100 kW, hub 50m): a 15 m/s@100m → 100 kW nominal; cut-out correcto.

### 7.3 BESS (`src/dynamic_models/bess.py`) — VALIDADO
- Simulación horaria de SoC con eficiencias (carga 0.95 / descarga 0.95) y límites (P=50 kW, SoC 10-95%, 200 kWh).
- `simulate(power_kw)`: positivo=carga, negativo=descarga. Respeta restricciones (min 10.0%, max 95.0% verificado) y reporta `p_unmet_kw` (potencia no atendida).
- Test: carga 60 kW (9-15h) / descarga 30 kW → SoC clava en los límites, unmet = 1103 kWh (batería insuficiente para ese perfil).

### 7.4 Carga (placeholder en API)
Perfil sintético residencial: base = annual_kwh/8760 × forma con picos a las 7h y 19h (gaussianas). **Pendiente**: reemplazar por mediciones reales cuando existan sensores.

---

## 8. API FASTAPI (`src/api/main.py`) — EN FUNCIONAMIENTO

Servidor: `uvicorn src.api.main:app --port 8000` (corriendo en background).

Endpoints implementados y probados:
| Endpoint | Descripción | Estado |
|---|---|---|
| `GET /health` | estado del servicio | ✅ |
| `GET /sites` | lista microrredes registradas + activos | ✅ |
| `GET /sites/{id}` | YAML completo de la microrred | ✅ |
| `POST /sites/{id}/simulate` | simula generación (PV/viento) + carga + BESS sobre ventana del test | ✅ (probado, respuesta JSON con series + summary) |
| `POST /sites/{id}/forecast` | forecast climático 72h P10/P50/P90 con checkpoint | ⚠️ implementado, requiere modelo entrenado en `results/<site>/` |

Ejemplo request simulate:
```bash
curl -X POST localhost:8000/sites/pasto_narino/simulate \
  -H "Content-Type: application/json" \
  -d '{"start":"2025-10-01","hours":72}'
```
Respuesta: `summary` (generation_kwh, load_kwh, grid_import/export_kwh, bess_final_soc_pct) + `timeseries` (timestamps + pv_ac_kw, wind_ac_kw, load_kw, bess_soc_pct, bess_power_kw, grid_kw).

**Pitfall API**: el nombre del archivo YAML DEBE coincidir con `site.id` (la API busca `config/sites/<site_id>.yaml`).

---

## 9. PRÓXIMOS PASOS (pendientes, priorizados)

1. **Endpoint `/forecast/power`** (alto valor): forecast climático → PVPlant.ac_power() → **kWh esperados por hora + banda P10-P90** (energía garantizada vs optimista). Lo que consume la app Node.
2. **Baselines para la tabla de tesis**: persistencia (~180 W/m² MAE esperado), climatología, ARIMA, y foundation models (Chronos zero-shot) — comparación honesta contra PatchTST.
3. **Corrección de sesgo / calibración de cuantiles**: abordar los hallazgos de 6.6 (MOS, conformal/isotónico). Capítulo de tesis.
4. **Integración Node**: acordar el contrato JSON exacto con el backend del usuario (¿endpoint directo o guardado en BD/archivo que Node lee?).
5. **Hiperparámetros** (si se quiere mejorar el modelo): contexto 336h, d_model 256, early stopping paciencia 8.
6. **NWP como covariable** (Módulo 1 mejorado): usar el forecast de Open-Meteo como *feature* de entrada para que PatchTST aprenda el sesgo local (MOS) — el enfoque híbrido recomendado por el autor original.
7. **Capa LLM** (idea del autor): ajuste del forecast con alertas oficiales → JSON validado. Requiere whitelist de fuentes.
8. **Control BESS/MPC** (Módulo 3): despacho óptimo con casadi/do-mpc usando los cuantiles del forecast.

---

## 10. COMANDOS ÚTILES (git-bash en C:\Users\2D\tesis-microrred)

```bash
source .venv/Scripts/activate

# Pipeline de datos
python -m src.data.download_openmeteo --site config/sites/pasto_narino.yaml
python -m src.data.build_dataset --site config/sites/pasto_narino.yaml

# Entrenamiento (GPU) — 10/20/100 épocas
python -m src.models.train --site config/sites/pasto_narino.yaml --epochs 20

# Evaluación y gráficas
python -m src.models.plot_forecast --site config/sites/pasto_narino.yaml

# Operación: forecast en vivo (datos recientes de Open-Meteo)
python -m src.models.predict_live --site config/sites/pasto_narino.yaml --days 22

# Validación: forecast "de ayer" vs observado de hoy
python -m src.models.validate_today --site config/sites/pasto_narino.yaml --compare-hours 24

# API
uvicorn src.api.main:app --port 8000 --reload

# Entrenamiento nocturno completo (Windows .bat — doble clic)
# train_overnight.bat  → 100 épocas + gráficas, log en results/train_100ep.log
```

---

## 11. REFERENCIAS (para marco teórico)

- **PatchTST**: Nie et al., "A Time Series is Worth 64 Words", ICLR 2023 (arXiv:2211.14730).
- **TFT** (baseline recomendado): Lim et al., "Temporal Fusion Transformers", IJF 2021 (arXiv:1912.09363).
- **RevIN**: Kim et al., "Reversible Instance Normalization", ICLR 2022 (arXiv:2205.05695).
- **Chronos** (baseline zero-shot): Ansari et al., Amazon, 2024 (arXiv:2403.07815).
- **TimesFM**: Google, 2024 (arXiv:2310.10688).
- **Time-LLM** (contexto para capa LLM): Jin et al., ICLR 2024 (arXiv:2310.01728).
- **NWP post-processing / MOS**: literatura de corrección de sesgo y calibración de ensemble weather forecasts (Gneiting, Raftery, 2005, JASA — calibración probabilística).
- pvlib: Holmgren et al., JOSS 2018.

---

## 12. ESTADO DE PROCESOS AL EMITIR ESTE DOCUMENTO

- ✅ Entrenamiento 20 épocas COMPLETO (checkpoint corregido en `results/pasto_narino/patchtst_best.pt`).
- ✅ Gráficas de evaluación en `results/pasto_narino/plots/` (forecast_vs_real, scatter, error_by_horizon, live_forecast, validation_today).
- 🟢 API FastAPI corriendo en puerto 8000 (proc de uvicorn en background de Hermes).
- ❌ No hay procesos de entrenamiento activos.

**Nota para la IA que continúe**: el `metrics.json` y las gráficas de `results/` contienen los números oficiales. Re-verificar siempre la coherencia de unidades (z-score global vs reales) antes de interpretar cualquier salida del modelo.
