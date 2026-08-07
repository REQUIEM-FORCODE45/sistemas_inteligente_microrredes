# HANDOFF TÉCNICO #3 — Validación de Modelos Dinámicos con Datos Sintéticos y Metodología de Ajuste (Calibración)

> **Propósito**: documentación exhaustiva y replicable de la metodología de validación de los modelos dinámicos (PV) usando datos sintéticos, y del esquema de ajuste en dos niveles (calibración paramétrica + corrección de residuos con ML). Este documento es el material de base para el capítulo metodológico de la tesis y para que cualquier investigador/IA pueda replicar los resultados exactos.
>
> **Fecha**: 24 de julio de 2026 · **Proyecto**: `C:\Users\2D\tesis-microrred`
> **Scripts involucrados**: `src/dynamic_models/calibrate.py`, `src/dynamic_models/plot_calibration.py`, `src/dynamic_models/plot_sinteticos.py`, `src/dynamic_models/experiment_realista.py`
> **Gráficas**: `results/pasto_narino/plots/calibracion/*.png`

---

## 1. OBJETIVO Y FILOSOFÍA DE LA VALIDACIÓN SINTÉTICA

### 1.1 El problema
El objetivo final del sistema es **replicar los datos de la microrred lo mejor posible**: dado el clima (medido o pronosticado), producir la potencia de los activos (PV, eólica) con el menor error posible. El flujo es:

```
Clima (ERA5/Open-Meteo) → Modelo dinámico físico (pvlib) → Potencia predicha
```

El modelo físico usa **parámetros de catálogo** (pérdidas 14%, eficiencia inversor 96%, coeficiente de temperatura −0.38 %/°C). Una planta real **no cumple los parámetros de catálogo**: tiene suciedad, sombras, degradación, un inversor real con otra eficiencia, etc. Por lo tanto, la potencia predicha con parámetros nominales está **sesgada** respecto a la real.

### 1.2 El dilema
Para ajustar (calibrar) el modelo necesitamos datos reales de la microrred — que **aún no existen** (los sensores reales son trabajo futuro del proyecto). ¿Cómo validamos que nuestra metodología de ajuste es correcta sin datos reales?

### 1.3 La solución: datos sintéticos con "clave de respuestas"
Los datos sintéticos resuelven el dilema con un truco de validación estándar en ingeniería (equivalente a un *examen con clave de respuestas*):

1. **Nosotros fijamos los parámetros "reales"** de una planta ficticia (que nadie conoce).
2. Generamos las **mediciones** que esa planta ficticia produciría (clima real + parámetros ocultos + ruido de sensor).
3. Le damos al algoritmo de calibración **solo las mediciones** (como en producción).
4. Si el algoritmo **recupera los parámetros reales** que nosotros fijamos → la metodología es correcta → cuando lleguen datos reales, confiaremos en ella.

**Componentes de los datos sintéticos**:
| Componente | Origen | ¿Real o ficticio? |
|---|---|---|
| Clima (GHI, DNI, DHI, temp) | ERA5 de Pasto (`data/processed/pasto_narino/test.parquet`) | **REAL** (nunca se inventa el clima) |
| Parámetros de la planta | Fijados por el experimentador | Ficticio (la "verdad" oculta) |
| Ruido de medición | Ruido gaussiano | Ficticio (simula sensores imperfectos) |
| Efectos no-físicos (experimento 2) | Suciedad progresiva + sombra matutina | Ficticio (simula la realidad que la física no modela) |

> ⚠️ **Nota de honestidad científica**: los datos sintéticos validan la **metodología de identificación**, no el comportamiento de una planta específica. La planta sintética usa el mismo modelo físico que el nominal (solo cambian parámetros), así que no incluye efectos completamente desconocidos. Esa limitación se declara explícitamente en la tesis y se resuelve con datos reales en trabajo futuro.

---

## 2. EL MODELO FÍSICO BASE (PVPlant) — parámetros y cadena de cálculo

Modelo en `src/dynamic_models/pv.py`, basado en **pvlib**. Parámetros del caso Pasto (config `config/sites/pasto_narino.yaml`):

