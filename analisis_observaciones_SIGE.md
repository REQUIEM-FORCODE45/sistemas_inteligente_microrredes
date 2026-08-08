# ANÁLISIS EXHAUSTIVO DE OBSERVACIONES — Paper SIGE
**Paper**: "Real-Time Intelligent Energy Management System for Microgrid Operation"
**Autores**: David Díaz, Darío Solarte, Javier Revelo-Fuelagán (Universidad de Nariño, Colombia)
**Fuente analizada**: `Downloads/SIGE.pdf` (13 páginas, versión August 6, 2026)
**Revisor**: 1 (11 comentarios) + checklist editorial (I–V)

---

## 0. Resumen ejecutivo

| Tipo de corrección | Comentarios | Esfuerzo |
|---|---|---|
| **Solo texto** (reescribir/reformular en el manuscrito) | 2, 5, 6, 7 | Bajo — lo redacto yo |
| **Texto + cambio de código** (formulación matemática, detector) | 1, 3, 4 | Medio — código + re-correr figuras |
| **Requiere experimentos nuevos** (métricas, comparativas, benchmarks) | 8, 9, 10, 11 | Alto — depende de sus datos/código |
| **Hallazgos adicionales** (refs sin citar, formato, placeholders) | — | Bajo |

**Hallazgo crítico verificando el PDF**: el documento NO contiene ninguna tabla (lo confirmé con análisis de bajo nivel del PDF: `find_tables()` no detecta ninguna, y la palabra "Table" solo aparece en la descripción de la UI y en el título de una referencia). El comentario 6 del revisor sobre "Table 1" es real: **la tabla que el texto referencia no existe en el PDF** (probablemente se perdió al exportar desde Word, o el texto cita mal). Hay que crearla.

**Hallazgo adicional importante**: las referencias **[14]–[17] no están citadas en ningún lugar del texto** (verifiqué todo el cuerpo). Violan el checklist editorial (I) "Ensure all references are relevant". Hay que citarlas en la nueva revisión de literatura o eliminarlas.

---

## 1. Comentario 1 — No se explica la generación de escenarios estocásticos

### Qué dice el revisor
La Ec. (1) usa `prob[s]` (probabilidad ponderada de escenarios) pero no se dice: número de escenarios, método de generación (¿muestreo de distribución histórica de errores? ¿Monte Carlo? ¿Quantile sampling?), ni cómo se estiman las probabilidades. El "random optimization" queda como caja negra.

### Dónde está en el paper
- **Pág. 5–6, Sección 2.1** (líneas MDPI 161–166): "Solar generation is modeled as a pre-calculated stochastic parameter based on irradiance predictions and scenario factors, injected directly into the power balance constraint" — única mención, vaga.
- **Ec. (1), pág. 6**: `min Σ_s prob[s] · Σ_t [ Σ_d (c_d + b_d·P_d + a_d·P_d²)·C_comb + (C_fijo + C_var·P_grid) + Σ_b deg(P_ch + P_dis) ]`

### Corrección propuesta
Agregar una subsección **"2.1.2 Scenario generation"** (o un párrafo dentro de 2.1) que defina formalmente:

1. **Número de escenarios**: S = 20 (o el que realmente usen — verificar en código).
2. **Método de generación** (elegir el que corresponda a su implementación real):
   - **Recomendado (correcto y publicable)**: muestreo de la distribución empírica del error de pronóstico. Con el TFT: cuantiles P10/P50/P90 por paso → ajustar una distribución por hora (normal asimétrica o empírica) → muestrear S trayectorias con **Latin Hypercube Sampling / antithetic sampling** (reduce varianza, reproducible con seed).
   - Alternativa simple si el predictor actual (Matlab) es determinista: escenarios por **factores multiplicativos** sobre la serie puntual, muestreados de la distribución histórica de la razón GHI_real/GHI_pronóstico por franja horaria.
