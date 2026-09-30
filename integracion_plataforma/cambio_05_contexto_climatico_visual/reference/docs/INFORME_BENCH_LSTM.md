# Benchmark de arquitecturas: LSTM vs Transformers

**Pregunta**: ¿un LSTM simple le gana en velocidad a los transformers que usamos, y a qué costo
en exactitud?
**Fecha**: 2026-09-23 · **Sitio**: Pasto (1.2136, −77.2811) · **Datos**: `data/processed/pasto_narino/`
**Protocolo**: mismas 33 features, contexto 512 → horizonte 72, misma cabeza cuantílica
(P10/P50/P90), mismo RevIN, mismo decode con `specs`, mismo `test.parquet`. Batch 256 + AMP fp16.

---

## 1. Exactitud — comparación JUSTA de 3 vías

Evaluada con **un solo harness** (`scripts/eval_itransformer_test.py`) que reusa el pipeline
literal de `src/models/train.py` para los tres modelos. Unidades reales.

| variable | **iTransformer** | PatchTST | LSTM | peor de los 3 |
|---|---|---|---|---|
| shortwave_radiation (GHI) | **50.533** 🥇 | 54.006 | 57.602 | LSTM (+14.0%) |
| direct_normal_irradiance | **87.084** | 90.569 | 96.760 | LSTM |
| diffuse_radiation | **20.812** | 21.802 | 23.863 | LSTM |
| temperature_2m | **0.897** | 0.925 | 1.074 | LSTM |
| relative_humidity_2m | **6.679** | 6.838 | 8.585 | LSTM |
| cloud_cover | 14.095 | **14.077** | 15.267 | LSTM |
| wind_speed_100m | **0.576** | 0.579 | 0.662 | LSTM |
| wind_speed_10m | **0.379** | 0.382 | 0.432 | LSTM |
| surface_pressure | **0.714** | 0.726 | 0.862 | LSTM |
| precipitation | 0.449 | 0.456 | **0.442** | LSTM (empata) |
| **pinball global** | **5.7067** 🥇 | 6.3344 | 6.4897 | LSTM |

**El iTransformer gana 9 de 10 variables y el objetivo global. El LSTM es el PEOR en 9 de 10**
(solo empata al frente en precipitación, y por 0.007).

### ⚠️ Corrección de un resultado previo (importante)

Una comparación anterior reportó "el LSTM gana a PatchTST en radiación (GHI 57.60 vs 62.02,
−7.1%)". **Ese resultado era un artefacto**: el 62.02 provenía de `results/pasto_narino/metrics.json`,
que está **desincronizado con el checkpoint que dice describir**.

Evidencia: `metrics.json` (2026-08-14) declara GHI 62.017, pero al evaluar **los dos** checkpoints
PatchTST presentes (`patchtst_best.pt` y `patchtst_best_kt20ep.pt`, ambos 2026-08-14 19:36) sobre
el `test.parquet` actual, ambos dan **exactamente 54.006 / pinball 6.3344**. Los datos
(`*.parquet`, `norm_stats.csv`) son del 2026-08-07, anteriores a ambos: los datos no cambiaron.

**Lección**: los `metrics*.json` sueltos no son fuente fiable; toda comparación debe
**re-evaluarse con un harness único** y **auto-validarse** contra una referencia conocida.
El harness del LSTM sí se auto-valida (reproduce `57.602 / 96.760 / … / 6.4897` bit a bit).

## 2. Velocidad de ENTRENAMIENTO (batch 256 + AMP, RTX 4050)

| modelo | params | s/lote | **s/época** | **100 épocas** | VRAM pico | J/muestra |
|---|---|---|---|---|---|---|
| **iTransformer** | 495,192 | 0.0115 | **1.6 s** 🥇 | **2.7 min** | **0.22 G** | **2,129 µJ** |
| LSTM | 626,354 | 0.0548 | 7.8 s | 13.0 min | 1.53 G | 8,986 µJ |
| PatchTST | 2,141,722 | 2.7004 | **383.5 s** 🔻 | **639 min (10.6 h)** | 9.09 G | 337,616 µJ |

36,242 ventanas → 142 lotes/época. Misma pérdida (pinball) para los tres → coste puro.

## 3. Velocidad de INFERENCIA (una ventana 512→72)

| modelo | GPU p50 | GPU p95 | thr/s (b32) | VRAM inf. | **CPU p50** | CPU p95 |
|---|---|---|---|---|---|---|
| **iTransformer** | **1.97 ms** 🥇 | 3.67 | **16,406** | **0.07 G** | **2.00 ms** 🥇 | 3.06 |
| PatchTST | 2.46 ms | 3.98 | 1,213 | 1.69 G | 26.03 ms | 28.64 |
| LSTM | 5.58 ms | 7.20 | 6,448 | 0.82 G | **38.18 ms** 🔻 | 40.03 |

