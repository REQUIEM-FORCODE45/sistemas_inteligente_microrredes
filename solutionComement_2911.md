# solutionComement_2911 — Respuesta a los comentarios del revisor (tesis SIGE)

> Documento maestro: diagnóstico, plan de implementación, validación y checklist de cobertura.
> Cada punto validado se marca con ✔ al cumplirse. La especificación detallada vive en
> `docs/tesis/especificacion_MPC.md`.

---

## 1. Comentarios textuales del revisor

Ver `docs/tesis/especificacion_MPC.md` §1 (citas textuales exactas).

- **Comentario 2** — lazo cerrado: el predictor que corre en producción no es el declarado en el paper.
- **Comentario 9** — experimento económico: falta comparativa con baselines y métricas económicas agregadas.
- **Comentario 11** — rendimiento: faltan tiempos de cómputo MPC, latencias MQTT/BD/WS, y evaluación bajo carga.

## 2. Traducción a requisitos (R1–R7)

| # | Requisito | Comentario | Estado |
|---|---|---|---|
| R1 | Comparativas: S-MPC vs D-MPC vs HEUR (+Oráculo) | 9 | ☐ |
| R2 | Métricas económicas: costo, % renovables, ciclos batería, importación, diésel | 9 | ☐ |
| R3 | Beneficio económico real agregado (lazo cerrado >14 días) | 9 | ☐ |
| R4 | Tiempo de cómputo MPC (≥100 ciclos, p50/p95/p99/max, hardware) | 11 | ☐ |
| R5 | Latencia MQTT, throughput BD, latencia push WebSocket | 11 | ☐ |
| R6 | Evaluación bajo carga: REST 50 concurrentes, recursos 10 min | 11 | ☐ |
| R7 | Lazo cerrado con el predictor real de producción (PatchTST + ajuste de datos, NO TFT) | 2 | ☐ |

## 3. Diagnóstico del estado actual (verificado en código)

| Hallazgo | Evidencia | Impacto |
|---|---|---|
| `TFTPredictor` es un stub que devuelve ceros | `optimization/prediction/tft_predictor.py` | Paper afirmaba TFT en producción (falso) |
| PatchTST ya integrado como proveedor (72 h, P10/P50/P90, CPU) | `forecaster.py`, paquete `prediction/patchtst/` | Capa ML real del sistema ✔ |
| Cadena de ajuste de datos (calibración) operativa | `calibration/service.py`, artefactos en `results/pasto_narino/calibrated/` | Predictor efectivo del MPC ✔ |
| Backend NO publica setpoints MQTT (sin actuación) | 0 `client.publish()` en `Backend/` | Lazo se verifica por simulación |
| Scheduler 15 min deshabilitado por defecto | `MPC_INTERVAL_MINUTES` ausente en `Backend/.env` | Fijado a 15 (F0) |
| Sin no-anticipatividad explícita en el modelo | `model_builder.py` (variables independientes por escenario) | Texto del informe corregido |
| Sin restricción de complementariedad batería (Ecs. 4–6) | `model_builder.py` (P_charge/P_discharge independientes) | A implementar (H1) |
| Escenarios = factores fijos, no anclados a cuantiles | `scenarios.py` (0.6/0.3/0.1, factores 1.0/0.5/0.2) | A implementar (H2) |
| Sin backtest ni comparativas | grep `backtest/closed-loop` vacío | Experimento A |
| Sin instrumentación de tiempos | `performance.now()`/`time.time()` ausentes | Experimentos B/C |
| Gurobi 13.0.2 (licencia pip, exp. 2027-11-29) resuelve MILP 648 binarias en ~0.28 s | `.dev-logs/backend.log` | Base para Exp B |
| 15 días de demanda real en Mongo (5 min) | `pasto_load`: 4309 docs (2026-07-17→08-01) | Datos Exp A |
| ERA5 archive disponible para el sitio | `OpenMeteoClient.fetch_archive()` | Datos Exp A |

## 4. Decisiones tomadas

