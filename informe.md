# SIGE: Sistema Inteligente de Gestión para Microrredes Eléctricas

## Plataforma de análisis en tiempo real, predicción y optimización estocástica basada en datos reales

---

## Resumen

La creciente penetración de fuentes renovables intermitentes, junto con la complejidad operativa de los sistemas de almacenamiento y la generación convencional, exige nuevas herramientas de gestión capaces de procesar datos en tiempo real, anticipar condiciones futuras y tomar decisiones óptimas de despacho bajo incertidumbre. En este trabajo se presenta **SIGE** (Sistema Inteligente de Gestión Energética), una plataforma integral para la operación de microrredes eléctricas híbridas que integra monitoreo IoT en tiempo real, predicción de variables de entrada mediante modelos de deep learning, optimización estocástica con control predictivo por modelo (MPC), detección estadística de anomalías y un sistema multi-agente basado en grandes modelos de lenguaje (LLMs) para asistencia operativa. La plataforma opera en un ciclo continuo de 15 minutos: adquiere datos de sensores MQTT, genera pronósticos de irradiancia solar y demanda de carga con un horizonte de 24 horas mediante un modelo Temporal Fusion Transformer (TFT), resuelve un problema de despacho económico estocástico formulado en Pyomo con Gurobi, y presenta los resultados en una interfaz interactiva basada en React con visualización sobre diagrama unifilar. Los resultados demuestran la viabilidad de una arquitectura que integra optimización matemática clásica con inteligencia artificial moderna para la toma de decisiones en tiempo real sobre infraestructura energética distribuida.

---

## 1. Introducción

### 1.1. Contexto y problema

Las microrredes eléctricas —sistemas de generación, almacenamiento y consumo que pueden operar de forma aislada o interconectada con la red principal— representan un paradigma fundamental en la transición energética. Sin embargo, su operación eficiente enfrenta desafíos considerables: la generación solar fotovoltaica es inherentemente intermitente y depende de condiciones meteorológicas impredecibles; los generadores diésel, aunque despachables, presentan costos operativos no lineales y externalidades ambientales; las baterías introducen acoplamiento temporal entre períodos consecutivos; y la red eléctrica externa impone restricciones de intercambio y tarifas variables.

La toma de decisiones en este contexto requiere resolver, de forma continua, un problema de optimización multi-período bajo incertidumbre, alimentado por datos reales de sensores y proyecciones de condiciones futuras. Las soluciones tradicionales basadas en reglas heurísticas o en optimización determinista no capturan adecuadamente la naturaleza estocástica de las fuentes renovables ni aprovechan la granularidad temporal que ofrecen los sistemas modernos de adquisición de datos.

### 1.2. Objetivos de la plataforma

SIGE se concibe como una plataforma que unifica en un solo sistema las siguientes capacidades:

1. **Adquisición y monitoreo en tiempo real** de variables eléctricas mediante sensores IoT desplegados sobre la microrred, utilizando el protocolo MQTT para la transmisión de datos y MongoDB para su persistencia.

2. **Predicción de series temporales multi-horizonte** de irradiancia solar y demanda de carga, empleando el modelo Temporal Fusion Transformer (TFT), una arquitectura de deep learning de última generación diseñada para forecasting con horizontes variables y múltiples variables exógenas.

3. **Optimización estocástica con control predictivo por modelo (MPC)**, resolviendo un problema de despacho económico que considera múltiples escenarios climáticos ponderados por probabilidad, con un horizonte de 24 horas y resolución horaria, re-ejecutado automáticamente cada 15 minutos.

4. **Detección de anomalías en tiempo real** mediante un conjunto de tres estrategias estadísticas complementarias (umbrales, tasa de cambio, puntuación Z contextual), que alimentan un sistema multi-agente basado en LLMs para la generación de diagnósticos y recomendaciones operativas en lenguaje natural.

5. **Interfaz de operador interactiva** que incluye un editor de diagrama unifilar, visualización gráfica de planes de despacho, monitoreo en tiempo real de sensores, y dashboards generados dinámicamente por inteligencia artificial.

El objetivo último de la plataforma es constituirse en un sistema de análisis en tiempo real que, a partir de datos reales de campo, predice condiciones futuras y optimiza de forma autónoma la operación de la microrred, reduciendo costos operativos, mejorando la confiabilidad del suministro y proporcionando al operador humano información accionable para la supervisión y la toma de decisiones.