3. **Estimación de probabilidades**: `prob[s] = 1/S` (equiprobables, justificación: muestreo i.i.d.) o estimadas por frecuencia de cluster (días claros/nublados/lluviosos).
4. **Aclaración clave**: con S = 1 el modelo se reduce al determinista — esto conecta con los comentarios 2 y 9.
5. Definir en el texto todas las constantes de la Ec. (1): `C_comb` (costo combustible), `C_fijo`/`C_var` (tarifa de red), `deg` (penalidad de degradación).

> ⚠️ **Verificar en su código** cuál es el método real. El revisor exige transparencia; inventar un método que no esté implementado es el peor error posible en una revisión.

---

## 2. Comentario 2 — Inconsistencia temporal: TFT offline vs MPC en producción

### Qué dice el revisor
El MPC recalcula 24 h cada 15 min, pero el TFT está "offline, no integrado en producción" — corre el **MatlabPredictor** con series históricas. Por lo tanto el lazo cerrado "TFT + MPC estocástico" **no se verificó**; los resultados experimentales (Figs. 7–8) reflejan MPC **determinista** basado en promedios históricos, no MPC estocástico.

### Dónde está en el paper (y el problema)
- **Abstract (pág. 1, líneas 8–10)**: "obtains solar irradiance and energy demand forecasts from stored historical series, and performs the economic dispatch management ... in Pyomo with Gurobi" — implícitamente promete el lazo completo.
- **Intro (pág. 2, líneas 35–37)**: "(2) multi-horizon time-series forecasting ... including a Temporal Fusion Transformer (TFT) model trained offline" — "trained offline" + integración progresiva: ambiguo.
- **Sección 2.1 (pág. 5, líneas 140–143)**: "The integration of these uncertainty quantiles into the MPC loop **replaces the current deterministic approach with a stochastic one**" — **afirmación que no corresponde a lo verificado**.
- **Sección 3 (pág. 10, líneas 264–267)**: Fig. 9 presentada como "offline training phase".
- **Discusión (pág. 11, líneas 300–305)**: admite honestamente que "the MPC cycle operates using the historical series-based predictor implemented in Matlab, while the TFT model remains decoupled from the production environment".

El revisor tiene toda la razón: el paper hace claims en Abstract/Intro/Sección 2 que la propia Discusión desmiente.

### Corrección propuesta (dos niveles, decidir estrategia)

**Nivel A — Honestidad académica (obligatorio, mínimo)**: alinear TODO el discurso:
1. **Abstract**: reformular para decir: la plataforma integra pronóstico modular (predictor en producción basado en series históricas; TFT entrenado y validado offline como implementación avanzada), y el MPC estocástico se valida con escenarios derivados de los pronósticos disponibles.
2. **Intro, contribución 2**: "la integración de pronósticos multi-horizonte en un lazo de control predictivo estocástico, con arquitectura modular que permite la incorporación progresiva de modelos ML" (no afirmar que el TFT ya está en el lazo).
3. **Sección 2.1, línea 140–143**: reescribir: los cuantiles de incertidumbre **permiten** reemplazar el enfoque determinista — describirlo como capacidad de la arquitectura, con el TFT como implementación validada offline.
4. **Sección 3**: etiquetar Figs. 7–8 como resultados del ciclo MPC con el predictor en producción; aclarar si los escenarios usados son estocásticos o deterministas (verificar código: si MatlabPredictor = promedio histórico → el MPC es determinista y hay que decirlo; el revisor ya lo asume).
5. **Discusión**: mantener la honestidad pero enmarcarla como fortaleza de diseño (arquitectura modular que permite canjear predictores sin tocar el orquestador).

**Nivel B — Fortalecer con evidencia (recomendado si hay tiempo, 10 días)**: integrar el TFT de verdad al lazo para el experimento final: `TFTPredictor` → cuantiles → escenarios → MPC → comparar contra el ciclo con MatlabPredictor. Esto convierte el comentario 2 en un resultado positivo ("se demostró la integración") y alimenta los comentarios 8 y 9 con un experimento único. Requiere: checkpoint TFT, servicio FastAPI de predicción, y correr el ciclo cerrado sobre N días de datos reales.