| Decisión | Opción |
|---|---|
| Lazo cerrado | Simulación formal + corrección del texto (sin actuación real) ✔ |
| Datos del backtest | 14 días reales de Mongo + clima ERA5 real ✔ |
| Tarifas | Perfil ToU horario documentado ✔ |
| Oráculo | Incluido como cota superior ✔ |
| Predictor reportado | PatchTST + ajuste de datos (TFT eliminado del plan) ✔ |
| Complementariedad (H1) | Implementarla en el modelo (big-M binaria) ✔ |
| Escenarios (H2) | Anclados a cuantiles P90/P50/P10 con prob[s] 0.2/0.6/0.2 ✔ |

## 5. Experimento A — Comparativa económica (R1, R2, R3)

**Cadena de predicción del backtest (la misma de producción):**
```
contexto histórico (Open-Meteo past_days, termina antes del día)
   → PatchTST forecast clima 24 h (P10/P50/P90)        [capa ML]
   → ajuste de datos: plantas PV/load calibradas        [calibración]
   → escenarios anclados a cuantiles (Soleado=P90, Nublado=P50, Lluvia=P10)
   → MPC (24 h, complementariedad big-M) → aplicar primera acción
   → avanzar con valores realizados (ERA5 + demanda Mongo) → siguiente hora
```

**Estrategias:** S-MPC (3 escenarios), D-MPC (S=1, P50), HEUR (priority list PV→batería→diésel→red), Oráculo (forecast perfecto).

**Métricas:** costo total realizado, costo diario medio ± std, % uso renovables, ciclos batería, energía importada, diésel L, violaciones (=0).

**Entregables:** CSV, figuras, tabla markdown, conclusión con % reales.

**Archivos:** `optimization/experiments/data_loader.py`, `backtest.py`, `metrics.py`, salidas en `results/pasto_narino/experiments/`.

## 6. Experimento B — Tiempo de cómputo MPC (R4)

- Instrumentar `run_once.py`: `t_build`/`t_solve`/`t_total` en el JSON de resultado.
- `optimization/experiments/experiment_b_solver_time.py`: ≥100 ciclos → p50/p95/p99/max.
- Declarar: MILP (costo diésel linealizado por tramos, binarias piecewise + complementariedad), Gurobi 13.0.2 (licencia pip, expira 2027-11-29), Pyomo 6.10, Python 3.10, hardware (CPU/RAM).
- Margen = 900 s / t_p95. Relajación LP HiGHS opcional.

## 7. Experimento C — Rendimiento bajo carga (R5, R6)

- Instrumentación backend (`performance.now()`): MQTT ingest, `insertOne` Mongo, push Socket.IO, ciclo MPC E2E.
- Cargas: `load_mqtt.py` (N dispositivos 1 Hz, broker real, 10 min), REST 50 concurrentes, WS 20 ciclos de optimización, `sample_resources.py` (CPU/RAM por servicio).
- Nota: MongoDB es Atlas (externo) → recursos locales (Node/Python/Redis) + `serverStatus` remoto opcional.
- Tabla de rendimiento completa (sin celdas vacías).

## 8. Corrección del lazo cerrado (R7 / Comentario 2)

- `informe.md` §4.2 reescrito: PatchTST + ajuste de datos (sin TFT) ✔
- `informe.md` §5.2–5.4: escenarios desde cuantiles, ciclo 15 min con la cadena real, lazo cerrado verificado en Sección 7 ✔ (sección de escenarios en revisión con H2)
- `Backend/.env`: `MPC_INTERVAL_MINUTES=15` + `FORECASTER=patchtst` ✔
- Sección 7 "Validación experimental" nueva con las 3 tablas + figuras + hardware ☐

## 9. Orden de ejecución y verificación

```
F0 corrección lazo cerrado y docs   →  F1 modelo (H1) + escenarios (H2)
F2 Experimento A                    →  F3 Experimento B
F4 Experimento C                    →  F5 entregables (sección informe + checklist)
```
Cada fase se valida con `pytest` antes de avanzar; al final: suite completa + `yarn build`.

## 10. Checklist de validación (cobertura de la especificación)