---

## 2. Arquitectura general del sistema

### 2.1. Visión de conjunto

SIGE se organiza en tres capas tecnológicas que se comunican mediante APIs REST, WebSockets, Redis y MQTT:

```
┌──────────────────────────────────────────────────────────────────┐
│                  CAPA DE PRESENTACIÓN (React)                     │
│  Dashboard | Monitoreo | Editor Unifilar | Dispositivos | Admin  │
│            Redux Toolkit · ReactFlow · Plotly · Socket.IO         │
└────────────┬──────────────────────┬───────────────────────────────┘
             │ HTTP REST            │ WebSocket (Socket.IO)
             ▼                      ▼
┌────────────────────────┐  ┌──────────────────────────────────────┐
│  CAPA DE SERVICIOS     │  │   CAPA DE OPTIMIZACIÓN (Python)      │
│  Express 5 · Node.js   │──│   FastAPI (predicción, puerto 8000)  │
│  JWT · MQTT Client     │  │   Pyomo + Gurobi/HiGHS (solver)     │
│  LangChain Agents      │  │   Redis (cola de trabajos)           │
│  BullMQ · MongoDB      │  │   Modelo TFT (forecasting)           │
└────────┬───────────────┘  └──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     INFRAESTRUCTURA DE DATOS                       │
│  MongoDB (series temporales, usuarios, configuración)             │
│  Redis (cola de optimización, resultados, estado de progreso)     │
│  MQTT Broker (datos de sensores)                                  │
│  Docker (Redis)                                                   │
└──────────────────────────────────────────────────────────────────┘
```

La capa de presentación, implementada en React 19 con Vite, ofrece seis módulos funcionales accesibles mediante navegación por pestañas: Dashboard de optimización, Monitoreo en tiempo real, Editor de diagrama unifilar, Gestión de dispositivos IoT, Dashboard generado por IA (server-driven UI), y Administración de operadores. El estado de la aplicación se gestiona mediante Redux Toolkit, con reducers especializados para autenticación, dispositivos, diagrama, optimización e interfaz de usuario. La comunicación en tiempo real con el backend se realiza mediante Socket.IO, mientras que las operaciones CRUD y de control utilizan una API REST con autenticación JWT.

La capa de servicios, ejecutada sobre Node.js con Express 5, actúa como orquestador central: gestiona la autenticación de usuarios, mantiene la conexión con el broker MQTT para la ingesta de datos de sensores, coordina los ciclos de optimización MPC, ejecuta el pipeline de agentes de IA, y sirve como puente entre el frontend y los servicios de predicción y optimización en Python. La comunicación con los servicios Python se realiza mediante HTTP (para predicciones) y Redis (para trabajos de optimización).

La capa de optimización, implementada en Python, contiene dos servicios independientes: una API FastAPI que expone los pronósticos generados por el modelo TFT, y un motor de resolución basado en Pyomo que construye y resuelve el modelo de despacho económico estocástico utilizando Gurobi como solver principal, con HiGHS como alternativa automática de código abierto.

### 2.2. Flujo de datos

El flujo de datos en la plataforma sigue un pipeline continuo que puede descomponerse en dos circuitos principales:

**Circuito de monitoreo y análisis:**

```
Sensor IoT → MQTT Broker → mqttService (Node.js)
  ├── MongoDB (persistencia en colección por sensor)
  ├── Socket.IO → Frontend (visualización en tiempo real)
  └── ChangeStream → BullMQ (cola de análisis)
       └── Estrategias de anomalías (umbrales, tasa de cambio, Z-Score)
            └── LangChain Agent Graph (router → alerta/optimización → formateador)
                 └── Socket.IO → Frontend (diagnóstico y recomendación)
```

**Circuito de predicción y optimización (MPC):**

```
Ciclo automático (cada 15 min) o disparo manual
  │
  ├── GET /predict/solar + /predict/load → FastAPI → Modelo TFT
  │
  ├── Construcción del problema de optimización
  │     (topología del diagrama + predicciones + escenarios)
  │
  ├── Redis LPUSH optimization:pending → Python solver
  │     └── Pyomo model builder → Gurobi/HiGHS → solución
  │          └── Redis SET optimization:result:<jobId>
  │
  └── Polling de resultado → Socket.IO → Redux → Dashboard
       (DispatchSchedule, CostCurve, BatterySOCChart, ScenarioTabs)
```

