# RUNBOOK_VALIDACION — Reproducción manual de los experimentos de la tesis

> Comandos exactos para ejecutar cada validación (Experimentos A, B, C) y sus
> métricas. Resultados reproducibles con `--initial-soc 0.65` y la tarifa ToU
> horaria de `optimization/experiments/config.py`. Documentos de referencia:
> `solutionComement_2911.md` (checklist) y `docs/tesis/validacion_experimental.md`.

---

## 0. Prerrequisitos (una vez)

```bash
cd /home/david/sistema_inteligente_microrredes

# Servicios (Mongo Atlas + Redis Docker + broker MQTT 34.69.148.115)
./dev.sh up

# Dependencias Python
pip install -r optimization/requirements.txt matplotlib tabulate psutil

# Token JWT de prueba para REST/WS (usa SECRET_JWT_SEED de Backend/.env)
TOKEN=$(node optimization/experiments/load/mint_token.js)
echo $TOKEN > /tmp/opencode/load_token.txt
```

### Reinicio del backend con instrumentación

El backend debe correr con `Backend/services/perfMetrics.js` (necesario para
el Experimento C). Tras tocar código del backend:

```bash
pkill -f "nodemon app.js"; pkill -f "node app.js"
cd Backend
setsid nohup nodemon app.js > ../.dev-logs/backend.log 2>&1 < /dev/null & disown
cd ..
# Verificación: la whitelist MQTT debe cargar 9 sensores
grep "Seguridad" .dev-logs/backend.log | tail -1   # → "9 sensores cargados en RAM"
```

> **Bug conocido (ya corregido)**: si la whitelist carga menos de 9, revisar
> `Backend/helpers/securityManager.js` (usa el driver nativo, no `d._id.toString()`).

---

## 1. Tests de validación (siempre primero)

```bash
# Suite completa (85 tests): solver, escenarios, backtest, forecaster, tiempos
python3 -m pytest optimization/tests/ -q

# Solo los de los experimentos
python3 -m pytest optimization/tests/test_backtest.py \
               optimization/tests/test_complementarity_scenarios.py \
               optimization/tests/test_experiment_b.py -q

# Build frontend (integridad)
cd Frontend/GestionFront && yarn build
```

---

## 2. Experimento A — Comparativa económica (R1–R3)

```bash
cd /home/david/sistema_inteligente_microrredes

# Simulación completa: 3 días × 4 estrategias × 24 h (≈5 min) — 14 días ideal ≈30-40 min, no requerido para cierre
python3 -m optimization.experiments.experiment_a --initial-soc 0.65

# Verificación rápida (1 día por estrategia, ≈10 min)
python3 -m optimization.experiments.experiment_a --quick --initial-soc 0.65

# Regenerar SOLO tablas/figuras desde las trazas guardadas (sin re-simular)
python3 -m optimization.experiments.experiment_a --report-only
```

**Parámetros**: `--initial-soc` (default 0.65 — fijo para reproducibilidad;
NO leer del sensor porque su última medición cambia con el tráfico MQTT),
`--days` (default 14), `--quick`, `--report-only`.

**Salidas** (`results/pasto_narino/experiments/`):
`expA_traces_{smpc,dmpc,heur,mpc-pi}.csv` (trazas horarias: acciones, balance,
SOC, costos) · `expA_metrics.csv` (tabla de métricas) ·
`expA_cumulative_cost.csv` · `expA_figures.png` (2 paneles) ·
`expA_table.md` (tabla + conclusiones + discusión, listo para el paper).

**Verificación de validez de las trazas** (el SOC debe quedar en [40, 190] y
la batería debe arbitrar valle→pico):

```bash
python3 -c "
import pandas as pd
t = pd.read_csv('results/pasto_narino/experiments/expA_traces_smpc.csv')
print('SOC min/max:', t['soc_kwh'].min(), t['soc_kwh'].max())
print('carga/dia:', round(t['charge_kw'].sum()/14,1), '| descarga/dia:', round(t['discharge_kw'].sum()/14,1))
"
```

---

## 3. Experimento B — Tiempo de cómputo del MPC (R4)

```bash
# 120 ciclos build+solve del MILP completo de producción (≈3-5 min)
python3 -m optimization.experiments.experiment_b_solver_time --cycles 120
```

**Salidas**: `expB_solver_times.csv` (`t_build`/`t_solve`/`t_total`
p50/p95/p99/max + margen vs 900 s) y `expB_hardware.json` (CPU/RAM/Gurobi/
Pyomo/Python declarados).

