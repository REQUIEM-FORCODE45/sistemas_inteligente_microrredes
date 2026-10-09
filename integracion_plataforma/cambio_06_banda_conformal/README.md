# PLAN — CAMBIO 06 · BANDA DE INCERTIDUMBRE DEL MPC (calibración probabilística)
### split disjunto · cuantiles del predictor FINAL · banda asimétrica

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El
> autor del proyecto **NO toca el repositorio**: solo lo lee y especifica. La implementación la
> hace la IA del autor. Este archivo vive en `C:\Users\2D\tesis-microrred\docs\` y se copia como
> `integracion_plataforma/cambio_06_banda_conformal/README.md`.
>
> **Estado**: **propuesta**. Nada implementado en el repo.
> **Origen**: auditoría `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` §B.2–B.3 (repo, HEAD `2e60acf`).
> **Bloquea a**: la interpretación del Exp A2 (S-MPC vs D-MPC) y la validez de la banda que se
> muestra al operador.

---

## 0. Qué resuelve

Los escenarios del S-MPC **son** la banda P10/P50/P90 del calibrador:
`calibration/service.py` → `sensor_predictor.py` → `predictions_pv_band` → `model_builder._band_at`.

Hoy esa banda se construye con **tres defectos acumulados**, y el resultado medido está en el
anexo del informe: **cobertura holdout 50.2% / 54.8% con banda nominal 80%** (`informe.md:456-461`).

**Consecuencia sobre el MPC**: si la banda subestima la incertidumbre, los escenarios P90/P10 se
comprimen hacia el P50 → el S-MPC "ve" menos incertidumbre de la que existe → sus decisiones
convergen a las del D-MPC → **S-MPC ≈ D-MPC**, que es exactamente lo observado en el Exp A y A2.

**Este cambio no añade funcionalidad nueva al MPC: corrige la entrada de incertidumbre que lo
alimenta.**

> **Clasificación**: **PRODUCCIÓN** (eje del programa). La banda es la que consume el MPC del
> diagrama en cada ciclo de 15 min y la que el operador ve. Su verificación de cierre **no depende**
> de re-correr experimentos de validación (ver C4, diferido). Es prerequisito de cualquier
> afirmación futura sobre el valor del estocástico, pero **se implementa y se cierra ahora**.

---

## 1. Lo que YA existe en el repo (verificado leyéndolo, HEAD `2e60acf`)

| pieza | ruta:línea | por qué importa aquí |
|---|---|---|
| Split actual de la calibración solar | `calibration/service.py:125-141` | **aquí está el defecto 1 y 2** |
| Construcción de la banda | `calibration/calibrated_plant.py:63-87` | **aquí está el defecto 3** |
| Conformal (radio + banda simétrica + cobertura) | `calibration/conformal.py:32-71` | funciones a **reutilizar sin modificar** |
| GBR de residuos (features fijas) | `calibration/residual.py:32-58,115-129` | **no se toca** (hiperparámetros congelados) |
| Calibración paramétrica | `calibration/params.py:32-71` | **no se toca** |
| Derating K | `calibration/derating.py:18-39` | **no se toca** |
| Fallback de cuantiles empíricos | `calibrated_plant.py:79-81` | ya existe la forma correcta (asimétrica) |
| Test de cobertura nominal | `tests/test_conformal.py:27` | **debe seguir pasando** |
| Medición de cobertura | `conformal.py:62-65` (`coverage`) | se reutiliza para cerrar |
| Consumo de la banda en el MPC | `solver/model_builder.py:311-313` | **no se toca** |

---

## 2. El defecto (síntoma medido → causa raíz demostrada)

### Defecto 1 — El radio se calibra **in-sample**

`service.py:129-141`:
```python
k = estimate_derating(nominal.ac_power(cli_tr) / 1000.0, p_tr, nominal.capacity_kwp)  # todo cli_tr
params = calibrate_params(nominal, cli_tr, p_tr)                                      # todo cli_tr
plant_calib = build_plant(nominal, params)
n_fit = int(0.8 * n_tr)
resid_fit = (p_tr.iloc[:n_fit] - plant_calib.ac_power(cli_tr.iloc[:n_fit]) / 1000.0)
gbr = fit_residual_gbr(feats_fit, resid_fit)
cal_resid = resid_fit.iloc[-int(0.2 * n_fit):]           # ← subconjunto del FIT
radius = conformal_radius(cal_resid, alpha=0.2)
```
`params` y `k` se ajustaron con los **mismos datos** donde se mide el residuo, y el tramo de
calibración es un **subconjunto del tramo de ajuste**. El conformal exige datos de calibración
**no usados** para ajustar el predictor.

### Defecto 2 — El radio mide el error del modelo **físico**, pero se aplica al **híbrido**

`resid_fit` se calcula contra `plant_calib` (**físico, sin GBR**). Pero la banda se construye sobre
el P50 que **sí incluye el GBR** (`calibrated_plant.py:72-76`):
```python
p50 = self.predict_power(climate, use_residual=self.residual_model is not None)  # físico + GBR
band = conformal_band(p50, self.conformal_radius_kw)   # radio del modelo SIN GBR
```
El ancho corresponde a la distribución del error de un predictor que **no es** el que se reporta.

### Defecto 3 — Banda **simétrica** y con `clip` que anula la garantía

`conformal.py:53-59`:
```python
"P10": (p50 - radius).clip(lower=0.0), "P90": p50 + radius
```
El error de un modelo PV es **heterocedástico** (crece con la irradiancia) y está **truncado en 0**:
un radio constante calibrado en promedio da banda **estrecha en horas de alta generación** y ancha
en horas de baja. El `clip(lower=0)` además rompe la cobertura exacta.

### Síntoma ya medido en el anexo

| seed | Radio conformal | Cobertura holdout | Nominal |
|---|---|---|---|
| 7 | 0.555 kW | **50.2%** | 80% |
| 42 | 0.848 kW | **54.8%** | 80% |

El informe lo atribuye a *deriva temporal* (réplica HO#1 §6.6). El código demuestra que **también
hay causa estructural**. Ambas cosas pueden coexistir; la corrección elimina la estructural y
**mide** lo que queda (deriva) con un número versionado.

---

## 3. Alcance del cambio (4 incrementos)

### 3.1 — `06.1` Split triple disjunto (ajuste | calibración | holdout)

Reorganiza el reparto dentro del tramo de entrenamiento, **sin cambiar los ajustes**: el GBR sigue
con sus hiperparámetros congelados (`residual.py:28`) y `params`/`k` con su lógica actual.

```
climate (n) ─────┬── ajuste   (60%)  → k, params, GBR
                 ├── calibración (20%) → cuantiles del residuo del predictor FINAL
                 └── holdout  (20%) → medición de cobertura (NO se usa para calibrar nada)