---

## 3. Comentario 3 — SOC sin restricciones de complementariedad (carga/descarga simultánea)

### Qué dice el revisor
Las Ecs. (2)–(3) incluyen términos de carga Y descarga en la misma ecuación; sin una restricción complementaria (`Pch·Pdis = 0`) o variables binarias, el modelo puede cargar y descargar a la vez para manipular el SOC sin intercambio neto — viola la física.

### Dónde está en el paper
- **Pág. 6, Ecs. (2)–(3)** (líneas MDPI 177–179):
  - `SOC[b,0,s] = SOC_ini[b] + η_ch[b]·P_ch[b,0,s] − P_dis[b,0,s]/η_dis[b]`
  - `SOC[b,t,s] = SOC[b,t−1,s] + η_ch[b]·P_ch[b,t,s] − P_dis[b,t,s]/η_dis[b]`, t > 0

### Corrección propuesta
1. **Código (Pyomo)**: agregar la restricción de complementariedad. Dos opciones:
   - **Binarias (recomendado con Gurobi/HiGHS)**: `y_ch[b,t,s] ∈ {0,1}`, `y_ch + y_dis ≤ 1`, `P_ch ≤ P_ch_max·y_ch`, `P_dis ≤ P_dis_max·y_dis`.
   - No-lineal directa: `P_ch[b,t,s] · P_dis[b,t,s] = 0` (con Gurobi funciona, pero binarias son más robustas).
2. **Manuscrito**: agregar la restricción como **Ec. (4)** con su explicación, y un comentario: aunque la función objetivo penaliza ambos términos (`deg > 0`) y el balance depende de la diferencia, la restricción explícita garantiza factibilidad física.
3. **Verificar**: re-correr las Figs. 7–8 tras el cambio. Si las soluciones óptimas ya no tenían simultaneidad (esperable por el objetivo), decirlo en la respuesta al revisor: "la restricción se añadió como garantía formal; los resultados se mantienen/varían en X".

---

## 4. Comentario 4 — Rate of change: división por cero y umbrales sin justificación

### Qué dice el revisor
La estrategia usa `|(x_t − x_{t−1})/x_{t−1}|`; cuando `x_{t−1} = 0` (p. ej., PV de noche) hay división por cero. Además el umbral fijo de 50% no distingue variables (variación de voltaje vs. pico de potencia) — falta diseño de umbrales adaptativos por variable.

### Dónde está en el paper
- **Pág. 6–7, Sección 2.2, estrategia 2** (líneas 194–197): "Rate of change: Calculates the relative variation ... |(xt − xt−1)/xt−1| ... defaulted to 50%".

### Corrección propuesta
1. **Protección contra división por cero** (código + texto):
   - Si `|x_{t−1}| < ε` (ε = 1% del rango nominal de la variable, p. ej. 0.05 kW para medidores de 5 kW), usar **cambio absoluto** `|x_t − x_{t−1}|` comparado contra un umbral absoluto derivado del historial (p. ej. percentil 99 del cambio absoluto en ventana móvil), o declarar la lectura como no evaluable para esta estrategia (las otras dos siguen activas).
2. **Umbrales por variable (adaptativos)**:
   - Definir en el texto una tabla de umbrales por tipo de variable con justificación física: voltaje ±10% (regulación), potencia ±50% (rampas normales de PV/demanda), corriente ±50%, SOC ±20% (limitado por el BMS). 
   - Mejor aún: umbral dinámico = percentil 99 de la distribución histórica del cambio relativo por variable y franja horaria (ventana de 7 días), con cota mínima por variable.
3. En la respuesta al revisor: reportar el ε elegido y un ejemplo numérico (noche, PV = 0 → sin falsas alarmas; verificado en datos reales).

---

## 5. Comentario 5 — Profundidad de integración (innovación)