| Parámetro | Valor nominal (catálogo) | Notas |
|---|---|---|
| `capacity_kwp` | 50.0 kWp | capacidad pico |
| `tilt_deg` | 2° | casi plano (latitud tropical) |
| `azimuth_deg` | 180° | sur |
| `timezone` | America/Bogota | **crítico**: localizar timestamps naive |
| `losses_pct` | 14.0 % | pérdidas de sistema (calibrable) |
| `inverter_eta` | 0.96 | eficiencia inversor (calibrable) |
| `temp_coeff_pct_per_c` | −0.38 %/°C | coeficiente de temperatura (calibrable) |

Cadena de cálculo (función `ac_power(weather)`):
1. Posición solar: `pvlib.location.Location.get_solarposition(times)` (timestamps localizados a la TZ del sitio).
2. Irradiancia en el plano del arreglo (POA): `pvlib.irradiance.get_total_irradiance(surface_tilt, surface_azimuth, zenith, azimuth, dni, ghi, dhi)`.
3. Temperatura de celda: `pvsystem.temperature.sapm_cell(poa, temp_air, wind_speed=1.0, a=−3.56, b=−0.075, deltaT=3.0)`.
4. Potencia DC: `pvsystem.pvwatts_dc(poa, temp_cell, pdc0=50_000 W, gamma_pdc=−0.38/100)`.
5. Potencia AC: `p_ac = p_dc × inverter_eta × (1 − losses_pct/100)`, clip ≥ 0.

**Pitfall documentado**: `pvsystem.temperature.fuentes()` exige el argumento `noct_installed` — usar `sapm_cell` con los coeficientes indicados. Los timestamps naive deben localizarse a la TZ del sitio o el pico solar se desfasa.

---

## 3. METODOLOGÍA DE AJUSTE EN DOS NIVELES (grey-box / hybrid)

El esquema de ajuste tiene dos niveles que se aplican **en cascada**:

```
P_final(t) = P_físico(θ_calibrado, clima(t)) + residuo_ML(clima(t), hora(t), t)
```

### Nivel 1 — Calibración paramétrica (identificación física)

Dos variantes, de menor a mayor sofisticación:

#### 1a. Factor de derating K (mínimos cuadrados sin intercepto)
Estima un único factor multiplicativo que corrige el sesgo promedio:

```
K = Σ(P_físico · P_real) / Σ(P_físico²)     (solo horas con P_físico > 1% de la capacidad)
P_ajustada = K · P_físico
```

Código (`estimate_derating`):
```python
p_fis = plant.ac_power(weather).values
mask = p_fis > 0.01 * plant.capacity_kwp          # filtra noche
p_f, p_r = p_fis[mask], p_real_kw.values[mask]
k = float(np.dot(p_f, p_r) / np.dot(p_f, p_f))
```

#### 1b. Calibración paramétrica completa (mínimos cuadrados no lineales)
Ajusta simultáneamente los 3 parámetros físicos calibrables: `losses_pct`, `inverter_eta`, `gamma_pdc`. Minimiza el RMSE entre la potencia física con esos parámetros y la medición real, solo en horas con sol (GHI > 50 W/m²):

```python
from scipy.optimize import least_squares
bounds = {
    "losses_pct": (0.0, 30.0),      # %
    "eta_inv":    (0.85, 1.0),      # 0-1
    "gamma_pdc":  (-0.6, -0.1),     # %/°C
}
x0 = [plant.losses_pct, 0.96, plant.temp_coeff_pct_per_c]
sol = least_squares(resid, x0, bounds=(lo, hi), max_nfev=200)
# resid(p) = P_físico(parámetros p, clima) - P_real  (en horas de sol)
```

### Nivel 2 — Corrección de residuos (residual learning)

Un `GradientBoostingRegressor` (scikit-learn) aprende el **residuo** `r(t) = P_real(t) − P_físico_calibrado(t)` a partir de features observables:

| Feature | Qué captura |
|---|---|
| `hour_sin`, `hour_cos` | patrones horarios (sombra matutina, perfil del día) |
| `doy_sin`, `doy_cos` | estacionalidad anual |
| `elapsed_days` | degradación/suciedad **progresiva** en el tiempo |
| `ghi` | dependencia de la intensidad solar |
| `temp` | dependencia térmica |

