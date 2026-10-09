# PLAN — CAMBIO 09 · CICLO DE VIDA DE LA CALIBRACIÓN (motor de producción vivo)
### drift cableado · antigüedad del artefacto · política de refresco · proveedor declarado

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Este archivo vive en
> `C:\Users\2D\tesis-microrred\docs\` y se copia como
> `integracion_plataforma/cambio_09_ciclo_calibracion/README.md`.
>
> **Estado**: **propuesta**. Nada implementado.
> **Clasificación**: 🖥️ **PRODUCCIÓN** — es el motor que **se recalibra solo** con datos reales.
> Cierra con pruebas locales y un test end-to-end sintético (ver §6), sin experimentos.
> **Origen**: auditoría `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` §B.4 (B7, B8, B9).
> **Prerequisito**: ninguno. **Sinergia**: si el cambio 06 está aplicado, el `baseline_rmse` que aquí
> se guarda es el **del predictor corregido** (mejor gatillo).

---

## 0. Qué resuelve

El repo **tiene todas las piezas** del ciclo de vida del ajuste y **ninguna conectada**:

- `monitoring/drift.py` existe, está **documentado como gatillo de recalibración** ("si el RMSE
  rodante supera un umbral ×2, el sistema dispara recalibración… es el ciclo de vida completo del
  ajuste") y **nunca se llama desde ningún lado**. Es código huérfano.
- La recalibración del bucle es **"solo si falta el artefacto"** (`fit_from_sensor(force=False)`).
  Los artefactos actuales son del **26-ago**: llevan semanas alimentando el MPC sin refrescarse.
- El artefacto **no guarda su fecha ni su error de referencia** → hoy es imposible saber si un
  modelo está viejo ni contra qué comparar la deriva.
- `/predict/calibrated` **no expone antigüedad ni `stale`** — justo el patrón que el proyecto ya
  exige en su metodología (regla 3: servir la última versión con `stale:true` y su antigüedad,
  nunca un cero inventado).

**Resultado esperado**: el ajuste de los sensores **se mantiene vivo solo**, con evidencia
verificable y sin intervención manual — que es la tesis de la plataforma (ML en el lazo cerrado).

---

## 1. Lo que YA existe en el repo (verificado leyéndolo, HEAD `2e60acf`)

| pieza | ruta:línea | estado |
|---|---|---|
| **Detector de deriva** | `monitoring/drift.py:42-68` (`detect_drift`) | ✅ implementado, **huérfano** |
| RMSE rodante | `drift.py:34-39` (`rolling_rmse`, ventana 168 h) | ✅ |
| Demo reproducible del gatillo | `drift.py:71-84` (`simulated_monitoring`) | ✅ **sirve para el test de cierre** |
| Ajuste por sensor | `calibration/service.py:275-321` (`fit_from_sensor`, `force`) | ✅ |
| Caché del artefacto | `service.py:283-294` | ⚠️ "solo si falta" |
| Artefacto calibrado | `results/pasto_narino/calibrated/<id>.pkl` | ⚠️ **sin fecha ni baseline** |
| Resumen JSON | `service.py:324-338` (`_summary_of`) | ⚠️ sin antigüedad |
| Endpoint de calibración | `prediction/main.py:80-97` (POST `/predict/calibrate`) | ✅ |
| Endpoint de estado | `main.py:100-112` (GET `/predict/calibrated`) | ⚠️ sin `calibrated_at`/`stale` |
| Predicción por sensor (auto-calibra) | `main.py:115-140` | ✅ |
| Proveedor climático | `prediction/forecaster.py:436-446` + `/predict/weather` | ⚠️ default `openmeteo`; el activo no se declara al arrancar |
| RMSE de calibración | `service.py:148-149` (`rmse_calibrado_kw`) | ⚠️ va al JSON, **no al artefacto** |

---

## 2. Los defectos (síntoma → causa raíz)

### 2.1 — El gatillo existe y está desconectado (B8)
`detect_drift` no aparece en `main.py`, `mpcScheduler.js` ni `service.py` (grep vacío). El docstring
del módulo describe exactamente el comportamiento que **no ocurre**.

### 2.2 — El artefacto no sabe cuándo nació ni cuál era su error (B7)
`CalibratedPvPlant` se construye sin `calibrated_at` ni `baseline_rmse_kw` (`service.py:143-147`);
el RMSE se devuelve en el dict del fit pero **no se persiste en el `.pkl`**. Sin `baseline`, el
detector **no tiene umbral**: `detect_drift` exige `baseline_rmse_kw` como argumento obligatorio.

### 2.3 — Nada expone antigüedad ni `stale` (B9)
`/predict/calibrated` devuelve `exists` + `summary`. Un jurado o el operador no puede ver que el
modelo que está decidiendo tiene semanas.

### 2.4 — No hay política de refresco
Solo "si falta". No hay: edad máxima, recalibración periódica, ni registro de cuándo se recalibró
por qué motivo (deriva vs. política).

---

## 3. Alcance (4 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **09.1** | **Artefacto con memoria** | añadir al artefacto `calibrated_at` (UTC ISO), `baseline_rmse_kw`, `n_horas`, `n_cal` y `source_window` (rango de datos usados). **Append-only**: los artefactos viejos sin estos campos se leen igual |
| **09.2** | **Monitor de deriva cableado** | función `evaluate_drift(site_id, sensor_id, type)` que: lee mediciones recientes del sensor (Mongo), predice el mismo período con el modelo calibrado y llama a `detect_drift` con el `baseline_rmse_kw` guardado. **Reutiliza `drift.py` sin modificarlo** |
| **09.3** | **Estado visible** | `GET /predict/calibrated` devuelve además `calibrated_at`, `age_days`, `stale` (regla 3 del proyecto) y `drift: {rmse, baseline, ratio, drift, n}`; nuevo `GET /predict/calibration/drift` |
| **09.4** | **Política de refresco** | umbral declarado (defecto 2.0×) **+ edad máxima** (configurable; si se supera → recalibra). Registro append-only de cada recalibración con **motivo** (`drift` \| `age` \| `manual` \| `missing`) |
| **09.5** | **Proveedor declarado** | exponer el proveedor climático activo (`FORECASTER` efectivo) en el estado del servicio, para que el bucle no opere "a ciegas" sobre qué cadena de pronóstico usa |

**Decisión declarada**: la recalibración **automática en caliente** (que el bucle recalibre solo a
mitad de ciclo) **no** se activa en este cambio: primero se **mide y avisa** (09.2–09.4). Activar el
disparo automático es un cambio posterior, con evidencia de la frecuencia real de deriva.
**Nunca una cifra inventada**: mientras no haya datos, `ratio = null`.

---

## 4. Contrato de datos

**Artefacto** (`.pkl`, append-only):

| campo | hoy | tras el cambio |
|---|---|---|
| `calibrated_at` | — | **nuevo**: ISO-8601 UTC |
| `baseline_rmse_kw` | — | **nuevo**: RMSE del modelo calibrado en el tramo de calibración |
| `n_horas`, `n_cal` | — | **nuevos** |
| `source_window` | — | **nuevo**: `{desde, hasta}` de las mediciones usadas |
| `band_q` (cambio 06) | — | si el 06 está aplicado, convive sin conflicto |

**Respuesta de estado**:

```json
{
  "sensor_id": "pasto_solar_pv", "exists": true,
  "calibrated_at": "2026-08-26T15:07:00Z", "age_days": 24.3, "stale": true,
  "baseline_rmse_kw": 0.42,
  "drift": {"rmse_kw": 0.71, "baseline_rmse_kw": 0.42, "ratio": 1.69, "drift": false, "n_samples": 168}
}
```
**Reglas**: `stale` = `age_days > max_age_days` (parámetro declarado, no constante oculta). Si no hay
mediciones suficientes → `drift: null` con `reason`, **nunca 0**.

**Registro de recalibraciones** (append-only, versionado):
`results/pasto_narino/calibrated/history/<sensor_id>.jsonl` — una línea por evento:
`{ts, motivo, rmse_antes, rmse_despues, n_horas, artifact_sha256}`.

---

## 5. Líneas a tocar (declaradas una a una)

| # | Archivo | Líneas | Acción |
|---|---|---|---|
| 1 | `optimization/calibration/service.py` | `:143-147` | pasar `calibrated_at`, `baseline_rmse_kw`, `n_horas`, `source_window` al construir el artefacto |
| 2 | `optimization/calibration/service.py` | `:275-321` | registrar el evento de recalibración (append-only) con motivo |
| 3 | `optimization/calibration/service.py` | `:324-338` (`_summary_of`) | exponer antigüedad y baseline |
| 4 | `optimization/monitoring/drift.py` | **sin cambios** | se reutiliza; si hiciera falta un adaptador, va en un módulo nuevo |
| 5 | `optimization/monitoring/calibration_lifecycle.py` | **archivo nuevo** | `evaluate_drift()` + `should_recalibrate()` + registro |
| 6 | `optimization/prediction/main.py` | `:100-112` | ampliar `/predict/calibrated` con `calibrated_at`/`age_days`/`stale`/`drift` |
| 7 | `optimization/prediction/main.py` | **añadir** | `GET /predict/calibration/drift` y el proveedor efectivo en el estado |
| 8 | `optimization/tests/test_drift.py` | **añadir** tests | gatillo con `simulated_monitoring` + `stale` por edad |

**No se toca**: `drift.py` (lógica), `forecaster.py`, `model_builder.py`, `Backend/**`,
`Frontend/**` (la visualización de la antigüedad en la UI es otro incremento).

---

## 6. Criterios de cierre — verificables EJECUTANDO (sin validación)

- [ ] **C1 · Tests**
  ```bash
  cd optimization && pytest tests/test_drift.py tests/test_calibration.py -q
  ```
  → pasa; los tests nuevos cubren gatillo y `stale`.

- [ ] **C2 · El gatillo dispara de verdad (end-to-end sintético, reproducible)**
  → usando `simulated_monitoring` (`drift.py:71-84`), con deriva inyectada a las 30 días:
  el estado devuelve `drift: true` y `ratio > 2`. **Evidencia: el `DriftState` impreso.**

- [ ] **C3 · El artefacto tiene memoria**
  ```bash
  curl -s "http://localhost:8000/predict/calibrated?sensor_id=pasto_solar_pv"
  ```
  → devuelve `calibrated_at`, `age_days` real y `stale` coherente con `max_age_days`.
  **Línea base declarada**: los artefactos actuales son del **26-ago-2026** → `stale: true`.

- [ ] **C4 · Deriva con datos reales del sensor (o `null` declarado)**
  ```bash
  curl -s "http://localhost:8000/predict/calibration/drift?sensor_id=pasto_solar_pv&type=solar"
  ```
  → si hay ≥24 h de mediciones y predicción alineadas: `rmse_kw`, `baseline_rmse_kw`, `ratio`, `drift`.
  → si no las hay: `drift: null` con `reason` explícito (**nunca 0**).

- [ ] **C5 · Registro append-only**
  → tras 2 recalibraciones, `history/pasto_solar_pv.jsonl` tiene **2 líneas** con `motivo` distinto
  y `artifact_sha256` diferente; nada se sobrescribió.

- [ ] **C6 · Proveedor declarado**
  → el estado del servicio dice qué proveedor climático está activo (`FORECASTER` efectivo), y
  coincide con lo que devuelve `/predict/weather`.

---

## 7. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Sin mediciones recientes no hay deriva calculable | `drift: null` + `reason` (nunca 0) |
| 2 | El artefacto viejo no tiene `baseline_rmse_kw` | en la primera lectura se **recalcula** desde el artefacto (residuo en el tramo de calibración) y se persiste; si no es posible → `ratio: null` |
| 3 | Recalibrar en caliente cambia la banda del MPC a media operación | **no se activa** el disparo automático en este cambio (solo medir + avisar) |
| 4 | El RMSE rodante de 168 h no ve deriva rápida | declarar la ventana como parámetro; documentar el compromiso |
| 5 | Recalibración con pocos datos empeora el modelo | política: no recalibrar si `n_horas < mínimo declarado` |

---

## 8. Fuera de alcance (declarado)

| tema | dónde va |
|---|---|
| Visualizar la antigüedad/deriva en la UI | incremento de UI posterior |
| Disparo de recalibración **automático** | cambio posterior, con evidencia de frecuencia real |
| Modelo de demanda (hoy media por hora) | `cambio_10` |
| Validar el efecto de la recalibración sobre el Exp A/A2 | bloque de **validación**, al final |

---

## 9. Fila para la tabla de `integracion_plataforma/README.md`

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **09** | `cambio_09_ciclo_calibracion/` | Ciclo de vida de la calibración: drift cableado, antigüedad + `stale` del artefacto, política de refresco y proveedor declarado | 🟡 Spec v1 · sin implementar |