---

## 3. Adquisición y monitoreo en tiempo real

### 3.1. Integración IoT mediante MQTT

La plataforma se conecta a un broker MQTT externo donde los sensores desplegados en la microrred publican sus mediciones en tópicos con el formato `DataSensor/<sensorId>`. El servicio `mqttService`, ejecutado en el backend de Node.js, mantiene una suscripción activa al patrón `DataSensor/+`, recibiendo en tiempo real todas las lecturas de todos los sensores autorizados.

Un mecanismo de lista blanca (`authorizedSensors`), mantenido en memoria RAM y sincronizado con la base de datos de dispositivos registrados, garantiza que únicamente se procesen datos de sensores legítimos. Cada mensaje entrante se valida contra esta lista; los sensores no autorizados se descartan con registro de advertencia, previniendo la inyección de datos espurios en el sistema.

### 3.2. Persistencia y propagación

Los datos validados se persisten en MongoDB utilizando un modelo dinámico por sensor: cada dispositivo registrado en la plataforma recibe automáticamente su propia colección en la base de datos, nombrada según su identificador. Esta estrategia de particionamiento por sensor facilita consultas eficientes de series temporales, permite aplicar políticas de retención diferenciadas, y aísla los datos de cada dispositivo para su análisis independiente.

Simultáneamente a la persistencia, cada lectura se emite en tiempo real al frontend mediante Socket.IO, utilizando salas (rooms) identificadas por el `sensorId`. Los clientes React suscritos reciben el evento `sensor_update` y actualizan las gráficas de monitoreo sin necesidad de sondeo, logrando una latencia de visualización inferior a un segundo desde la publicación del sensor.

### 3.3. Procesamiento continuo mediante ChangeStream

La funcionalidad de ChangeStream de MongoDB permite a la plataforma detectar cada nueva inserción en las colecciones de sensores sin sondeo periódico. El servicio `changeStreamService` mantiene cursores abiertos sobre todas las colecciones activas, y ante cada nuevo documento, encola el dato en una cola de análisis BullMQ. Un worker especializado procesa estos trabajos aplicando el pipeline de detección de anomalías y el sistema de agentes de IA, garantizando que cada lectura de sensor sea analizada en tiempo real.

---

## 4. Predicción de variables de entrada

### 4.1. Pipeline de adquisición de datos

La predicción de las variables que alimentan el optimizador —irradiancia solar y demanda de carga— se sustenta en un pipeline de adquisición de datos desarrollado y operado por el equipo de investigación. Este pipeline recolecta, valida y estructura datos históricos de irradiancia y de consumo eléctrico a partir de fuentes de campo y estaciones meteorológicas asociadas a la microrred. Los datos curados constituyen el insumo para el entrenamiento y la inferencia del modelo de predicción, garantizando que los pronósticos reflejen las condiciones reales del sitio de despliegue.

### 4.2. Modelo Temporal Fusion Transformer

Para la generación de pronósticos multi-horizonte se emplea el modelo **Temporal Fusion Transformer (TFT)**, una arquitectura de deep learning basada en mecanismos de atención desarrollada por Google Research, específicamente diseñada para forecasting de series temporales con las siguientes propiedades:

- **Horizonte variable**: permite generar predicciones para cualquier cantidad de pasos futuros, configurado en SIGE para un horizonte de 24 horas con resolución horaria.
- **Múltiples variables exógenas**: incorpora información contextual como hora del día, día de la semana, y variables meteorológicas auxiliares que mejoran la precisión de las predicciones de irradiancia.
- **Cuantiles de incertidumbre**: genera predicciones probabilísticas (percentiles), lo que permite alimentar al optimizador no solo con el valor esperado sino también con bandas de confianza que informan la construcción de escenarios estocásticos.
- **Interpretabilidad**: los mecanismos de atención del TFT permiten identificar qué variables históricas y qué horizontes temporales son más relevantes para cada predicción, facilitando la validación del modelo por parte de los operadores.

El modelo TFT se entrena, valida y evalúa en un repositorio independiente especializado en el ciclo de vida del modelo de machine learning. Este repositorio gestiona la preparación de datos, el ajuste de hiperparámetros, la evaluación de rendimiento (MSE, MAE, RMSE por horizonte) y el versionado del modelo. Una vez validado, el modelo entrenado se despliega en el servicio de predicción de SIGE.