Hiperparámetros del GBR (fijos para reproducibilidad):
```python
GradientBoostingRegressor(n_estimators=200, learning_rate=0.05,
                          max_depth=3, random_state=42)
```

**Regla de oro (lección empírica del experimento 2)**: el residuo se entrena contra la **misma base** que se usará en predicción (el modelo ya calibrado), nunca contra el modelo nominal. Si se entrena contra el nominal y se aplica sobre el calibrado, se suman errores incompatibles (RMSE 1.68 en vez de 0.44 en el experimento realista).

---

## 4. EXPERIMENTO 1 — Planta limpia (solo parámetros distintos + ruido)

### 4.1 Generación (replicable, semilla fija)

```python
# Semilla 7, ruido σ = 0.5 kW
rng = np.random.default_rng(7)

real_params = dict(losses_pct=21.0, eta_inv=0.93, gamma_pdc=-0.42)
real_plant = PVPlant(..., losses_pct=21.0, eta_inv=0.93, gamma_pdc=-0.42)

p_truth = real_plant.ac_power(weather).values          # potencia "verdadera"
p_meas  = np.clip(p_truth + rng.normal(0, 0.5, len(p_truth)), 0, None)  # medición
```

- **Datos**: `test.parquet` de Pasto (ERA5). Train = filas 0:4000, Validación = filas 4000:5500 (más de 2 meses de val).
- **Verdad oculta**: losses 21% (vs 14% nominal), η_inv 0.93 (vs 0.96), γ −0.42 (vs −0.38).
- **Ruido**: gaussiano σ=0.5 kW (≈1% de la capacidad pico).

### 4.2 Resultados (validación, RMSE en kW)

| Etapa | RMSE (kW) | Observación |
|---|---|---|
| 1. Nominal (catálogo) | **1.73** | punto de partida, sesgo sistemático |
| 2. Solo derating (×K=0.885) | **0.04** | −98% con una multiplicación |
| 3. Parámetros calibrados | **0.01** | −99.4%, el mejor |
| 4. Híbrido (+residual ML) | **0.19** | peor que 3 (ver 4.4) |

**Parámetros recuperados**: losses=20.13 (real 21.0), η=0.918 (real 0.93), γ=−0.409 (real −0.42). **La identificación funciona.**

### 4.3 Interpretación
- La calibración paramétrica es **casi perfecta** cuando la única diferencia entre el modelo y la "realidad" son los valores de los parámetros que el modelo ya sabe representar.
- El factor K captura el 98% del error: es la primera y más barata corrección.

### 4.4 Por qué el híbrido NO ganó aquí (lección clave)
Después de calibrar, el residuo es **ruido puro** (sin patrón): la gráfica `residuos.png` muestra residuos dispersos alrededor de cero sin estructura. Un ML no puede aprender ruido — por eso su RMSE (0.19) es peor que el del calibrado (0.01), aunque aún muy inferior al nominal. **Conclusión: el residual ML solo aporta cuando existen patrones sistemáticos que la física no modela** — que es precisamente lo que se prueba en el Experimento 2.

---

## 5. EXPERIMENTO 2 — Planta realista (efectos no modelados por la física)

### 5.1 Efectos inyectados (replicable)

Tres efectos, con **semilla 42** para el ruido:

```python
rng = np.random.default_rng(42)          # semilla del ruido

# Efecto 1 — SUCIEDAD PROGRESIVA (soiling): eficiencia cae 100% → 85% en 150 días
t_days = np.arange(n) / 24.0             # n = horas
soiling = np.clip(1.0 - 0.15 * (t_days / 150.0), 0.85, 1.0)

# Efecto 2 — SOMBRA MATUTINA: montaña al este bloquea 6-10h (factor 0.6)
hour = pd.to_datetime(weather.index).hour.values
shade = np.where((hour >= 6) & (hour < 10), 0.6, 1.0)

# Efecto 3 — RUIDO DE MEDICIÓN
p_meas = np.clip(p_truth * soiling * shade + rng.normal(0, 0.5, n), 0, None)
```

