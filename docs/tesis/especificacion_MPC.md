# Especificación MPC — Respuesta a los comentarios del revisor

> Documento de especificación para implementación. Fuente: citas textuales exactas del revisor
> (comentarios 2, 9 y 11 de la revisión de la tesis SIGE).

---

## 1. Lo que dice el revisor (texto exacto, sin editar)

**Comentario 2** (sobre el lazo cerrado):
> "There is a temporal inconsistency in the coupling between the prediction model and MPC - MPC recalculates for 24-hour prospective optimization every 15 minutes, but the TFT prediction model is still in an 'offline training, not integrated into the production environment' state, currently running using the 'MatlabPredictor based on preprocessed historical time series'. Therefore, the 'TFT integration and random MPC closed-loop' claimed in the paper has not been implemented in actual verification, and the experimental results reflect the performance of deterministic MPC (based on historical averages) rather than random MPC."

**Comentario 9** (el que define el experimento económico):
> "The MPC optimization results (Figure 7-8) only show the scheduling scheme for a single execution cycle (24-hour foresight), without providing comparative experiments with deterministic optimization, heuristic rules, or other baseline strategies (such as total cost differences, renewable energy utilization rates, battery cycle times, etc.), which cannot prove the actual economic benefits of random MPC compared to simple strategies."

**Comentario 11** (el que define el rendimiento):
> "The system performance indicators (such as MPC computation time, MQTT message latency, database write throughput, WebSocket push latency, etc.) have not been reported - the current experimental verification only shows a visual interface screenshot of a single optimization result, lacking a quantitative evaluation of the response time, concurrent processing capability, and resource consumption of the entire platform under load conditions, which cannot prove that the system meets the claims of 'low latency' and 'real-time'."

---

## 2. Qué pide medir exactamente (traducción a requisitos)

| # | Requisito | Comentario |
|---|---|---|
| R1 | **Comparativas**: MPC estocástico vs optimización determinista vs reglas heurísticas (u otras estrategias baseline) | 9 |
| R2 | **Métricas económicas**: diferencias de costo total, tasa de utilización de renovables, ciclos de batería, etc. | 9 |
| R3 | **Demostrar el beneficio económico real** del MPC estocástico sobre estrategias simples (no solo un ciclo de 24h) | 9 |
| R4 | **Tiempo de cómputo del MPC** (explícitamente listado) | 11 |
| R5 | Latencia MQTT, throughput de escritura en BD, latencia de push WebSocket | 11 |
| R6 | **Evaluación cuantitativa bajo carga**: tiempo de respuesta, capacidad de concurrencia, consumo de recursos de toda la plataforma | 11 |
| R7 | Que los resultados reflejen el lazo cerrado **real** (el predictor que efectivamente corre en producción, no uno declarado) | 2 |

---

## 3. Especificación ejecutable

### Experimento A — Comparativa económica (R1, R2, R3)

**Entrada:**
- Datos históricos reales del sitio (mínimo 14 días, ideal 30): series horarias de GHI observado, temperatura, demanda, tarifas de red (C_fijo, C_var por hora), precios de diésel.
- Modelo Pyomo (con restricción de complementariedad Ecs. 4–6), horizonte 24h, resolución horaria, S escenarios.
- Generador de escenarios: a partir de los cuantiles P10/P50/P90 del PatchTST (o del proveedor que corra en producción), con método documentado (número de escenarios, muestreo, prob[s]).

**Procedimiento (simulación en lazo cerrado):**
1. Para cada día `d` del periodo de prueba:
   - Emitir forecast 24h (P10/P50/P90) con contexto que termina antes del día.
   - Generar escenarios de GHI → potencia solar por escenario (modelo PV calibrado).
   - Resolver el MPC → aplicar **solo la primera acción** (receding horizon, igual que producción).
   - Pasar al siguiente paso temporal con el estado real (SoC real, demanda real, GHI real).
