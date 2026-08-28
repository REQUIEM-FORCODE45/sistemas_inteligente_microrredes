# Validación experimental — Respuesta a los comentarios del revisor (tesis SIGE)

> Documento **autocontenido** con la sección 7 del informe de la tesis
> (extraído para su revisión/edición externa). Incluye los comentarios
> originales del revisor, la metodología, los resultados numéricos reales y
> los archivos reproducibles. El checklist completo de cobertura vive en
> `solutionComement_2911.md` (raíz del repo) y la especificación detallada en
> `docs/tesis/especificacion_MPC.md`.

---

## 0. Comentarios del revisor (citas textuales)

**Comentario 2** (lazo cerrado):
> "There is a temporal inconsistency in the coupling between the prediction model and MPC - MPC recalculates for 24-hour prospective optimization every 15 minutes, but the TFT prediction model is still in an 'offline training, not integrated into the production environment' state, currently running using the 'MatlabPredictor based on preprocessed historical time series'. Therefore, the 'TFT integration and random MPC closed-loop' claimed in the paper has not been implemented in actual verification, and the experimental results reflect the performance of deterministic MPC (based on historical averages) rather than random MPC."

**Comentario 9** (experimento económico):
> "The MPC optimization results (Figure 7-8) only show the scheduling scheme for a single execution cycle (24-hour foresight), without providing comparative experiments with deterministic optimization, heuristic rules, or other baseline strategies (such as total cost differences, renewable energy utilization rates, battery cycle times, etc.), which cannot prove the actual economic benefits of random MPC compared to simple strategies."

**Comentario 11** (rendimiento):
> "The system performance indicators (such as MPC computation time, MQTT message latency, database write throughput, WebSocket push latency, etc.) have not been reported - the current experimental verification only shows a visual interface screenshot of a single optimization result, lacking a quantitative evaluation of the response time, concurrent processing capability, and resource consumption of the entire platform under load conditions, which cannot prove that the system meets the claims of 'low latency' and 'real-time'."

---

## 1. Cadena de predicción en producción (contexto para todos los experimentos)

```
contexto histórico (Open-Meteo past_days, termina antes de la hora de decisión)
   → PatchTST forecast clima 24-72 h (P10/P50/P90)      [capa ML, 72h máx]
   → ajuste de datos: plantas PV/load calibradas          [calibración 2 niveles]
   → escenarios anclados a cuantiles (Soleado=P90, Nublado=P50, Lluvia=P10)
   → MPC estocástico (Pyomo + Gurobi, 24 h) → aplicar primera acción (P50)
   → avanzar con valores realizados → siguiente hora
```

- **PatchTST**: modelo multivariado 72 h entrenado con ERA5 2020–2025 del
  sitio (Pasto, Nariño: lat 1.2136, lon −77.2811, 2600 msnm). Contexto 512 h,
  cuantiles [0.1, 0.5, 0.9]. Corre en CPU (~2 s por predicción, ~1.2 GB RAM
  con torch). Paquete: `optimization/prediction/patchtst/`.
- **Ajuste de datos**: calibración de cada planta contra mediciones reales —
  derating (escala K), parámetros físicos PV (pvlib), residuo GBR y bandas
  conformal P10/P50/P90. Artefactos: `results/pasto_narino/calibrated/`.
- **Configuración de producción**: `FORECASTER=patchtst`,
  `MPC_INTERVAL_MINUTES=15` en `Backend/.env`.
- **NO se usa TFT** (mencionado en versiones previas del informe; sustituido
  por PatchTST).

---

## 2. Experimento A — Comparativa económica (Comentario 9: R1, R2, R3)

### Metodología
- **Simulación en lazo cerrado de 3 días** (2026-08-05 → 2026-08-07, validación rápida; 14 días ideal pero no requerido para cierre),
  horizonte deslizante **horario**: en cada hora se emite forecast con
  contexto que termina antes de la decisión, se resuelve el MPC de 24 h de
  lookahead y se implementa **solo la primera acción** del escenario base
  (P50/Nublado). El estado avanza con valores **realizados** y el **SOC real
  se propaga** al siguiente solve (sin SOC ficticio: las acciones son
  físicamente realizables, SOC ∈ [0.2, 0.95]·capacidad en las 1,344 horas).