Detalle físico de los efectos:
- **Suciedad**: los paneles acumulan polvo/partículas → la potencia efectiva decae en el tiempo. En Pasto (zona volcánica/polvo andino) es un efecto real documentado. Se modeló lineal desde 1.0 hasta 0.85 a los 150 días.
- **Sombra matutina**: obstáculo al este (montaña, edificación) → la irradiancia efectiva se reduce un 40% entre las 6:00 y las 10:00 locales. Es un patrón **determinístico por hora**, repetido todos los días.
- **Ruido**: σ=0.5 kW, independiente por hora.

### 5.2 Resultados (validación, RMSE en kW)

| Etapa | RMSE (kW) | Observación |
|---|---|---|
| 1. Nominal (catálogo) | **3.13** | los efectos suman error |
| 2. Solo derating (×K=0.776) | **1.77** | el K promedio no basta |
| 3. Parámetros calibrados | **1.66** | la física se queda corta |
| 4. **Híbrido (+residual ML)** | **0.44** | **−86% total; gana claramente** |

**Parámetros calibrados (contaminados)**: losses=28.05, η=0.863, γ=−0.10. Nótese cómo la calibración intenta absorber suciedad+sombra como "pérdidas" (las infla de 21→28%) y distorsiona γ (−0.42→−0.10). Es la evidencia de que **el efecto no-físico no puede representarse con parámetros constantes**.

### 5.3 Interpretación (la historia completa)
1. La calibración paramétrica sigue siendo valiosa (3.13→1.66, −47%) porque corrige el sesgo promedio.
2. Pero **no puede** capturar efectos que varían en el tiempo (suciedad) o por hora (sombra), porque sus parámetros son constantes.
3. El residual ML, con features `elapsed_days` (suciedad) y `hour_sin/cos` (sombra), **aprende exactamente esos patrones** → 1.66→0.44 (−73% adicional sobre el calibrado).
4. La **importancia de features** del GBR (gráfica `realista_importancia.png`) confirma que aprendió los efectos inyectados: hora (sombra) y días transcurridos (suciedad) dominan.

---

## 6. COMPARACIÓN CONSOLIDADA Y LECCIONES DE DISEÑO

| Escenario | Nominal | Derating | Calibrado | Híbrido | Ganador |
|---|---|---|---|---|---|
| Planta limpia (Exp. 1) | 1.73 | 0.04 | **0.01** | 0.19 | Calibrado |
| Planta realista (Exp. 2) | 3.13 | 1.77 | 1.66 | **0.44** | Híbrido |

**Lecciones (para citar en la tesis):**
1. **La calibración paramétrica es SIEMPRE el primer paso**: barata (segundos), sin hiperparámetros, y captura el grueso del sesgo (98% en el caso limpio, 47% en el realista).
2. **El residual ML es el segundo paso y brilla cuando hay efectos no-físicos** (suciedad, sombra, degradación, comportamiento real del inversor). En plantas limpias no aporta — y eso es información, no fracaso: indica que la física ya explica todo lo sistemático.
3. **Regla de consistencia**: el residuo debe entrenarse contra la base calibrada que se usará en producción (error típico a evitar).
4. **Diagnóstico con residuos**: graficar el residuo post-calibración vs hora y vs tiempo revela QUÉ efectos no modelados existen (sombra → patrón horario; suciedad → deriva temporal). Es una herramienta de diagnóstico poderosa para el capítulo de "detección de parámetros".

---

## 7. GRÁFICAS GENERADAS Y SU INTERPRETACIÓN

Todas en `results/pasto_narino/plots/calibracion/`:

| Archivo | Contenido | Interpretación para la tesis |
|---|---|---|
| `como_se_generan_sinteticos.png` | 4 paneles: clima → planta oculta → medición con ruido → comparación con nominal | Explica la filosofía del experimento sintético |
| `serie_temporal.png` (Exp. 1) | 4 días: real vs nominal vs derating vs calibrado | El calibrado replica la real casi perfectamente |
| `scatter_derating.png` (Exp. 1) | P_pred vs P_real + recta K | El sesgo sistemático y su corrección lineal |
| `parametros.png` (Exp. 1) | barras: params reales vs recuperados | La identificación recupera la verdad |
| `rmse_etapas.png` (Exp. 1) | RMSE por etapa | 1.73 → 0.01 (−99%) |
| `residuos.png` (Exp. 1) | residuo vs GHI antes/después | Tras calibrar solo queda ruido → por qué el ML no aporta |
| `realista_serie.png` (Exp. 2) | 6 días con sombra marcada (franjas grises) | El híbrido sigue la sombra, el calibrado no |
| `realista_rmse.png` (Exp. 2) | RMSE por etapa | El híbrido gana (0.44) |
| `realista_residuos.png` (Exp. 2) | residuo calibrado vs hora (boxplot) y vs tiempo | Los patrones que la física no ve (sombra 6-10h, deriva) |
| `realista_importancia.png` (Exp. 2) | importancia de features del GBR | El ML aprendió exactamente los efectos inyectados |