### 4.3. API de predicción

El servicio de predicción se implementa como una API FastAPI que expone dos endpoints principales:

- `GET /predict/solar?hours=24`: devuelve el vector de irradiancia normalizada pronosticada para las próximas `n` horas.
- `GET /predict/load?hours=24`: devuelve el vector de demanda de carga trifásica pronosticada (componentes PL1, PL2, PL3) que el orquestador consolida en una única serie de carga total.

La arquitectura del servicio de predicción sigue el patrón de interfaz abstracta (`PredictorInterface`), lo que permite intercambiar el motor de predicción subyacente sin modificar el resto del sistema. El predictor TFT es el motor activo por defecto, y la interfaz permite incorporar modelos alternativos o ensembles en el futuro sin cambios en la lógica de integración.

---

## 5. Optimización estocástica y control predictivo por modelo

### 5.1. Formulación del problema

El núcleo matemático de SIGE es un problema de **despacho económico estocástico** formulado como un programa cuadrático con variables continuas, resuelto mediante Pyomo. La formulación considera un horizonte de 24 períodos (horas) y un conjunto de escenarios climáticos que modelan la incertidumbre en la generación solar.

#### 5.1.1. Variables de decisión

Para cada hora del horizonte y cada escenario estocástico, el modelo define las siguientes variables de decisión:

| Variable | Descripción | Unidad |
|----------|-------------|--------|
| `P_diesel[d,t,s]` | Potencia generada por el generador diésel `d` en la hora `t`, escenario `s` | kW |
| `P_grid[t,s]` | Potencia intercambiada con la red principal (positiva = importación) | kW |
| `P_charge[b,t,s]` | Potencia de carga de la batería `b` en la hora `t`, escenario `s` | kW |
| `P_discharge[b,t,s]` | Potencia de descarga de la batería `b` en la hora `t`, escenario `s` | kW |
| `SOC[b,t,s]` | Estado de carga de la batería `b` al final de la hora `t`, escenario `s` | kWh |

La generación solar `P_solar[t,s]` no es una variable de decisión, sino un parámetro calculado externamente como:

```
P_solar[t,s] = capacidad_max × eficiencia × irradiancia[t] × factor_escenario[s]
```

Donde `irradiancia[t]` es la predicción horaria del TFT y `factor_escenario[s]` es un multiplicador específico del escenario climático (1.0 para soleado, 0.5 para nublado, 0.2 para lluvia).

#### 5.1.2. Función objetivo

El objetivo es minimizar el costo total esperado de operación, ponderado por las probabilidades de cada escenario:

```
min Σₛ prob[s] · Σₜ [
    Σ_diesel (c_d + b_d·P_d[t,s] + a_d·P_d[t,s]²) · C_combustible +
    (costo_fijo_red + costo_variable · P_grid[t,s]) +
    Σ_baterías tasa_degradación · (P_charge[t,s] + P_discharge[t,s])
]
```

donde:
- El costo del diésel es **cuadrático**, reflejando la realidad física de que la eficiencia del generador varía con el punto de operación.
- El costo de la red es **lineal**, con un término fijo que representa cargos de conexión y un término variable proporcional a la energía importada. La exportación a la red se modela como ingreso (costo negativo) a una tarifa de inyección.
- El costo de las baterías es **lineal** respecto a la energía ciclada (carga + descarga), modelando la degradación proporcional al uso.

#### 5.1.3. Restricciones

El modelo incorpora las siguientes familias de restricciones:

**Balance de potencia** (para cada hora, cada escenario):
```
ΣP_diesel + P_grid + P_solar + ΣP_discharge − ΣP_charge ≥ P_load[t]
```

**Límites operativos de generadores diésel:**
```
P_min[d] ≤ P_diesel[d,t,s] ≤ P_max[d]
```

**Límites de intercambio con la red:**
```
P_grid_min ≤ P_grid[t,s] ≤ P_grid_max
```
donde valores negativos representan exportación.

**Límites de carga/descarga de baterías:**
```
0 ≤ P_charge[b,t,s] ≤ P_charge_max[b]
0 ≤ P_discharge[b,t,s] ≤ P_discharge_max[b]
```

**Límites de estado de carga:**
```
SOC_min[b] ≤ SOC[b,t,s] ≤ SOC_max[b]
```