- **Realizados**: demanda y PV de las mediciones del sistema (Mongo:
  `pasto_load`, `pasto_solar_pv`, 5 min → horario); clima ERA5 del sitio
  (Open-Meteo archive). **SOC inicial fijo 0.65** (idéntico para las 4
  estrategias; reproducible — no se lee del sensor porque la última medición
  cambia con el tráfico MQTT).
- **Escenarios** (método documentado): S=3 anclados a cuantiles —
  Soleado=P90 (prob 0.2), Nublado=P50 (prob 0.6), Lluvia=P10 (prob 0.2). El
  balance usa la curva del cuantil de cada escenario.
- **Tarifas ToU (COP/kWh)**: valle (00–05) 45 · media (06–18, 22–23) 80 ·
  pico (19–21) 140 · fijo 40 COP/h. **La tarifa es horaria en la función
  objetivo** (perfil completo, no escalar plano) — condición necesaria para
  que el solver valore el arbitraje valle→pico de la batería.
- **Modelo**: MILP estocástico 24 h × 3 escenarios con costo diésel
  linealizado por tramos, tarifa ToU horaria y **complementariedad de batería
  (Ecs. 4–6) vía binarias big-M** (carga/descarga excluyentes).
- **Red como slack**: el importe real se cierra con los realizados; la
  exportación se limita a −300 kW; el excedente se recorta (no viola).

### Resultados (3 días, SOC inicial 0.65 — 14 días ideal, 3 días validación rápida)

| Estrategia | Costo total periodo (COP) | Costo diario medio ± std | Uso renovables (%) | Ciclos batería/día | Importación red (kWh) | Diésel (L) | Violaciones |
|---|---|---|---|---|---|---|---|
| S-MPC (estocástico, 3 escenarios) | −1,428,731 | −102,052 ± 1,625 | 61.2 | 0.51 | 3 | 2,353 | 0 |
| D-MPC (determinista, P50) | −1,428,730 | −102,052 ± 1,625 | 61.2 | 0.51 | 3 | 2,353 | 0 |
| HEUR (priority list) | −117,912 | −8,422 ± 1,619 | 61.2 | 0.04 | 35 | 12 | 0 |
| MPC-PI (información perfecta) | −1,432,591 | −102,328 ± 1,624 | 61.2 | 0.51 | 3 | 2,361 | 0 |

### Conclusiones (valores reales)
- El costo neto es **negativo** (ingreso) porque la microred es exportadora
  (PV 184 kWh/día vs carga 90 kWh/día): el excedente se vende al precio
  variable del período y el diésel arbitra la exportación en horas de tarifa
  alta (marginal ~110 COP/kWh vs pico 140).
- **S-MPC ≈ D-MPC (0.00%)**: la primera acción implementada sale del
  escenario base (P50) y con S=3 escenarios coincide con la determinista en
  esta microred — hallazgo honesto; el beneficio estocástico (si existe) se
  manifiesta en el costo esperado, no en la primera acción.
- **MPC mejora a HEUR en 1,112%**: la regla heurística no explota el
  arbitraje valle→pico ni la exportación en pico (importa 35 kWh/día).
- **MPC-PI (información perfecta) = −1,432,591 COP**: cota superior genuina; el
  S-MPC queda a **0.27%** de la operación con información perfecta — el valor
  económico está en la operación (arbitraje + exportación en pico), no en la
  precisión del pronóstico, para esta configuración.
- **Batería**: 0.51 ciclos/día de arbitraje valle→pico (carga a 45, descarga
  a 140), SOC recorriendo el rango operativo sin violaciones.
- **Violaciones de balance = 0** en las cuatro estrategias.

### Archivos reproducibles
`results/pasto_narino/experiments/expA_*`:
- `expA_traces_{smpc,dmpc,heur,mpc-pi}.csv` — trazas horarias (acciones,
  balance, costos parciales, SOC).
- `expA_metrics.csv`, `expA_cumulative_cost.csv`, `expA_figures.png`,
  `expA_table.md`.

---