---

## 8. REPLICACIÓN PASO A PASO (guía para la tesis)

Requisitos: venv activado (`source .venv/Scripts/activate`), datos procesados de Pasto existentes (`data/processed/pasto_narino/`).

```bash
cd C:\Users\2D\tesis-microrred

# 1. Sanity check + resultados numéricos del Experimento 1 (tabla RMSE)
python -m src.dynamic_models.calibrate

# 2. Gráficas del Experimento 1 (5 PNG)
python -m src.dynamic_models.plot_calibration

# 3. Gráfica pedagógica de cómo se generan los sintéticos (4 paneles)
python -m src.dynamic_models.plot_sinteticos

# 4. Experimento 2 completo (tabla RMSE + 4 gráficas)
python -m src.dynamic_models.experiment_realista
```

Resultados esperados (reproducibles por semillas fijas: ruido Exp.1 = seed 7, Exp.2 = seed 42):
- Exp. 1: RMSE nominal 1.73 / derating 0.04 / calibrado 0.01 / híbrido 0.19 kW
- Exp. 2: RMSE nominal 3.13 / derating 1.77 / calibrado 1.66 / híbrido 0.44 kW

**Nota de trazabilidad**: los números pueden variar en ±0.01 kW si cambia la versión de pvlib/scipy/sklearn (floating point). Guardar `pip freeze > requirements.txt` al momento de los experimentos finales de la tesis.

---

## 9. CICLO DE VIDA DEL AJUSTE EN OPERACIÓN (¿se calibra una sola vez?)

**Respuesta corta: NO — hay dos relojes distintos.**

### Nivel 1 (parámetros físicos): casi una vez
Los parámetros calibrados (`losses_pct`, `inverter_eta`, `gamma_pdc`) son propiedades físicas **casi constantes** de la instalación (el inversor no cambia de eficiencia cada semana). Por tanto:
- **Calibración inicial**: una vez, con las primeras 2-4 semanas de datos del sensor.
- **Recalibración lenta**: cada 3-6 meses, o cuando el sistema lo pida (detección de drift). Sirve además para detectar degradación estructural (módulos envejeciendo) → información valiosa del pilar 2.

### Nivel 2 (residual ML): re-entrenamiento periódico SIEMPRE
Los efectos que aprende el ML **cambian con el tiempo**, por lo que requiere re-entrenamiento:

| Efecto | Comportamiento en el tiempo | ¿Qué pasa si no re-entrenas? |
|---|---|---|
| **Suciedad** | Se acumula por semanas... y **la lluvia la limpia** (¡salta de golpe!) | El ML sigue restando suciedad que ya no existe |
| **Sombra** | Cambia con la estación (ángulo del sol) | En Pasto es leve (ecuador), en otras latitudes importa |
| **Degradación** | Anual, lenta | Error creciente e invisible |

### Ciclo de vida completo en producción

```
┌─────────────────────────────────────────────────────────────┐
│  CICLO DE VIDA DEL AJUSTE EN PRODUCCIÓN                     │
│                                                             │
│  1. INSTALACIÓN: se encienden los sensores                  │
│     └─ recopilar 2-4 semanas de datos (clima + P real)      │
│                                                             │
│  2. CALIBRACIÓN INICIAL: least_squares (Nivel 1)            │
│     + entrenar residual ML con esos datos (Nivel 2)         │
│     └─ a partir de aquí el sistema predice "calibrado"      │
│                                                             │
│  3. OPERACIÓN DIARIA: forecast → PV calibrado → kWh         │
│     └─ cada día llegan mediciones nuevas del sensor         │
│                                                             │
│  4. RE-ENTRENAMIENTO PERIÓDICO (cron semanal/mensual):      │
│     el residual ML se re-entrena con la ventana deslizante  │
│     de los últimos 3-6 meses (captura lluvias, estaciones)  │
│                                                             │
│  5. DETECCIÓN DE DRIFT (conexión con el pilar 2):           │
│     si el error del modelo crece por encima de un umbral,   │
│     el sistema dispara recalibración automática             │
│     → ¿suciedad extrema? ¿falló un sensor? ¿degradación?    │
└─────────────────────────────────────────────────────────────┘
```