**Dinámica del estado de carga:**
```
SOC[b,t,s] = SOC[b,t−1,s] + η_charge[b]·P_charge[b,t,s] − P_discharge[b,t,s]/η_discharge[b]
```

**Condición inicial de SOC:**
```
SOC[b,0,s] = SOC_inicial[b] + η_charge[b]·P_charge[b,0,s] − P_discharge[b,0,s]/η_discharge[b]
```

### 5.2. Modelado de incertidumbre mediante escenarios

La incertidumbre en la generación solar se aborda mediante **programación estocástica basada en escenarios**. Se definen tres escenarios climáticos representativos:

| Escenario | Probabilidad | Factor de irradiancia |
|-----------|-------------|----------------------|
| Soleado | 60% | 1.00 |
| Nublado | 30% | 0.50 |
| Lluvia | 10% | 0.20 |

Las probabilidades se normalizan automáticamente para garantizar que sumen la unidad. El factor de irradiancia multiplica la predicción base del TFT para cada escenario, permitiendo que el optimizador encuentre un plan de despacho robusto: las decisiones que involucran generadores diésel y baterías se toman considerando simultáneamente los tres escenarios, ponderados por su probabilidad de ocurrencia. Las variables de primer período (hora actual) son comunes a todos los escenarios (restricción de no-anticipatividad implícita en la formulación), mientras que las decisiones futuras pueden adaptarse condicionalmente.

### 5.3. Resolución

El modelo se resuelve utilizando **Gurobi** como solver principal, un optimizador de grado comercial que ofrece rendimiento superior en problemas cuadráticos de gran escala. Como alternativa de respaldo automático, la plataforma incluye **HiGHS** (a través de la interfaz `appsi_highs` de Pyomo), un solver de código abierto que garantiza la operación continua incluso si la licencia de Gurobi no está disponible.

La comunicación entre Node.js y Python para el despacho de trabajos de optimización se realiza mediante **Redis** como intermediario. El orquestador Node.js inserta el trabajo en la lista `optimization:pending` mediante `LPUSH` y el solver Python lo recoge con `BRPOP` (bloqueante). Al finalizar, el resultado se almacena en la clave `optimization:result:<jobId>`. El backend sondea el estado cada 2 segundos durante un máximo de 5 minutos, y al detectar la finalización, transmite el resultado al frontend vía Socket.IO.

### 5.4. Ciclo de control predictivo (MPC)

El ciclo de control predictivo por modelo se ejecuta de dos formas complementarias:

1. **Ciclo automático**: un temporizador en el backend dispara el pipeline completo cada 15 minutos (`setInterval` con período de 900 segundos). En cada ciclo se obtienen nuevas predicciones del TFT, se reconstruye el problema de optimización con el estado actual de la microrred (niveles de batería, disponibilidad de generadores), y se genera un nuevo plan de despacho para las siguientes 24 horas.

2. **Disparo manual**: desde la interfaz de operador, el usuario puede ejecutar una optimización bajo demanda, por ejemplo tras modificar la topología de la microrred en el editor de diagrama unifilar o al cambiar parámetros operativos de los dispositivos.

Este enfoque de horizonte deslizante (receding horizon) es característico del control predictivo por modelo: en cada paso de tiempo se resuelve un problema de horizonte completo, pero solo se implementa la decisión del primer período, repitiendo el proceso en el siguiente ciclo con información actualizada.

---

## 6. Detección de anomalías y sistema multi-agente de IA

### 6.1. Estrategias de detección estadística

Cada lectura de sensor que ingresa al sistema es sometida a un análisis mediante tres estrategias complementarias de detección de anomalías, ejecutadas por el worker de análisis:

**Estrategia de umbrales**: verifica cada variable medida (tensión, corriente, potencia, frecuencia) contra rangos operativos configurados por tipo de sensor. Los rangos se definen con conocimiento de dominio para cada clase de dispositivo:

| Tipo de sensor | Tensión normal | Variable monitoreada |
|----------------|----------------|---------------------|
| Panel solar | 180 – 250 V | Tensión de salida DC |
| Inversor | 115 – 135 V | Tensión de salida AC |
| Batería | 44 – 58 V | Tensión del bus DC |
| Medidor de red | 114 – 132 V | Tensión de conexión |