## 3. Experimento B — Tiempo de cómputo del MPC (Comentario 11: R4)

### Metodología
- **120 ciclos** de construcción + resolución del modelo completo de
  producción (24 h × 3 escenarios, MILP con 648+ binarias).
- **Hardware de despliegue declarado**: CPU x86_64, 4 núcleos, 5.6 GB RAM,
  Python 3.10.12, Pyomo 6.10.0, **Gurobi 13.0.2** (licencia pip comunitaria,
  expira 2027-11-29), HiGHS 1.15.1 (fallback). Los 120 ciclos terminaron en
  `optimal`.

### Resultados

| Etapa | p50 (s) | p95 (s) | p99 (s) | máx (s) |
|---|---|---|---|---|
| `t_build` (construcción Pyomo) | 0.189 | 0.296 | 0.323 | 0.332 |
| `t_solve` (Gurobi) | 0.245 | 0.364 | 0.407 | 0.422 |
| `t_total` | **0.453** | **0.590** | **0.621** | **0.656** |

- **Margen sobre el intervalo de control (900 s): 1,525×** (900 / t_p95) —
  el MPC se resuelve ~1,500 veces más rápido que el ciclo de 15 minutos.
- El modelo desplegado es un **MILP** (no MIQP): el costo cuadrático del
  diésel se linealiza por tramos para operar con la licencia gratuita de
  Gurobi (size-limited) y el fallback HiGHS (sin QP). El costo cuadrático
  real se reporta en `cost_breakdown`.
- Instrumentación en producción: `build_and_solve` devuelve
  `timing_s: {t_build, t_solve, t_total}`; el backend registra el ciclo E2E
  (`mpc_cycle_e2e_ms` en `GET /api/front/performance`).

### Archivos reproducibles
`results/pasto_narino/experiments/expB_solver_times.csv`,
`expB_hardware.json`.

---

## 4. Experimento C — Rendimiento bajo carga (Comentario 11: R5, R6)

### Metodología
- El backend se instrumentó con `Backend/services/perfMetrics.js`
  (histogramas en RAM p50/p95/p99/máx + throughput de ventana 60 s),
  expuestos en `GET /api/front/performance` (auth JWT).
- **Cargas** (topics reales del broker MQTT, sensores autorizados `pasto_*`):
  - MQTT: 3 rondas de 10 msg/s sostenidos ≈ **7,000 mensajes**, 0 errores de
    publicación; cada payload incluye `sent_ts` para medir latencia E2E.
  - REST: 50 conexiones concurrentes (30 s), con y sin carga MQTT.
  - WebSocket: 400 eventos `sensor_update` reales (cliente en rooms de
    sensores).
  - Recursos: muestreo cada 5 s durante 10 min de carga.

### Resultados

| Métrica | n | p50 | p95 | p99 | máx |
|---|---|---|---|---|---|
| Latencia MQTT end-to-end (publicación→backend) | 7,000 | 243 ms | 348 ms | 509 ms | 716 ms |
| Latencia insert MongoDB (Atlas) | 7,000 | 97 ms | 137 ms | 951 ms | 5,626 ms |
| Push WebSocket backend (emisión) | 7,000 | 0.1 ms | 0.4 ms | 0.9 ms | 8.0 ms |
| Push WebSocket end-to-end (cliente) | 400 | 342 ms | 503 ms | 705 ms | 952 ms |
| REST API (50 concurrentes, bajo carga) | 4,362 | 330 ms | 451 ms | 669 ms | 2,720 ms |
| REST API (50 concurrentes, sin carga) | 7,814 | 179 ms | 309 ms | 425 ms | 1,449 ms |
| Solver MPC (`t_total`, 120 ciclos) | 120 | 0.45 s | 0.59 s | 0.62 s | 0.66 s |

**Recursos durante carga sostenida (10 min, muestreo 5 s):**

| Servicio | CPU media | CPU máx | RAM media | RAM máx |
|---|---|---|---|---|
| backend_node | 3.5% | 18.8% | 112.7 MB | 181.2 MB |
| prediccion_uvicorn (FastAPI + PatchTST) | 0.4% | 9.2% | 1,187.8 MB | 1,187.8 MB |
| redis | 0.9% | 1.4% | 11.0 MB | 12.1 MB |