```

### 3.2 — `06.2` Cuantiles del predictor **final** (defecto 2)

El residuo de calibración se mide contra el **predictor completo** (físico + GBR), no contra
`plant_calib`.

### 3.3 — `06.3` Banda **asimétrica** por cuantiles (defecto 3)

```
P10[t] = P50[t] + q10(residuo_cal)      P90[t] = P50[t] + q90(residuo_cal)
```
Se reutiliza la forma que **ya existe** en el fallback (`calibrated_plant.py:79-81`) — el cambio es
que esos cuantiles se midan con el split correcto. **Opcional 06.3b**: cuantiles **condicionales**
por estrato de irradiancia (3 estratos) si el holdout muestra heterocedasticidad (se decide con el
número medido, no por intuición).

### 3.4 — `06.4` Medición y publicación de la cobertura

Un script único mide la cobertura holdout **con el mismo protocolo antes y después**, y publica el
resultado como artefacto versionado (regla dura 2: ninguna cifra a mano).

---

## 4. Contrato de datos

**Artefacto calibrado** (`results/pasto_narino/calibrated/<sensor_id>.pkl`) — **append-only**:

| campo | hoy | tras el cambio |
|---|---|---|
| `conformal_radius_kw` | float | **se conserva** (compatibilidad) |
| `residual_q` | `np.ndarray([q10,q50,q90])` | **se conserva** |
| `band_q` | — | **nuevo**: `{"q10": float, "q90": float, "n_cal": int, "split": "disjunto", "coverage_holdout": float}` |
| `meta` | dict | se le añade `calib_version: "06.1"` |

**Regla de compatibilidad**: si `band_q` **no** existe en un artefacto viejo, el código se comporta
**exactamente como hoy** (radio conformal). Nada se rompe hasta que se recalibre con `force=True`.

**Resumen JSON** (`<sensor_id>.json`): se añaden `band_q.q10`, `band_q.q90`, `band_q.coverage_holdout`.

---

## 5. Líneas a tocar (declaradas una a una)

> Regla dura 1: no se toca código existente sin declararlo. Estas son **todas** las líneas.

| # | Archivo | Líneas | Acción | Por qué |
|---|---|---|---|---|
| 1 | `optimization/calibration/conformal.py` | **añadir** al final del archivo | función nueva `conformal_quantiles(residual, alphas=(0.1,0.9))` | no se modifica ninguna función existente |
| 2 | `optimization/calibration/calibrated_plant.py` | `72-84` | si existe `band_q` → usarla (cuantiles asimétricos); si no → comportamiento actual | compatibilidad hacia atrás |
| 3 | `optimization/calibration/service.py` | `125-141` | reemplazar el reparto por el **triple split** y calcular los cuantiles contra el predictor final | defectos 1 y 2 |
| 4 | `optimization/calibration/service.py` | `143-147` | pasar `band_q` a `CalibratedPvPlant` | transporte del contrato |
| 5 | `optimization/calibration/service.py` | `324-338` (`_summary_of`) | exponer `band_q` en el resumen | trazabilidad (regla dura 2) |
| 6 | `optimization/tests/test_conformal.py` | **añadir** test | cobertura en holdout con datos **heterocedásticos** | evita la regresión |

**No se toca**: `residual.py`, `params.py`, `derating.py`, `sensor_predictor.py`,
`solver/model_builder.py`, `Backend/**`, `Frontend/**`.

---

## 6. Criterios de cierre — verificables EJECUTANDO

Cada casilla exige **comando + salida real** en `VERIFICACION_*.md` (no descripciones).

- [ ] **C1 · Sin regresión de tests**
  ```bash
  cd optimization && pytest tests/test_conformal.py tests/test_calibration.py -q
  ```
  → todo pasa, incluido `test_coverage_cumple_nominal`.

- [ ] **C2 · Recalibración forzada del sensor solar**
  ```bash
  curl -s -X POST "http://localhost:8000/predict/calibrate?sensor_id=pasto_solar_pv&force=true"
  ```
  → devuelve `summary.band_q` con `q10`, `q90`, `n_cal` y `coverage_holdout`.

- [ ] **C3 · Cobertura real medida (antes vs después)** — el criterio central
  ```bash
  python optimization/tests/medir_cobertura_banda.py --sensor pasto_solar_pv --alpha 0.2
  ```
  → **línea base declarada**: 50.2% (seed 7) / 54.8% (seed 42), `informe.md:456-461`.
  → **criterio**: `coverage_holdout ≥ 0.72` con nominal 0.80 **medido en horas de generación**, y
  **declarar el ancho medio** de banda (kW) antes/después. Si sale < 0.72, se reporta el número real
  y se documenta la deriva remanente (nunca se ajusta el número para que pase).

- [ ] **C4 · Efecto sobre el MPC — ⏸️ DIFERIDO al bloque final de validación**
  > **No es criterio de cierre de este cambio** por decisión del autor: la re-corrida del Exp A2
  > pertenece al **eje de validación** (escenarios de red), que se ejecuta al final.
  > **Este cambio cierra con C1, C2, C3, C5 y C6** — que son **producción**: la banda que el MPC
  > del diagrama consume cada 15 minutos.
  > El comando y la comparación se conservan aquí para cuando se retome:

  ```bash
  cd optimization && python -m optimization.experiments.experiment_a2_stochastic \
      --days 14 --start-date 2026-07-24 --modes isla --pv-source mongo
  ```
  → comparar contra la línea base del Exp A2 (**S-MPC 936,035 · D-MPC 964,806 · ENS 3.45 vs 10.65 ·
  CVaR_80 71,752 vs 80,463**). Reportar si la separación S-MPC ↔ D-MPC **aumenta** (hipótesis del
  §0). Si no aumenta, se reporta igual: el hallazgo negativo también es resultado.

- [ ] **C5 · Compatibilidad de artefactos viejos**
  → con un `.pkl` sin `band_q`, `predict_band` devuelve exactamente lo mismo que hoy (comparar
  vector contra una copia previa).

- [ ] **C6 · Trazabilidad**
  → `results/pasto_narino/calibrated/pasto_solar_pv.json` incluye `band_q` y `coverage_holdout`;
  toda cifra del informe de verificación sale de ese JSON versionado.

---

## 7. Riesgos declarados

| # | Riesgo | Mitigación declarada en la spec |
|---|---|---|
| 1 | Con ~30 días de sensor (≈720 h) el triple split deja pocas horas de calibración (~140) | reportar `n_cal` real; si `n_cal < 100`, usar cuantiles conservadores (+1 punto) y **declararlo** |
| 2 | Los cuantiles empíricos son ruidosos con pocas muestras | fijar semilla y reportar el ancho; comparar con el radio previo como cota |
| 3 | La banda más ancha puede **encarecer** el S-MPC (más diésel preventivo) | es el resultado esperado del compromiso: se reporta el par (EN$/costo, ENS/CVaR), no solo el costo |
| 4 | Cambiar la cobertura **cambia los resultados del Exp A2** ya publicados | el Exp A2 se **re-corre** y se publica la nueva tabla; la anterior se marca con su `band_q` en el manifiesto |
| 5 | Deriva temporal real (no estructural) | C3 mide lo que queda tras el fix; la deriva se reporta como hallazgo, no se "arregla" |

---

## 8. Fuera de alcance (declarado, no silencioso)

| tema | por qué NO aquí | dónde va |
|---|---|---|
| Rampa del diésel, no-simultaneidad import/export, `grid_d` por hora | es **modelo de optimización**, no calibración | `cambio_08` |
| Informe §5.1/§5.2 desactualizado frente al código | es **documentación** | `cambio_07` |
| Cablear `monitoring/drift.py` y política de refresco | es **ciclo de vida operativo** | `cambio_09` |
| Modelo de demanda (hoy media por hora) | es **otro activo** | `cambio_10` |
| Reportar la banda usada en el `dispatch_plan` de la UI | es **presentación** | `cambio_07` (baja prioridad) |

**`reference/` de este cambio** (lo que el implementador no puede abrir por sí mismo):

```
reference/
├── README.md                     ← tamaño + sha256 por archivo
├── scripts/medir_cobertura_banda.py   ← protocolo único de medición (antes y después)
├── datos/pasto_solar_pv.json     ← resumen del artefacto ACTUAL (k, params, radio)
├── datos/cobertura_anexo.md      ← extracto de informe.md:442-465 (línea base 50.2/54.8)
└── docs/AUDITORIA_...md          ← §B.2–B.3 con la evidencia (este repo)
```

---

## 9. Estado del cambio en la tabla

Al crear la carpeta, añadir la fila en `integracion_plataforma/README.md`:

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **06** | `cambio_06_banda_conformal/` | Banda de incertidumbre del MPC: split disjunto + cuantiles del predictor final + banda asimétrica (la que alimenta los escenarios del S-MPC) | 🟡 Spec v1 · sin implementar |