**Estrategia de tasa de cambio**: compara cada lectura con la lectura inmediatamente anterior del mismo sensor. Si la variación relativa de cualquier variable excede el 50%, se dispara una alerta. Esta estrategia es particularmente efectiva para detectar fallas súbitas, desconexiones o eventos transitorios que no necesariamente violan los umbrales absolutos pero representan cambios anómalos en la operación.

**Estrategia de puntuación Z contextual**: utiliza una ventana deslizante de las últimas 30 lecturas del sensor para calcular la media y la desviación estándar de cada variable. Una lectura cuya puntuación Z exceda 3.0 en valor absoluto se clasifica como anómala. Esta estrategia captura desviaciones sutiles respecto al comportamiento histórico reciente del dispositivo, siendo eficaz para detectar degradación progresiva o cambios en el patrón de operación. Se requiere un mínimo de 5 lecturas históricas para activar esta estrategia.

El resultado de las tres estrategias se agrega en un registro unificado:

- **Nivel crítico**: dos o más estrategias detectan anomalía simultáneamente.
- **Nivel advertencia**: exactamente una estrategia detecta anomalía.
- **Nivel normal**: ninguna estrategia detecta anomalía.

### 6.2. Sistema multi-agente basado en LLMs

La plataforma incorpora un sistema multi-agente implementado mediante **LangChain** que procesa los resultados del análisis estadístico y genera respuestas contextuales en español. El sistema se estructura como un grafo de estados con cuatro nodos:

```
INICIO → router ──┬── anomalía detectada ──→ alerta ──┐
                  │                                    ├──→ formateador → FIN
                  └── operación normal ────→ optimización ─┘
```

**Nodo enrutador (`router`)**: examina el resultado agregado del análisis estadístico. Si `analisisPrevio.anomalia === true`, deriva al nodo de alerta; en caso contrario, deriva al nodo de optimización.

**Nodo de alerta (`alertNode`)**: construye un prompt estructurado en español que describe todas las violaciones detectadas (umbrales excedidos, tasas de cambio anómalas, puntuaciones Z elevadas), incluyendo el identificador del sensor, la variable afectada, el valor observado y el rango esperado. Invoca al LLM —configurable entre Groq (Llama 3.3 70B) y OpenAI (GPT-4o-mini)— para generar un resumen diagnóstico y una recomendación operativa accionable. Por ejemplo: "El sensor del inversor principal registra una caída de tensión del 22% en los últimos 5 minutos. Se recomienda verificar la conexión del bus DC y el estado de los capacitores de enlace."

**Nodo de optimización (`optimizationNode`)**: para sensores en operación normal, invoca al LLM para sugerir mejoras de eficiencia basadas en los patrones observados: estrategias de carga de baterías para aprovechar excedentes solares, balanceo de fases, o programación de mantenimiento preventivo.

**Nodo formateador (`formatterNode`)**: recopila las últimas 30 lecturas históricas del sensor, calcula valores esperados mediante media móvil, construye series temporales con formato `{timestamp, valor_real, valor_esperado}` para visualización, y valida la estructura de la respuesta contra un esquema Zod, garantizando que el frontend reciba datos consistentes.

El sistema utiliza una temperatura de 0.25 para el LLM (favoreciendo respuestas deterministas y factuales) y un límite de 600 tokens, asegurando diagnósticos concisos y accionables.

---

## 7. Interfaz de operador

### 7.1. Editor de diagrama unifilar

La plataforma incluye un editor de diagrama unifilar interactivo construido sobre **ReactFlow**, que permite al operador modelar visualmente la topología de la microrred. Siete tipos de dispositivos están disponibles, organizados por categorías funcionales:

| Categoría | Dispositivos | Rol en la optimización |
|-----------|-------------|----------------------|
| Fuentes | Panel solar, Generador diésel, Red eléctrica | Variables de generación e intercambio |
| Conversión | Inversor | No modelado directamente (pérdidas) |
| Almacenamiento | Batería | Variables de carga/descarga y SOC |
| Cargas | Carga eléctrica | Demanda a satisfacer |
| Sensores | Sensor IoT | Monitoreo, no optimizado |

Cada dispositivo posee parámetros configurables mediante un panel lateral que se abre con un clic: capacidad nominal, eficiencia, costos operativos, voltaje de operación y umbrales de alerta. Estos parámetros se traducen automáticamente al formato requerido por el solver de optimización cuando se dispara un ciclo MPC, garantizando que el modelo matemático refleje fielmente la configuración definida por el operador.