### Qué dice el revisor
Los tres módulos (TFT, Pyomo/Gurobi MPC estocástico, LLM multi-agente) son aplicaciones directas de tecnologías maduras; el acoplamiento es solo a nivel de flujo de datos (predicción → optimización → visualización); falta diseño conjunto profundo (p. ej., propagación end-to-end de la incertidumbre de predicción hacia los escenarios de optimización, lazo adaptativo cerrado LLM→control). Innovación de integración limitada.

### Dónde está en el paper
- Abstract (pág. 1), Intro contribuciones (pág. 2, líneas 70–76), Discusión (pág. 11).

### Corrección propuesta (la más estratégica del documento)
1. **Formalizar la propagación de incertidumbre como diseño conjunto (texto nuevo en Sección 2.1.2)**:
   - Describir explícitamente la cadena: cuantiles del TFT (P10/P50/P90) → distribución del error por paso → muestreo de escenarios → probabilidades → MPC estocástico. Esto ES "end-to-end uncertainty propagation from prediction to optimization scenarios" — lo que el revisor pide. Acompañarlo de una **figura nueva**: diagrama de flujo de incertidumbre (predictor → distribución → escenarios → MPC → acción).
   - Definir la métrica de cobertura de cuantiles (QCP) como vínculo verificable entre la calidad del pronóstico y la calibración de los escenarios.
2. **Lazo LLM→decisión con capa de seguridad (texto nuevo en 2.2.1)**:
   - Declarar el principio: **el LLM es consultivo, nunca ejecuta control**; las acciones de control las genera el MPC y las confirma el operador. El LLM ajusta parámetros del MPC solo dentro de un espacio acotado y validado (p. ej., recomendación → verificación numérica → sugerencia al operador con justificación). Esto convierte "flujo de datos" en "lazo adaptativo con supervisión" y responde simultáneamente al comentario 10.
3. **Posicionamiento honesto en Discusión**: la contribución central es la **integración sistémica en lazo cerrado sobre datos reales de IoT** (MQTT→MongoDB→forecast→MPC→WebSocket→LLM) con arquitectura modular desacoplada y verificable — no el desarrollo de cada componente. Y una limitación explícita: la profundidad del diseño conjunto está acotada por la etapa actual de validación (ver comentario 2), con el camino de profundización ya trazado (propagación de incertidumbre + lazo LLM validado).
4. **Opcional (fuerte)**: implementar un mecanismo concreto de lazo LLM→MPC: el diagnóstico del LLM ajusta la penalidad `deg` de degradación de batería o el límite de SoC dentro de rangos predefinidos y validados por esquema — un experimento de "recomendación del LLM cambia la operación" con comparación antes/después.

---

## 6. Comentario 6 — Table 1 inexistente/mal referenciada + literatura floja

### Qué dice el revisor
La anotación de posición de Table 1 es incorrecta — la referencia "as shown in Figure 1" en el texto principal no aparece en Table 1; la revisión de literatura (Sección 1) es suelta: lista trabajos representativos por campo sin identificar sistemáticamente la relación gap→contribución; el "gap" del Intro no conecta con los métodos.

### Verificación técnica (hecha)
- El PDF **no contiene ninguna tabla** (ni Table 1 ni ninguna otra). La única mención de "table" es la UI ("energy meter tables").
- El texto "as shown in Figure 1" (pág. 3, línea 89) se refiere a la arquitectura y ES correcto. Lo que falta es la tabla de literatura que el manuscrito original presumiblemente tenía.
- **Revisar el .docx/.tex original**: si la tabla existía en Word y no se exportó, es un bug de exportación; si nunca existió, hay que crearla.