### Mejora de diseño: suciedad con ciclo de lavado natural
La suciedad se acumula → llueve → se limpia → se acumula otra vez. Un ML con solo `elapsed_days` asume que la suciedad crece linealmente y **no captura el salto de la lluvia**. Mejora elegante para la tesis: usar **precipitación acumulada** como feature ("lluvia desde la última limpieza natural") → el ML aprende que la lluvia reinicia la suciedad. Demuestra comprensión de la física del problema.

### La conexión que cierra la tesis
El paso 5 une los tres pilares: **la detección de anomalías (Transformer sobre sensores) es el gatillo de la recalibración** — el sistema no recalibra "porque sí" cada mes, recalibra cuando el modelo detecta que ya no replica bien los datos. Predicción → detección → ajuste: un solo ciclo de vida.

---

## 10. LIMITACIONES Y ADVERTENCIAS (declaración honesta para la tesis)

1. **La planta sintética usa el mismo modelo físico** que el nominal (solo cambian parámetros). Los efectos inyectados (suciedad, sombra) se aplican como multiplicadores, no como física nueva. Por eso el experimento valida la **metodología de identificación**, no la precisión absoluta contra una planta real.
2. **Los datos reales pueden violar supuestos**: el ruido real de sensores no es gaussiano puro (puede tener outliers, saturación, deriva del propio sensor); los efectos pueden interactuar (sombra + suciedad no son multiplicativos puros).
3. **El GBR es una elección**; con datos reales se debe re-validar contra alternativas (regresión lineal por tramos, LightGBM, redes) con validación temporal estricta (walk-forward).
4. **Riesgo de sobreajuste temporal del ML**: `elapsed_days` puede confundir "suciedad" con "cambio estacional" si el periodo de calibración es corto. En la tesis: usar al menos 6-12 meses de datos para el residual ML.
5. **Identificabilidad**: `losses_pct`, `inverter_eta` y `gamma_pdc` son parcialmente colineales a bajas irradiancias (el modelo tiende a confundir pérdidas con eficiencia). Los bounds de la Tabla 2.1 ayudan; reportar también la matriz de correlación de parámetros si se usa la versión bayesiana (trabajo futuro: `scipy.optimize.curve_fit` con covarianza).

---

## 11. CÓMO CONTARLO EN LA TESIS (estructura sugerida del capítulo)

1. **Planteamiento**: el modelo físico de catálogo no replica la planta real (sesgo sistemático); se necesita identificación.
2. **Metodología**: grey-box de dos niveles (fórmulas de K, least_squares, y GBR de residuos) + validación con datos sintéticos (filosofía de la clave de respuestas).
3. **Resultados**: tabla comparativa Exp.1/Exp.2, gráficas de residuos como diagnóstico.
4. **Discusión**: cuándo el ML aporta (efectos no-físicos), la regla de consistencia del residuo, la contaminación de parámetros.
5. **Trabajo futuro**: validación con datos reales de sensores; extensión del esquema a eólica y BESS (mismos dos niveles); versión bayesiana con incertidumbre de parámetros.

---

## 12. PENDIENTES RELACIONADOS

- Conectar `forecast (PatchTST) → PVPlant calibrado → /forecast/power` en la API (kWh esperados con banda P10-P90).
- Aplicar el mismo esquema de calibración a `wind.py` (curva real de la turbina) y `bess.py` (eficiencias reales de carga/descarga).
- Cuando existan datos reales: reemplazar el ruido sintético por mediciones, recalibrar y medir la degradación real (skill de mantenimiento: el flujo ya está listo).