Las conexiones entre dispositivos en el diagrama se almacenan como aristas dirigidas en el estado Redux, y aunque el solver actual no utiliza explícitamente la topología de conexiones (asume que todos los dispositivos están interconectados en una barra común), la representación visual permite al operador documentar la arquitectura real de la microrred.

### 7.2. Visualización de resultados de optimización

Los resultados de cada ejecución del optimizador se presentan en el Dashboard mediante cuatro componentes principales:

**Plan de despacho horario (`DispatchSchedule`)**: gráfico de barras apiladas de 24 horas generado con Plotly, donde cada color representa un tipo de dispositivo o modo de operación (solar, diésel, importación de red, exportación a red, carga de batería, descarga de batería). La asignación de colores y etiquetas se determina dinámicamente a partir del registro central de tipos de dispositivo, permitiendo que nuevos tipos agregados en el futuro se integren automáticamente en la visualización.

**Curva de costo horario (`CostCurve`)**: gráfico de líneas que muestra el costo operativo estimado para cada hora del horizonte, permitiendo identificar los períodos de mayor estrés económico.

**Evolución del estado de carga (`BatterySOCChart`)**: traza la trayectoria del SOC de cada batería a lo largo de las 24 horas, con bandas que muestran la dispersión entre escenarios.

**Comparación de escenarios (`ScenarioTabs`)**: permite al operador alternar entre los resultados de cada escenario climático o visualizar el valor esperado ponderado.

Adicionalmente, el diagrama unifilar muestra badges sobre cada nodo con la potencia de despacho actual, y al hacer doble clic en un dispositivo se abre un modal flotante con la serie temporal de despacho específica de ese dispositivo para las 24 horas.

### 7.3. Dashboard generado por IA

Un módulo innovador de la plataforma emplea el LLM para generar automáticamente dashboards adaptados a los sensores disponibles. El sistema envía al modelo un prompt que describe los sensores activos y sus tipos, junto con datos de muestra, y recibe como respuesta una especificación JSON de widgets (tarjetas de métricas, gráficos de líneas, gráficos de barras, tablas) validada contra un esquema Zod. La interfaz renderiza dinámicamente estos widgets enriquecidos con datos en tiempo real. Si el LLM no está disponible, el sistema proporciona un dashboard predeterminado sensato como respaldo, garantizando la operación continua.

---

## 8. Métricas, resultados y estado del sistema

### 8.1. Indicadores clave de desempeño

Al completar cada ciclo de optimización, el Dashboard presenta cuatro indicadores agregados:

1. **Costo total optimizado**: suma de costos operativos (combustible, importación de red, degradación de baterías) para el horizonte de 24 horas, neto de ingresos por exportación.

2. **Potencia pico total**: máxima potencia instantánea requerida en cualquier hora del horizonte, útil para dimensionamiento de infraestructura.

3. **Estado del sistema**: indicador visual que refleja si el último ciclo de optimización fue exitoso, si está en ejecución, o si ocurrió un error.

4. **Escenarios evaluados**: cantidad de escenarios climáticos considerados y sus probabilidades asociadas, comunicando al operador las condiciones de incertidumbre bajo las cuales se optimizó.

### 8.2. Plan de despacho por dispositivo

La salida del optimizador es una lista plana de entradas de despacho con la estructura:

```
{ device_id, device_type, hour, scenario, power_kw, cost }
```

Esta estructura permite filtrar y agregar los resultados por cualquier dimensión: por dispositivo individual, por tipo de dispositivo, por hora, o por escenario. La flexibilidad de esta representación facilita tanto las visualizaciones agregadas del Dashboard como las visualizaciones específicas del modal de despacho por dispositivo.

### 8.3. Ciclo de vida del trabajo de optimización

Cada trabajo de optimización transita por los siguientes estados, visibles en tiempo real desde la interfaz:

```
idle → queued → running → complete (con resultado) / error / timeout
```

El backend mantiene el estado del trabajo en Redis bajo la clave `optimization:progress:<jobId>` y lo actualiza a medida que avanza el proceso. El mecanismo de sondeo en el frontend consulta este estado y actualiza la interfaz de usuario, incluyendo una barra de progreso durante la fase de ejecución.

---

## 9. Conclusiones