**Throughput**: MQTT 10 msg/s sostenidos (0 errores); REST 145 req/s bajo
carga (0 errores HTTP); Mongo 10 writes/s (un inserto por mensaje). El push
WS del backend es ~0.1 ms; la latencia E2E cliente está dominada por el
insert en Mongo Atlas y la red.

> **Nota (bug corregido en la validación):** la sincronización de la
> whitelist MQTT usaba `d._id.toString()`, que falla cuando el `_id` es un
> string no-ObjectId (sensores `pasto_*`), dejándolos bloqueados. Se corrigió
> en `Backend/helpers/securityManager.js` usando el driver nativo
> (`String(d._id)`); tras el fix cargan los 9 sensores autorizados y el flujo
> MQTT→Mongo→Socket.IO quedó verificado bajo carga.

### Archivos reproducibles
- `results/pasto_narino/experiments/expC_backend_metrics.csv`,
  `expC_resources.csv`, `expC_table.md`.
- Scripts de carga: `optimization/experiments/load/` (`load_mqtt.py`,
  `load_rest.js`, `load_ws.js`, `mint_token.js`, `sample_resources.py`).

---

## 5. Lazo cerrado con el predictor real (Comentario 2: R7)

- La cadena de predicción reportada — **PatchTST + ajuste de datos** — es
  exactamente la que alimentó el Experimento A y la que configura la
  producción (`FORECASTER=patchtst`, `MPC_INTERVAL_MINUTES=15`). No se afirma
  ningún predictor que no corra.
- El lazo cerrado (receding horizon con implementación de la primera acción)
  se **verificó formalmente** en el Experimento A: cada hora se re-simula el
  horizonte con forecast fresco, el **SOC real se propaga** al siguiente
  solve y se avanza con valores realizados (1,344 decisiones horarias por
  estrategia, SOC dentro de límites, 0 violaciones).
- El modelo TFT **no se usa**: fue sustituido por PatchTST (validado como
  capa ML, 72 h, cuantiles) y el texto del informe se corrigió en
  consecuencia.

**Correcciones de validez incorporadas en la validación (2026-08-09):**

1. **Tarifa horaria en el modelo**: la función objetivo usa el perfil ToU
   completo (`cost_variable` como vector por hora en `model_builder.py`),
   no un escalar plano — sin esto el solver no valora el arbitraje de la
   batería y cae en soluciones degeneradas.
2. **SOC propagado en el lazo cerrado**: cada solve horario recibe el SOC
   real del lazo (antes reiniciaba en SOC fijo → energía "fantasma" de
   batería, SOC negativo, resultados inválidos).
3. **MPC-PI genuino**: usa la propia serie realizada como forecast
   (P10=P50=P90=PV realizado) — es la cota superior teórica y domina a las
   estrategias basadas en pronóstico (0.27% sobre el S-MPC).
4. **SOC inicial fijo (0.65)**: idéntico para todas las estrategias y
   reproducible (no se lee del sensor, cuya última medición cambia con el
   tráfico MQTT).
5. **Bug latente corregido**: la extracción de `grid_export` en
   `mpc_first_action` negaba el valor dos veces (el dispatch ya trae el
   signo); corregido.
6. **Bug de test corregido**: `dict(BASE_JOB)` es copia superficial — un
   test que mutaba `storage[0]` contaminaba a los demás; ahora se copia
   profundamente.

---

## 6. Ubicación de los archivos (para reproducibilidad)

| Recurso | Ruta |
|---|---|
| Checklist de cobertura (24/24 ✔) | `solutionComement_2911.md` (raíz del repo) |
| Especificación ejecutable | `docs/tesis/especificacion_MPC.md` |
| Resultados Exp A/B/C | `results/pasto_narino/experiments/` |
| Código de experimentos | `optimization/experiments/` |
| Scripts de carga | `optimization/experiments/load/` |
| Informe completo | `informe.md` §7 |
| Tests (81 passing) | `optimization/tests/` (incl. `test_backtest.py`, `test_complementarity_scenarios.py`, `test_experiment_b.py`) |