### Corrección propuesta
1. **Reestructurar la revisión de literatura** (Sección 1) en 4 párrafos temáticos con transición explícita: (a) forecasting de series de energía (TFT [1], reviews [9,10]); (b) optimización estocástica y MPC (Birge [5], Parisio [14], Su [15], Zia [16], Hua [17]); (c) operación resiliente/segura (Han et al. — comentario 7); (d) LLM/IA en infraestructura (LangChain [7], Lami [11]).
2. **Crear la Tabla 1**: "Synthesis of related work, research gaps, and SIGE contributions", columnas: *Referencia | Área | Método | Limitación (gap) | Cómo lo aborda SIGE*. Filas: [1], [9,10], [5,15], [4,14], [16], [17], [11], [7], [Han 2026], [12]. Con la fila final "This work".
3. **Citar la tabla correctamente** en el texto: "...as summarized in Table 1..." al cierre de la revisión de literatura.
4. **Párrafo de transición gap→contribuciones** al final de la Sección 1: mapear cada gap de la tabla con cada contribución (1:1 con la lista de contribuciones del Intro).
5. **Citar las referencias [14]–[17]** en los párrafos (b) — resuelve el checklist (I).

---

## 7. Comentario 7 — Agregar referencia de optimización resiliente bajo ataques

### Qué pide el revisor
Agregar trabajos recientes de "secure optimization under attacks", específicamente: *Resilient Optimal Dispatch of Ship-Integrated Energy System and Air Lubrication Using an Enhanced Traffic Jam Optimizer*, Journal of Marine Science and Engineering.

### Referencia encontrada (Crossref, verificado)
> Han, W.; Cui, J.; Wang, X.; Chen, X. Resilient Optimal Dispatch of Ship-Integrated Energy System and Air Lubrication Using an Enhanced Traffic Jam Optimizer. *J. Mar. Sci. Eng.* **2026**, *14*(9), 779. DOI: 10.3390/jmse14090779.

### Corrección propuesta
1. Agregarla al final del párrafo de optimización de la Sección 1 (o en el nuevo párrafo (c) de resiliencia): conectar con SIGE — la operación óptima debe ser **resiliente ante perturbaciones y ataques ciberfísicos** (medidores comprometidos, inyección de datos falsos); la detección multidimensional de anomalías de SIGE + la supervisión del LLM constituyen la capa de resiliencia que complementa el dispatch óptimo.
2. Incluirla en la Tabla 1 (fila de resiliencia).
3. Redacción sugerida (lista para pegar):
   > "Beyond economic optimality, recent work emphasizes resilient operation under cyber-physical disturbances: Han et al. [18] propose a resilient optimal dispatch strategy for ship-integrated energy systems based on an enhanced traffic jam optimizer, addressing degraded operating conditions. In SIGE, resilience is addressed at the data layer: the multidimensional statistical anomaly detection (Section 2.2) and the LLM-based supervisory layer identify compromised or erroneous measurements before they propagate into the optimization loop, complementing the economic dispatch with a security-aware operating envelope."
4. Renumerar las referencias nuevas (la tabla de literatura añadirá varias).

---

## 8. Comentario 8 — TFT sin métricas cuantitativas ni baselines

### Qué dice el revisor
La Fig. 9 solo muestra comparación visual predicción vs. realidad; sin MAE/RMSE/MAPE/cobertura de cuantiles, ni comparación con baselines (ARIMA, LSTM, persistencia) — no se puede saber si el TFT supera alternativas simples en este escenario.

### Dónde está en el paper
- **Pág. 10, Fig. 9** (líneas 264–269): "(a) Solar generation, (b) Voltage". El texto solo dice "reproduce the general trend... most observations within the uncertainty intervals" — sin números.

### Corrección propuesta (requiere ejecutar evaluación)
1. **Nueva tabla (Table 2)**: métricas por variable pronosticada (irradiancia/GHI y demanda — alinear con el abstract; si solo tienen generación solar y voltaje, reportar esas y justificar):
   - MAE, RMSE, sMAPE (o MAPE), Pinball loss (P50), **cobertura empírica de cuantiles** (P10–P90) — esta última es clave porque valida la cadena hacia el MPC estocástico (comentario 1).
   - **Baselines**: persistencia (naive: ŷ_{t+h} = y_t), ARIMA (auto), LSTM (misma arquitectura básica), y TFT. Reportar el split usado (train/val/test, sin leakage).