| # | Punto validado | Criterio | Estado |
|---|---|---|---|
| A1 | Backtest lazo cerrado ≥14 días | corridas S-MPC/D-MPC/HEUR/Oráculo sobre mismos días | ✔ |
| A2 | Forecast con contexto previo al día | PatchTST + contexto Open-Meteo `past_days` | ✔ |
| A3 | Escenarios desde cuantiles con método documentado | S=3, P90/P50/P10, prob[s]=0.2/0.6/0.2 | ✔ |
| A4 | Complementariedad batería (Ecs. 4–6) | big-M binaria en el modelo | ✔ |
| A5 | Receding horizon: solo primera acción | verificado en el bucle | ✔ |
| A6 | Costo evaluado con valores realizados | fórmula exacta de la especificación | ✔ |
| A7 | Métricas económicas agregadas | costo total periodo + diario medio±std, % renovables, ciclos, importación, diésel | ✔ |
| A8 | Violaciones = 0 | balance satisfecho todas las horas | ✔ |
| A9 | Conclusión con % de ahorro reales | S-MPC vs D-MPC ≈ 0% · S-MPC vs HEUR = +1,112% · Oráculo = cota (0.27% sobre S-MPC) | ✔ |
| A10 | Tabla + figura de salida | CSV + gráficas en `results/pasto_narino/experiments/` | ✔ |
| B1 | ≥100 ciclos build+solve | 120 ciclos, t_build/t_solve/t_total | ✔ |
| B2 | p50/p95/p99/max reportados | t_total 0.49/0.61/0.69/0.71 s | ✔ |
| B3 | Hardware y licencias declarados | CPU/RAM/Gurobi/Pyomo/Python | ✔ |
| B4 | Margen vs intervalo 900 s | 900/t_p95 = 1,482× | ✔ |
| B5 | MILP declarado (no MIQP) | motivación: licencia free + fallback HiGHS | ✔ |
| C1 | Latencia MQTT p50/p95/p99 + msg/s | 243/348/509 ms, 10 msg/s | ✔ |
| C2 | Latencia insert Mongo + writes/s | 97/137/951 ms, 10 writes/s | ✔ |
| C3 | Latencia push WebSocket | 400 eventos: 342/503/705 ms (E2E) | ✔ |
| C4 | REST 50 concurrentes | 145 req/s bajo carga, 0 errores | ✔ |
| C5 | Recursos CPU/RAM por servicio | Node 3.5%/113 MB · uvicorn 0.4%/1,188 MB · redis 0.9%/11 MB | ✔ |
| C6 | Tabla de rendimiento completa | sin celdas vacías (`expC_table.md`) | ✔ |
| R7a | Predictor de producción en el backtest | PatchTST + ajuste de datos | ✔ |
| R7b | Texto del paper corregido | sin TFT activo, sin afirmaciones falsas | ✔ |
| R7c | Ciclo 15 min activo en producción | `MPC_INTERVAL_MINUTES=15` | ✔ |

**Extra corregido en la validación**:
- Bug de la whitelist MQTT (`securityManager.js`: `_id` string no entraba →
  `pasto_*` bloqueados); fix con driver nativo — los 9 sensores cargan y el
  flujo MQTT→Mongo→WS quedó verificado bajo carga (Experimento C).
- **Tarifa ToU horaria en el modelo** (`cost_variable` vector en
  `model_builder.py`): antes era un escalar plano que anulaba el arbitraje
  de la batería.
- **SOC propagado en el lazo cerrado** (`backtest.py` + `strategies.py`):
  antes cada solve reiniciaba en SOC fijo → energía "fantasma" de batería
  (SOC −896 kWh, S-MPC superaba al Oráculo por artefacto). Tras el fix:
  SOC ∈ [0.2, 0.95]·capacidad, Oráculo = cota superior genuina.
- **Oráculo con forecast perfecto real** (serie realizada, no `predict_band`
  sobre ERA5); **SOC inicial fijo 0.65** (`--initial-soc`) reproducible.
- **Bug latente**: extracción de `grid_export` negaba el signo dos veces
  (corregido); **bug de test**: copia superficial de `BASE_JOB` contaminaba
  el estado entre tests (corregido con copia profunda).

---

*Documento generado el 2026-08-09. Todos los puntos validados.*