La CPU es el escenario **operativo real** (la plataforma corre en una VM Linux, sin GPU):
ahí el LSTM es **19× más lento** que el iTransformer.

## 4. Conclusión

**El iTransformer domina las TRES dimensiones** (exactitud, latencia, coste de entrenamiento y
memoria). En el plano operativo (CPU) deja a **PatchTST y LSTM dominados en ambos ejes**: son
a la vez más lentos y menos exactos (ver `fig_bench_pareto_cpu.png`).

Respuesta directa a la pregunta original:

- ✅ **Sí, parcialmente**: el LSTM entrena 49× más rápido que **PatchTST**.
- ❌ **No** frente al modelo operativo (**iTransformer**): pierde **4.9×** entrenando, **2.8×**
  infiriendo en GPU y **19×** en CPU — y además es el **menos exacto** de los tres.

Interpretación: la ventaja no viene de "atención vs recurrencia" en abstracto, sino del **eje de
atención**. El iTransformer atiende sobre **33 variables**; PatchTST sobre 8,448 secuencias
(33 canales × 64 parches); el LSTM recorre **512 pasos secuenciales**. Atender sobre variables es
lo más barato **y** lo más exacto aquí → respalda la narrativa de la tesis y **descarta PatchTST
como modelo operativo** (paga channel-independence sin comprar exactitud).

## 4b. AUDITORÍA de la validación (¿hay algún error que la invalide?)

Tres verificaciones independientes, todas pasadas:

| # | Verificación | Resultado |
|---|---|---|
| 1 | **Testigo 1**: el harness re-evalúa el LSTM con `train.py` de hoy → debe coincidir bit a bit | `máx\|Δ\| = 0.00e+00` ✓ (valida loader + decode) |
| 2 | **Testigo 2**: PatchTST vs los valores **documentados** del "MODELO FINAL" del proyecto (fuente independiente) | máx\|Δ\| = 0.023 ✓ (54.006/54.0, 0.925/0.93, 0.579/0.58, 14.077/14.1, 0.714/0.71) |
| 3 | **Robustez a la normalización**: el iTransformer evaluado con el `norm_stats` del proyecto vs con **sus propias** stats | **Δ = 0.00%** (50.533 = 50.533) ✓ |

Consecuencias:

- El 62.017 de `metrics.json` es el **outlier** confirmado por dos fuentes (los dos checkpoints
  PatchTST presentes dan 54.006, y el valor documentado del proyecto es 54.0).
- La discrepancia de normalización del iTransformer **NO afecta al resultado** (verificación 3):
  el **RevIN interno** lo hace invariante a una transformación afín de la entrada y devuelve la
  salida en el espacio de la entrada → el decode con los `norm_stats` del proyecto es consistente.
  **Deja de ser una limitación.**
- La permutación de features está **assertada** (`sorted(perm_in) == range(33)`) y el orden de
  salida del iTransformer coincide con el del proyecto (`perm_out` = identidad).

## 5. Limitaciones declaradas

1. **GPU compartida**: al inicio el LSTM tardaba 15 s/época y con la GPU libre 9 s (mismo código).
   El benchmark definitivo se midió con la GPU libre.
2. **Energía de inferencia no fiable**: ventana de muestreo de potencia demasiado corta para los
   modelos rápidos. La de **entrenamiento** sí es fiable (ventana fija de 4 s).
3. **Normalización del iTransformer: RESUELTA** (ver §4b, verificación 3): su `stats` difiere
   ~0.5% del `norm_stats.csv`, pero al evaluarlo con **sus propias** stats el resultado es
   idéntico (Δ = 0.00%) → no afecta a la comparación. Su orden de features sí difiere → se
   reordena la entrada y se devuelve la salida al orden del proyecto (adapter, sin tocar pesos).
4. **Presupuesto de entrenamiento distinto por modelo**: cada uno se evalúa con su mejor
   checkpoint disponible (se pidió explícitamente NO re-entrenar los transformers). El bench de
   velocidad aísla el coste arquitectural (misma pérdida, mismo batch, mismos datos), pero la
   tabla de exactitud mezcla presupuestos: el LSTM con 100 épocas del YAML, el iTransformer y el
   PatchTST con sus corridas propias. Si se quisiera igualar, habría que re-entrenar los tres
   con el mismo presupuesto (no se hizo por decisión del usuario).
5. La comparación de entrenamiento mide **coste por época**, no convergencia.
6. El LSTM **sobreajustó** (train_pb 0.115 vs val 7.01; mejor checkpoint ~época 30).

## 5b. CÓMO SE RESOLVIERON las dos limitaciones