2. **Ojo con los datos**: entrenaron con **20 días** horarios (~480 puntos). Es muy poco para TFT; si las métricas son malas, las opciones son: (a) ampliar el dataset desde MongoDB/Open-Meteo (¿tienen más historial? — el sistema lleva operando, probablemente sí; usar ≥ 3–6 meses), (b) reportar honestamente con los baselines demostrando que incluso con datos limitados el TFT compite (eso también es un resultado). NO ocultar métricas malas.
3. Yo puedo: escribir el script de evaluación + baselines si me pasan el checkpoint/datos, o re-entrenar. Su proyecto tesis-microrred ya tiene pipeline de evaluación (PatchTST, pero la estructura de métricas sirve).
4. Añadir 1–2 frases en el texto de la Sección 3 citando la tabla y discutiendo la cobertura de cuantiles (conecta con comentarios 1 y 5).

---

## 9. Comentario 9 — MPC sin comparativas con baselines

### Qué dice el revisor
Las Figs. 7–8 muestran un solo ciclo de ejecución (24 h de foresight) sin comparación con optimización determinista, reglas heurísticas u otras estrategias (diferencias de costo total, uso de renovables, ciclos de batería) — no se demuestran los beneficios económicos del MPC estocástico.

### Dónde está en el paper
- **Pág. 9–10, Figs. 7–8** (líneas 248–262).

### Corrección propuesta (requiere ejecutar experimentos)
1. **Experimento de simulación en lazo cerrado sobre N días de datos reales** (N ≥ 7, ideal 30): para cada día, correr el ciclo MPC con receding horizon (recalcular cada hora, aplicar primera acción — o cada 15 min si el cómputo lo permite) y acumular costo/energía.
2. **Estrategias comparadas**:
   - MPC estocástico (S escenarios) — el propuesto.
   - MPC determinista (S = 1, pronóstico puntual).
   - Heurística de referencia: p. ej., *priority list* (PV primero → batería si SoC > umbral y precio de red alto → diesel → red) o *load-following* simple.
3. **Métricas por estrategia** (tabla nueva + figura de barras): costo total de operación ($/día promedio), % de energía renovable utilizada, ciclos equivalentes de batería / degradación acumulada, energía importada de red, y (si aplica) violaciones de balance.
4. **Interpretación esperada**: el MPC estocástico debe mostrar menor costo que el determinista (por escenarios de cola) y ambos superiores a la heurística — si los resultados no salen así, reportarlos igual (la honestidad es defendible; el revisor pidió la comparación, no un resultado específico).
5. Yo puedo escribir el script de simulación si me pasan el modelo Pyomo + datos (o montarlo sobre su repo).

---

## 10. Comentario 10 — Validación del LLM insuficiente + riesgo de seguridad

### Qué dice el revisor
La "validación" del sistema multi-agente LLM se limita a chequear integridad estructural contra esquemas Zod; sin evaluación cuantitativa de precisión/utilidad/seguridad del diagnóstico; riesgo serio de alucinación en control de sistemas de potencia — desplegar recomendaciones de control generadas por LLM sin validación de seguridad es un peligro de ingeniería.

### Dónde está en el paper
- **Pág. 7, Sección 2.2.1** (líneas 214–216): "The LLM responses are validated against Zod schemas to ensure their structural integrity before being transmitted to the frontend via Socket.IO."
- **Discusión (pág. 11, líneas 307–314)**: ya admite la limitación (bueno, pero hay que convertirla en evidencia).