SIGE representa una contribución al estado del arte en plataformas de gestión de microrredes al integrar, en un solo sistema operativo, capacidades que tradicionalmente se abordan de forma aislada: monitoreo IoT en tiempo real, predicción de series temporales con deep learning, optimización estocástica bajo incertidumbre, detección estadística de anomalías, y asistencia operativa mediante agentes de inteligencia artificial basados en LLMs. La plataforma opera efectivamente como un sistema de análisis en tiempo real que transforma datos crudos de sensores en decisiones óptimas de despacho y en recomendaciones accionables para el operador humano.

La arquitectura en tres capas ofrece una separación clara de responsabilidades: adquisición y persistencia de datos (MongoDB, MQTT), lógica de negocio y orquestación (Node.js, Redis), y cómputo científico (Python, Pyomo, TFT). La comunicación mediante estándares abiertos (HTTP REST, WebSockets, Redis, MQTT) garantiza la interoperabilidad y la extensibilidad. El uso de Pyomo como capa de modelado algebraico permite modificar la formulación del problema de optimización sin reescribir solvers, y la arquitectura de interfaz abstracta para predictores facilita la evolución independiente del modelo de forecasting.

La combinación de optimización matemática clásica con inteligencia artificial moderna es particularmente potente: el solver garantiza optimalidad y respeto de restricciones físicas, mientras que el sistema de agentes LLM proporciona explicabilidad y contexto operativo que ningún solver puede ofrecer. El ciclo MPC de 15 minutos permite que el sistema se adapte continuamente a cambios en las condiciones de generación y demanda, cerrando el lazo entre predicción, optimización y ejecución.

### 9.1. Trabajo futuro

La plataforma está diseñada para evolucionar en las siguientes direcciones:

**Extensión del catálogo de dispositivos**: la arquitectura del registro de tipos de dispositivo y del mapeador de topología permite incorporar nuevas fuentes de generación (turbinas eólicas, celdas de hidrógeno, biomasa) con cambios mínimos en el código. El solver requeriría ramas adicionales para fuentes con modelos de costo no cuadráticos, idealmente mediante una refactorización hacia un sistema basado en metadatos (`model_type: passive | dispatchable`) que elimine las cadenas condicionales actuales.

**Escalabilidad a microrredes interconectadas**: la formulación actual asume una barra común; extenderla a una topología mallada con múltiples nodos y flujos de potencia requiere incorporar restricciones de red (ecuaciones de flujo de carga) y potencialmente migrar a una formulación no lineal o linealizada (DC-OPF).

**Refinamiento del sistema multi-agente**: incorporar memoria de largo plazo en el grafo de agentes para que los diagnósticos consideren el historial completo del dispositivo, permitiendo identificar patrones de degradación a lo largo de semanas o meses.

**Integración de reforzamiento del aprendizaje**: explorar el uso de agentes de RL entrenados sobre el simulador implícito en el modelo Pyomo para aprender políticas de despacho que no requieran re-optimización en cada ciclo, reduciendo la latencia y el costo computacional.

**Acoplamiento con mercados eléctricos**: extender el modelo para considerar señales de precio horario de mercados mayoristas, permitiendo arbitraje entre generación propia y compra/venta en el mercado.

---

## Referencias

1. Lim, B., Arik, S. O., Loeff, N., & Pfister, T. (2021). Temporal Fusion Transformers for interpretable multi-horizon time series forecasting. *International Journal of Forecasting*, 37(4), 1748-1764.

2. Bynum, M. L., Hackebeil, G. A., Hart, W. E., Laird, C. D., Nicholson, B. L., Siirola, J. D., Watson, J. P., & Woodruff, D. L. (2021). *Pyomo — Optimization Modeling in Python* (3rd ed.). Springer.

3. Gurobi Optimization, LLC. (2024). Gurobi Optimizer Reference Manual.

4. Rawlings, J. B., Mayne, D. Q., & Diehl, M. M. (2017). *Model Predictive Control: Theory, Computation, and Design* (2nd ed.). Nob Hill Publishing.

5. Birge, J. R., & Louveaux, F. (2011). *Introduction to Stochastic Programming* (2nd ed.). Springer.

6. Huangfu, Q. & Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. *Mathematical Programming Computation*, 10(1), 119-142. (HiGHS solver)

7. Chase, H. (2022). *LangChain: Building applications with LLMs through composability*.

---

*Documento generado el 30 de mayo de 2026. Plataforma en desarrollo activo.*