### Limitación 1 — presupuesto de entrenamiento: RESUELTA (con corrección del diagnóstico)

Leyendo las configs **guardadas dentro de cada checkpoint**:

| modelo | epochs | batch | lr | d_model | e_layers | dropout |
|---|---|---|---|---|---|---|
| PatchTST | 100 | 256 | 1e-4 | 128 | 3 | 0.2 |
| LSTM | 100 | 256 | 1e-4 | 128 | 3 | 0.2 |
| **iTransformer** | **20** | 256 | 1e-4 | 128 | 3 | 0.2 |

→ **LSTM y PatchTST ya estaban igualados** (mismos hiperparámetros, ambos entrenados por
`src/models/train.py` con el mismo YAML). La única desventaja era del **iTransformer (20 épocas)**
— y aun así ganó.

**Solución instrumentada (verificada, pendiente de lanzar)**:
`src/models/itransformer_arch.py` (nuevo) envuelve la clase canónica con la firma del proyecto y
está registrado en `factory.ARCHS`. Verificado: construye **495,192 params = idéntico al oficial**
y `forward (2,512,33) → (2,72,10,3)`. Con eso:

```bash
python -m src.models.train --site config/sites/pasto_narino.yaml --arch itransformer --seed 0
```

entrena el iTransformer con **el presupuesto exacto de los otros dos** (100 épocas, mismo
batch/lr/config) en **~3-5 min** (1.6 s/época), creando `itransformer_seed0_best.pt` (archivo
nuevo; el `modelo_b.pt` oficial no se toca).

### Limitación 2 — energía: RESUELTA

- Ventana **por duración** (6 s) en vez de N repeticiones fijo → **miles de muestras**
  (1,358-2,837) en lugar de 2-3.
- Línea base en reposo medida **una sola vez con la GPU fría** (5.5 W) y descontada
  (antes se medía después de castigar la GPU y variaba 6.4-15.6 W según el estado térmico).
- Se reportan dos métricas: **J atribuible al modelo** (ΔP) y **J total de la máquina**.

| modelo | **J atribuible** | J total | peor que iTransformer |
|---|---|---|---|
| **iTransformer** | **0.0067** | **0.0184** | — |
| PatchTST | 0.0424 | 0.0564 | **6.3×** |
| LSTM | 0.0631 | 0.0870 | **9.4×** |

### Nota añadida: varianza entre corridas

La latencia en GPU varía ±15% entre corridas; la de **CPU es estable**. Tres corridas completas:

| modelo | GPU p50 (3 corridas) | mediana | CPU p50 (3 corridas) | mediana |
|---|---|---|---|---|
| iTransformer | 1.97 / 1.71 / 1.58 | **1.71 ms** | 2.00 / 2.00 / 1.94 | **2.00 ms** |
| PatchTST | 2.46 / 1.99 / 2.45 | **2.45 ms** | 26.03 / 24.01 / 23.90 | **24.01 ms** |
| LSTM | 5.58 / 5.61 / 5.86 | **5.61 ms** | 38.18 / 37.57 / 39.05 | **38.18 ms** |

El p95 en GPU del **LSTM es inestable** (7.20 / 11.37 / 13.75 ms): su latencia de cola es peor de
lo que sugiere una sola corrida. En CPU (el escenario operativo) todo es reproducible.

## 6. Artefactos

| artefacto | ruta |
|---|---|
| **Exactitud 3 vías (fuente única)** | `reports/bench/eval_itransformer_test.json` |
| Evaluador justo + auto-validación | `scripts/eval_itransformer_test.py` |
| Medición de inferencia | `reports/bench/bench_arquitecturas.json` |
| Medición de entrenamiento | `reports/bench/bench_entrenamiento.json` |
| Sonda previa | `reports/bench/probe_v1.log` |
| Figuras | `reports/bench/fig_bench_{latencia,entrenamiento,mae_variable,pareto,pareto_cpu}.png` |
| Modelo LSTM | `results/pasto_narino/lstm_seed0_best.pt` (626,354 params) |
| Harness de velocidad | `scripts/bench_arquitecturas.py`, `scripts/bench_entrenamiento.py`, `scripts/fig_bench.py` |
| Código de modelos | `src/models/lstm.py` (nuevo), `src/models/itransformer.py` (nuevo) |
| Smoke test | `scripts/smoke_lstm.py` |

### Pendiente / aviso

- `results/pasto_narino/metrics.json` es **poco fiable** (no coincide con ningún checkpoint
  presente). No borrarlo (es del usuario), pero **no usarlo como referencia**.
- Semillas 1 y 2 del LSTM sin entrenar (media±σ). Dado que el LSTM es el peor de los tres,
  su utilidad es como **baseline barato**, no como candidato operativo.