2. Ejecutar el mismo bucle con las 3 estrategias sobre **los mismos días y el mismo estado inicial**:
   - **S-MPC**: estocástico con S escenarios ponderados por prob[s].
   - **D-MPC**: determinista, S=1 (solo P50).
   - **HEUR**: regla heurística definida (p. ej., priority list: PV primero → batería si SoC > umbral y red cara → diésel → red).
3. **Opcional**: variante "oráculo" (forecast perfecto) como cota superior.

**Métricas por estrategia (definiciones exactas, agregadas sobre todo el periodo):**
- `Costo_total = Σ_d Σ_t [ (c_d + b_d·P_d + a_d·P_d²)·C_comb + C_fijo + C_var·P_grid + deg·(P_ch + P_dis) ]` (evaluada con los valores **realizados**)
- `Costo_diario_medio = mean(Costo_total_d) ± std`
- `Tasa_uso_renovables = Σ energía PV consumida / Σ energía de carga (×100%)`
- `Ciclos_batería = Σ |P_ch| + |P_dis| / (2·Capacidad)`
- `Energía_importada_red [kWh]`, `Combustible_diésel [L]`
- `Violaciones = Σ horas con balance no satisfecho` (debe ser 0 en todas)

**Salida:**
- Tabla: filas = estrategias, columnas = todas las métricas (media ± std diario).
- Figura: costo acumulado vs día, o barras de costo por estrategia.
- **Conclusión exigible**: X% de reducción de costo del S-MPC vs D-MPC y vs HEUR — con los números reales.

### Experimento B — Tiempo de cómputo del MPC (R4)

**Procedimiento:**
1. En el hardware de despliegue (declarar: CPU, RAM, versión Gurobi, licencia, versión Python/Pyomo).
2. Ejecutar ≥ 100 ciclos de resolución del modelo **completo** (24h, S escenarios, con binarias):
   - `t_build`: tiempo de construcción del modelo Pyomo
   - `t_solve`: tiempo de resolución Gurobi
   - `t_total = t_build + t_solve`
3. Reportar **p50, p95, p99 y máximo** de `t_total`, y comparar con el intervalo de control (900 s): margen = 900 / t_p95.
4. Reportar también la relajación LP con HiGHS (cota inferior) si el solver comercial no está disponible.

**Salida:** fila "MPC solver" en la tabla de rendimiento, con hardware declarado.

### Experimento C — Rendimiento bajo carga (R5, R6)

**Procedimiento:**
1. **MQTT**: N dispositivos simulados (10–50 medidores a 1 Hz) publicando a topics reales; latencia publicación→recepción end-to-end (p50/p95/p99) y throughput sostenido (msg/s).
2. **MongoDB**: latencia de inserción (p50/p95/p99) y writes/s bajo la misma carga.
3. **WebSocket/Socket.IO**: latencia backend→frontend (p50/p95/p99) sobre eventos reales (20 ciclos de optimización).
4. **REST API**: prueba de concurrencia (50 conexiones simultáneas) → requests/s y latencias.
5. **Recursos**: CPU/RAM de cada servicio (Node, Python, Redis, MongoDB) durante carga sostenida (10 min).

**Salida:** tabla de rendimiento completa (sin celdas vacías ni contradicciones de texto).

### Condición transversal (R7 — comentario 2)

- El experimento A debe ejecutarse con **el predictor que efectivamente alimenta el MPC en la configuración reportada**. El texto debe decir exactamente qué corrió — **nunca** afirmar un lazo que no se ejecutó.

---

## 4. Contexto del sistema (configuración reportada)

- **Cadena de predicción en producción**: PatchTST (72 h, P10/P50/P90) + ajuste de datos (calibración de plantas PV/load contra sensores reales). TFT NO se usa.
- **Forecast context**: Open-Meteo `past_days` (observación NWP reciente, sin latencia ERA5), pronóstico anclado a la hora actual.
- **Datos de prueba**: clima real ERA5 archive del sitio + demanda real de Mongo (`pasto_load`, 5 min, 2026-07-17 → 2026-08-01).
- **Tarifas**: perfil ToU horario documentado (pico/valle), reemplaza las fijas 40/60 hardcodeadas.