### Corrección propuesta (texto + evaluación)
1. **Principio de seguridad (texto nuevo, obligatorio)**: declarar explícitamente que el LLM **no tiene capacidad de ejecutar acciones de control**: su salida es una recomendación consultiva; el lazo de control físico lo ejecuta exclusivamente el MPC (y el operador humano confirma acciones). El LLM está fuera del camino de datos del control (solo lee el estado y las alertas). Esto desactiva el argumento de peligro directo.
2. **Validación multicapa (texto + código)**: además de Zod: (a) *allowlist* de tipos de acción recomendables (solo los definidos en el sistema); (b) verificación numérica: los valores recomendados deben estar dentro de rangos físicos verificables contra los datos de entrada; (c) auditoría: toda recomendación se registra con su justificación y se puede rastrear; (d) el frontend muestra las recomendaciones como sugerencias, con confirmación del operador antes de cualquier efecto.
3. **Evaluación cuantitativa (nueva subsección de Resultados — requiere ejecutar)**:
   - Construir un **set de prueba etiquetado**: ~50–100 eventos: normales (para medir falsos positivos), anomalías inyectadas de cada estrategia (umbral/rate/z-score), y fallos reales históricos si existen.
   - Métricas: precisión del diagnóstico (correcto/parcial/incorrecto vs. etiqueta), tasa de falsos positivos, cobertura de fallos reales, latencia de respuesta (p50/p95), y tasa de respuestas rechazadas por validación.
   - Ideal: mini-estudio con operadores (n = 3–5) sobre utilidad percibida — si no da tiempo en 10 días, proponerlo como trabajo futuro y reportar las métricas objetivas.
4. Yo puedo: redactar el protocolo y escribir el script de evaluación (necesitarán API key Groq/OpenAI y los eventos etiquetados).

---

## 11. Comentario 11 — Sin indicadores de rendimiento del sistema

### Qué dice el revisor
No se reportan métricas de rendimiento (tiempo de cómputo del MPC, latencia de mensajes MQTT, throughput de escritura en BD, latencia de push WebSocket, etc.); la verificación experimental es solo un screenshot de UI de un ciclo; sin evaluación cuantitativa de tiempos de respuesta, concurrencia y consumo de recursos bajo carga, no se puede afirmar "low latency" ni "real-time".

### Dónde está en el paper
- **Sección 3 completa** (págs. 8–11): no hay ninguna métrica de rendimiento; el Abstract y las Conclusiones (líneas 322–328) afirman "low latencies" / "15-minute intervals" sin soporte.

### Corrección propuesta (nueva subsección 3.x "System performance" — requiere ejecutar benchmarks)
Medir y reportar en tabla (con hardware y versión de software declarados):
1. **MQTT end-to-end**: latencia publicación → recepción (p50/p95/p99) con N dispositivos simulados (p. ej., 10–50 medidores publicando a 1 Hz); throughput (msg/s sostenidas).
2. **MongoDB**: latencia de inserción (p50/p95) y throughput de escritura (docs/s) bajo carga.
3. **MPC**: tiempo de resolución Gurobi por ciclo (24 h, S escenarios) — con y sin carga concurrente; verificar que < 15 min del ciclo (si no, reportar el gap y las optimizaciones).
4. **WebSocket/Socket.IO**: latencia de push al frontend (p50/p95/p99).
5. **Recursos**: CPU/RAM de cada servicio (Node, Python, Redis, MongoDB) bajo carga sostenida.
6. **Concurrencia**: prueba de carga sobre la API REST (p. ej., autocannon/k6: RPS y percentiles con 50–100 conexiones).
Yo puedo escribir todos los scripts de benchmark (simulador MQTT con paho, medidor de latencia, script de timing del solver, autocannon/k6 para la API) — solo necesitan ejecutarlos en su entorno.

---

## 12. Checklist editorial (del editor)

| Ítem | Estado | Acción |
|---|---|---|
| (I) Todas las referencias relevantes y citadas | **FALLA**: [14]–[17] sin citar | Citarlas en la nueva lit review / Tabla 1, o eliminarlas |
| (II) Resaltar revisiones | Pendiente | Entregar versión con cambios marcados (track changes / texto en rojo como pide el template) |
| (III) Cover letter punto por punto | Pendiente | La redacto una vez definidas las respuestas (template del editor incluido al final del PDF de observaciones) |
| (IV) Referencias recomendadas por el revisor | Comentario 7 → **agregada** (referencia encontrada y verificada) | Incluirla con conexión real al contenido |
| (V) Comentarios imposibles de abordar | Decidir | P. ej., si el estudio con operadores (C10) no cabe en 10 días → explicarlo en la respuesta y ofrecer alternativa |