**Importante**: ejecutar SIEMPRE después de tocar `model_builder.py` — los
tiempos deben corresponder al modelo exacto desplegado (hoy: tarifa ToU
horaria + complementariedad big-M).

---

## 4. Experimento C — Rendimiento bajo carga (R5, R6)

Orden recomendado (los pasos 1-3 en paralelo, con `setsid nohup ... & disown`
para que sobrevivan al shell):

```bash
cd /home/david/sistema_inteligente_microrredes
TOKEN=$(cat /tmp/opencode/load_token.txt)

# 0) Resetear métricas del backend
curl -s -H "x-token: $TOKEN" "http://localhost:3000/api/front/performance?reset=1"

# 1) Carga MQTT (10 msg/s, 5 min, topics reales de la whitelist)
setsid nohup python3 -m optimization.experiments.load.load_mqtt \
    --rate 10 --duration 300 --broker mqtt://34.69.148.115 \
    > .dev-logs/expC_mqtt.log 2>&1 < /dev/null & disown

# 2) Cliente WebSocket (latencia push; se une a las rooms de sensores)
setsid nohup node optimization/experiments/load/load_ws.js "$TOKEN" \
    --event sensor_update --cycles 400 > .dev-logs/expC_ws.log 2>&1 < /dev/null & disown

# 3) Muestreo de recursos (CPU/RAM de Node/uvicorn/redis, 5-10 min)
setsid nohup python3 -m optimization.experiments.load.sample_resources \
    --duration 300 --interval 5 > .dev-logs/expC_resources.log 2>&1 < /dev/null & disown

# 4) REST: 50 conexiones concurrentes (DURANTE la carga MQTT)
node optimization/experiments/load/load_rest.js "$TOKEN" --concurrent 50 --duration 30

# 5) Snapshot final de métricas del backend (tras terminar MQTT/WS)
curl -s -H "x-token: $TOKEN" http://localhost:3000/api/front/performance \
    > /tmp/opencode/perf_final.json
```

**Validaciones post-carga**:

```bash
# MQTT: "Publicados 3000 msgs ... 10.00 msg/s (errores 0)"
tail -1 .dev-logs/expC_mqtt.log
# WS: JSON con push_latency_ms (400 eventos)
tail -8 .dev-logs/expC_ws.log
# Sin bloqueos de whitelist durante la carga
grep -c "Bloqueado" .dev-logs/backend.log
```

**Salidas**:
- `expC_resources.csv` — muestreo de recursos (backend_node, uvicorn, redis).
- `/tmp/opencode/perf_final.json` — snapshot del backend (`mqtt_latency_end_to_end_ms`,
  `mongo_insert_ms`, `ws_push_ms`, memoria RSS, uptime).
- stdout de `load_ws.js` / `load_rest.js` — latencias E2E cliente y REST.
- La tabla consolidada del paper: `expC_table.md` (los valores CSV se extraen
  del snapshot JSON con el script Python usado en la sesión de validación).

---

## 5. Orden de reproducción completa (plantilla)

```bash
cd /home/david/sistema_inteligente_microrredes
./dev.sh up                                   # servicios
python3 -m pytest optimization/tests/ -q      # 1) tests (85)
python3 -m optimization.experiments.experiment_a --initial-soc 0.65   # 2) Exp A
python3 -m optimization.experiments.experiment_b_solver_time --cycles 120  # 3) Exp B
# 4) Exp C: pasos 0-5 de la sección 4
```

Los archivos de resultados se escriben en `results/pasto_narino/experiments/`
y los documentos del paper (`informe.md` §7, `docs/tesis/validacion_experimental.md`)
se actualizan con los números finales tras cada corrida.

---

## Notas de reproducibilidad

- **SOC inicial fijo 0.65** (`--initial-soc`): idéntico para las 4 estrategias
  y reproducible. El sensor `pasto_bess` no se usa como fuente porque su
  última medición cambia con el tráfico MQTT.
- **Datos**: demanda y PV realizados de Mongo (`pasto_load`, `pasto_solar_pv`);
  clima realizado ERA5 (Open-Meteo archive); forecast PatchTST con contexto
  Open-Meteo `past_days` que termina antes de cada hora de decisión.
- **Tarifas ToU**: valle 45 / media 80 / pico 140 COP/kWh (fijo 40 COP/h) en
  `optimization/experiments/config.py`.
- **Red como slack**: importación máx 400 kW, exportación máx −300 kW;
  excedente recortado (no cuenta como violación).
- La primera acción implementada sale del **escenario base (P50/Nublado)** y
  el **SOC se propaga** entre horas (acciones físicamente realizables).