---

## 13. Problemas adicionales detectados (corregir de paso)

1. **Referencias [14]–[17] en formato IEEE mezclado** con el estilo MDPI (autor, título, journal, año, vol, págs) y con "y" en español ("A. Parisio, E. Rinaldi, **y** L. Glielmo"). Unificar todo al estilo de la revista + agregar DOI a todas las que no lo tienen (MDPI lo exige).
2. **"Journal Not Specified"** en cabecera y **DOI placeholder** (10.3390/1010000) — completar con la revista real antes de re-enviar.
3. **English quality** (el revisor marcó la casilla): pulir las frases más enrevesadas (p. ej., abstract: "performs the economic dispatch management of a microgrid in Pyomo with Gurobi" → "solves a stochastic economic dispatch problem formulated in Pyomo and solved with Gurobi"; "The platform operates autonomously in a continuous cycle" → "operates in a continuous closed loop"). Hago una pasada completa de inglés en las secciones que reescribamos.
4. **Inconsistencia de variables pronosticadas**: el abstract dice "solar irradiance and energy demand forecasts" pero la Fig. 9 muestra generación solar y **voltaje**. Alinear: o pronosticar/graficar demanda, o describir voltaje como variable monitoreada de calidad (justificar). La predicción de voltaje es difícil de justificar en un EMS económico.
5. **Ecs. (1)–(3)**: definir todos los símbolos (C_comb, C_fijo, C_var, deg, η_ch, η_dis, SOC_ini) — falta notación completa (el revisor no lo pidió pero otro revisor lo atacará).
6. **"twenty-day period"** de entrenamiento del TFT: muy corto; ampliar si hay historial disponible (ver comentario 8).
7. **Keywords**: "Stochastic Optimization; LLM Agents" están bien; considerar agregar "Resilience" dado el comentario 7.

---

## 14. Plan de trabajo propuesto (fases)

**Fase 1 — Texto (1–2 días)**: comentarios 2, 5, 6, 7 + problemas adicionales 1–5. Yo redacto todo el texto nuevo (párrafos, Tabla 1, párrafo de resiliencia, reformulación del abstract) y ustedes lo pegan en el Word/LaTeX con cambios en rojo.

**Fase 2 — Modelo y código (2–3 días)**: comentarios 1, 3, 4. Cambios en Pyomo (complementariedad), generación de escenarios documentada, detector con ε y umbrales adaptativos; re-correr Figs. 7–8 y detector con datos reales.

**Fase 3 — Experimentos (3–5 días, paralelo con Fase 2)**: comentarios 8, 9, 11 y (si da tiempo) 10. Scripts de evaluación TFT + baselines, simulación MPC comparativa, benchmarks de rendimiento.

**Fase 4 — Cierre (1–2 días)**: Tabla de métricas finales, resaltado de cambios, cover letter punto por punto (la redacto), verificación del checklist (I)–(V).

**Total: 7–10 días — justo dentro del plazo del editor.**

---

## 15. Lo que necesito de ustedes para avanzar

1. **Archivo fuente editable** del manuscrito (.docx o .tex) — para aplicar cambios directamente y verificar la Table 1 perdida.
2. **Código del modelo Pyomo** (para la restricción de complementariedad y el experimento comparativo) y **código del detector** de anomalías.
3. **Datos/checkpoint del TFT** (o el código de entrenamiento) — para métricas y baselines; y confirmar cuánto historial hay en MongoDB (¿solo 20 días o más?).
4. **Confirmación del método real de escenarios** del MPC actual (¿el MatlabPredictor genera escenarios o es determinista?).
5. **Entorno donde correr los benchmarks** (¿la plataforma corre local o en servidor?).
6. **Revista real de destino** (para completar cabecera/DOI y el formato de referencias).
