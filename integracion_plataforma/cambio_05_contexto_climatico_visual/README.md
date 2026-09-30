# PLAN — CAMBIO 05 · CONTEXTO CLIMÁTICO VISUAL EN LA PLATAFORMA
### ONI/RONI · índices · **mapa literal de la zona** y mapa continuo · radiación histórica · la decisión visible

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El
> autor del proyecto (asistente) **NO toca el repositorio**: solo lo lee y especifica. La
> implementación la hace la IA del autor. Este archivo vive en `C:\Users\2D\tesis-microrred\docs\`
> y se copia como `integracion_plataforma/cambio_05_contexto_climatico_visual/README.md`.
>
> Estado: **propuesta**. Nada implementado en el repo.

---

## 0. Qué resuelve

La plataforma muestra pronóstico, comparativas y despacho, pero **no muestra el contexto
climático que gobierna las decisiones** ni **dónde están físicamente las cosas**, y **no
guarda** el dato climático que ya consulta. Un operador (o un jurado) no puede ver: en qué
régimen ENSO está el sistema, cuánto sol/nubes tiene la zona, ni cómo eso cambia la estrategia.

Este cambio añade **una vista nueva** (`/clima`, autocontenida), **una capa de datos
persistente** que va acumulando historia, y —en su fase final— la decisión del director sellada.

---

### Correcciones **v1.1** — verificadas contra el repo (2026-09-29)

Cuatro afirmaciones de la v1 estaban **equivocadas**. Se corrigen aquí **con la evidencia** (leído
en el repo, no supuesto). **Quien implemente debe usar estas, no las de la v1.**

| # | la v1 decía | la realidad verificada | efecto |
|---|---|---|---|
| **C1** | "entrada propia en el menú, junto a las actuales de `Sidebar.jsx`" (§3.7) | El menú del dashboard es el arreglo **`menuItems` en `Frontend/GestionFront/src/Dashboard/pages/App.jsx` (L97-104)** y el contenido se pinta con la cadena **`activeTab === …` (desde L234)**. `Sidebar.jsx` pertenece a `AuthPage.jsx` (L53), **no** al dashboard. El enrutado vive en **`src/router/app.routes.jsx`** + `src/router/AppRouter.jsx`, con **react-router 7.13 ya instalado** | la sección entra como **entrada en `menuItems` + rama de contenido**, o como **ruta anidada real** en `app.routes.jsx` |
| **C2** | endpoints en un router nuevo (`routes/climate.js`) **+ 1 línea en `app.js`** (§6) | `app.js:84` ya monta `app.use('/api/front', require('./routes/Front'))`, y ese archivo usa `validateJwt` **25 veces** | los endpoints van **en `routes/Front.js` bajo `/climate`** ⇒ **cero modificaciones en `app.js`** |
| **C3** | "Frontend: … sobre `PlotlyMini`" (§3.1) | `PlotlyMini.jsx` es un **mini** de **110 px**, con `showticklabels:false` y `showlegend:false` → **inservible** para A1/A3/A4 | se reutiliza **solo su patrón** (`purge` → `newPlot` → `resize`) y se crea **`ClimateChart.jsx`** a tamaño completo (mínimos del §3.7) |
| **C4** | "este patrón ya existe en la plataforma para el MOS: reutilizarlo" (§3.6) | **No existe.** El backend tiene 3 menciones de `stale`, todas en `forecastComparisonService.js` (`stale = proxy !== 'ecmwf_ifs025'`: un flag **semántico de proxy**, no un mecanismo de frescura) | el patrón `stale:true` + antigüedad **se crea** en `climateStoreService` |

**Confirmado tal cual en la v1** (no cambia): el módulo autocontenido (§3.7), los tamaños mínimos,
los anti-patrones prohibidos, el contrato (§5), el `append-only` con `.gitattributes`
`*.parquet -text`, y la fuente de coordenadas — `optimization/config/sites/pasto_narino.yaml`
líneas **11-14** (exactas).

---

## 1. Lo que YA existe en el repo (verificado leyéndolo)

| pieza | ruta | por qué importa aquí |
|---|---|---|
| Frontend **Vite + React** | `Frontend/GestionFront/` | dónde viven los componentes nuevos |
| **PlotlyMini** reutilizable | `Dashboard/components/charts/PlotlyMini.jsx` | se reutiliza; **regla de oro: `Plotly.purge(el)` antes de cada dibujo** (ya les pasó: gráficas apiladas) |
| Charts de optimización | `Dashboard/components/optimization/*` | estilo a seguir (SOC, costo, despacho) |
| **Editor de diagrama** con dispositivos | `Dashboard/components/diagram/*` | los activos existen como **nodos**, sin coordenadas geográficas |
| Servicios backend por dominio | `Backend/services/{dashboardAgent,optimizationService,forecastComparisonService,sensorDataService}.js` | molde para el servicio nuevo |
| Rutas/controladores | `Backend/routes/Front.js` + `Backend/controllers/Front.js` | dónde se añaden los endpoints |
| **MongoDB** ya en uso | `optimization/config/sites/pasto_narino.yaml` (`mongo.uri_env`) | destino natural para el espejo consultable de los datos |
| Config del sitio | `optimization/config/sites/pasto_narino.yaml` | **fuente canónica** de coordenadas y activos |
| Librerías de gráficas | `plotly.js-dist-min@2.35.3`, `recharts@2.10.0` | **no hay librería de mapas** |

**Hallazgo que condiciona el mapa**: `grep` de `latitude|longitude|coords|geojson|geometry` en
`Frontend/GestionFront/src` y `Backend` → **0 resultados**. Los **activos** no están
georreferenciados (el **sitio sí**, ver §3.2).

---

## 2. Fuentes de datos — VERIFICADAS (HTTP 200, sin API key, familia NOAA)

| dato | fuente | cobertura | estado |
|---|---|---|---|
| **ONI** | CPC `oni.ascii.txt` | 1950→ | ✅ validado con 4 eventos ancla |
| **RONI** | CPC `RONI.ascii.txt` | 1950→ | ✅ *(ya viene calculado: no se recalcula)* |
| **SOI** | CPC `soi` | 1951→ | ✅ |
| **Niño 1+2 / 3 / 3.4 / 4** | CPC `ersst5.nino.mth.91-20.ascii` | 1950→ | ✅ (ojo: pares *temp, anomalía*) |
| **MEI v2** | PSL `mei/data/meiv2.data` | 1979→ | ✅ |
| **PDO** | NCEI `ersst.v5.pdo.dat` | 1854→ | ✅ |
| derivados (calculados) | — | — | ✅ **TNI** = Niño1+2−Niño4 · **ep_cp** = Niño3−Niño4 |
| **Serie larga del sitio** | ERA5 vía Open-Meteo archive | **1940→2025** | ✅ 1 032 meses bajados |
| Radiación/nubosidad (rejilla) | NASA POWER | mensual | ⚠️ **usar con reserva**, ver §3.3 |
| **Tiles de mapa** | OSM · OpenTopoMap (relieve) · Esri (satélite) | — | ✅ los 3 HTTP 200, sin key |

---

## 3. Alcance del cambio (7 incrementos)

### 3.1 — `05.1` Índices climáticos en la plataforma (capa de contexto)

**Los 11 índices**, con **rol declarado** (no todos sirven para lo mismo — ver §3.7):

| rol | índice | para qué |
|---|---|---|
| **etiqueta del régimen** | **RONI** (+ ONI) | clasificar el modo sin la deriva del calentamiento |
| **predictor local** | **Niño 4** (y TNI) | el que mejor explica la nubosidad de Pasto |
| contexto | ONI, SOI, Niño 1+2/3/3.4, MEI v2, PDO, ep_cp | panel de índices |

- **Backend**: `Backend/services/climateContextService.js` (nuevo) — descarga/cachea, calcula el
  **modo vigente** y sirve `GET /api/climate/context` (§5).
- **Frontend**: `OniChart.jsx` (ONI **y RONI** superpuestos: se ve la brecha) +
  `IndicesPanel.jsx` (11 series, significancia y desfase anotados), sobre `PlotlyMini`.
- **Referencia exacta ya escrita y validada en el proyecto**:
  `scripts/descargar_indices.py` (parser de los 4 formatos) y
  `data/indices/indices_mensual.parquet` (11 columnas).

### 3.2 — `05.2` **MAPA LITERAL DE LA ZONA** (lo que pidió el autor)
- **Librería**: `leaflet` (+ `react-leaflet`) — sin API key, con atribución obligatoria.
- **Capas base conmutables** (las 3 verificadas): calle (OSM) · **relieve (OpenTopoMap)** ·
  **satélite (Esri)**. A 2 600 msnm el relieve no es decorativo: explica pendiente y acceso.
- **Marcadores**: el sitio + sus activos (PV, BESS, diésel, carga, sensores).
  → **Requiere georreferenciar**: nuevo campo **opcional**:
  ```js
  geo: { lat: Number, lon: Number, origen: 'manual'|'gps'|'estimado' }   // opcional
  ```
  Regla: si un activo **no** tiene `geo`, se dibuja en el sitio con un desplazamiento
  determinista — **nunca se inventa una coordenada**.
- **Versión estática para el manuscrito**: script Python que compone los tiles en un PNG con
  atribución. Ya validado que los tiles responden.
- **Coordenadas: YA ESTÁN EN EL REPO.** Fuente canónica →
  **`optimization/config/sites/pasto_narino.yaml`**:
  `site.latitude: 1.2136` · `site.longitude: -77.2811` · `site.elevation_masl: 2600` ·
  `site.timezone: America/Bogota` (corroborado en `HANDOFF_TECNICO/HANDOFF_TECNICO.md:72`,
  `docs/tesis/validacion_experimental.md:37` y
  `integracion_plataforma/cambio_01_mos_forecaster/itransformer/config_modelos.json:5-6`).
  **El mapa se ancla en ese YAML** — el frontend no escribe coordenadas a mano.
- **Activos**: el mismo YAML los declara con sus parámetros (`pv` 50 kWp · `bess` 200 kWh /
  50 kW · `wind` 100 kW (~0 en Pasto) · `load` 18 000 kWh/año) y los sensores
  (`solar_pv`, `load`, `bess`, `wind`, `weather`), **pero sin coordenada individual**.
  → Se dibujan en el sitio con desplazamiento determinista y rótulo
  *"posición estimada"* hasta que exista `geo` real. **Nunca se inventa una coordenada.**

### 3.3 — `05.3` **Mapa CONTINUO del departamento** (el estilo de atlas climático)

El autor pidió expresamente **superficie continua, no puntos** (como los mapas de atlas de
Nariño: mancha de color recortada al polígono + **hillshade** de relieve + municipios rotulados).

| pieza | herramienta |
|---|---|
| polígono de Nariño + municipios | `geopandas` + GADM/DANE (GeoJSON) |
| rejilla de la variable | **ERA5-Land (~11 km)** o ERA5 (~28 km) — **NO NASA POWER** (ver abajo) |
| **relieve** | SRTM 30 m (paquete `elevation`) → hillshade **y** covariable |
| interpolación | **regresión-kriging**: `variable ~ f(elevación, lat, lon, distancia al Pacífico, mes)` + kriging de residuos (`pykrige`) |
| recorte + raster | `rasterio` / `rioxarray` |
| figura | `matplotlib` (`contourf` + `LightSource`) |

**Por qué NO usar NASA POWER aquí** (medido hoy, no supuesto): contrastada contra ERA5 en el
mismo punto da **−20.2 % de GHI anual** (−30 % en agosto), **r = 0.55** en el ciclo anual, y su
**resolución nativa (~1° ≈ 110 km)** hace que pedir celdas de 0.5° sea **sobremuestreo**. Además
la **regla de credibilidad del autor** (no mezclar fuentes) exige quedarse en la familia ERA5,
que es la que ya usa toda la cadena iTransformer/MOS.

**La cara gris, obligatoria al pie de la figura**: una superficie continua *parece* más precisa
de lo que es → se declara **método + resolución efectiva + incertidumbre del nivel absoluto**.
El mapa dice **dónde** (patrón), no **cuánto exacto**.

**Combinación de mapas** (los tres, cada uno en su papel):
`scattergeo` regional (sin dependencias) · **Leaflet literal** (calles/relieve/satélite) ·
**superficie continua del departamento** (atlas, con hillshade).

### 3.4 — `05.4` **LA IA DE PREDICCIÓN, VISIBLE** (pedido del autor)
Tres piezas:
**a) El flujo**: `ECMWF/ERA5/histórico → iTransformer (33 variables) → MOS (LightGBM) → P10/P50/P90 → pvlib → potencia → despacho`.
**b) La arquitectura, con sus números medidos**:

| | **iTransformer v1** | PatchTST | LSTM |
|---|---|---|---|
| parámetros | **495,192** | 2,141,722 | 626,354 |
| parámetros atención | **entre variables** (33 tokens) | entre parches | — (secuencial) |
| entrenar (época) | **1.6 s** | 383.5 s | 7.8 s |
| inferencia CPU | **2.00 ms** | 26.03 ms | 38.18 ms |
| energía/inferencia | **0.0067 J** | 0.0424 J | 0.0631 J |

**c) El MOS**: 8 entradas (`proxy NWP` real + `v1` + `pers_h24` + `ghi_toa` + `hora` + `nubes` +
`temp` + `viento`) → LightGBM → corrección por horizonte. Backtest (400 ventanas, verdad ERA5,
4 anclas al decimal): **MOS 29.26** · ECMWF 30.93 · iTransformer 51.17 · PatchTST 54.34 ·
persistencia 58.15 → **el único que le gana al NWP crudo**, con ventaja **creciente** con el
horizonte (+0.5 % a 1-6 h → +5.6 % a 25-72 h).

> ⚠️ **Regla**: toda cifra de desempeño sale de un **artefacto versionado**; prohibido escribir
> números a mano en el frontend (ya hubo un `metrics.json` desincronizado: 62.017 vs 54.006 real).

### 3.5 — `05.5` La decisión visible (depende del bucle director)
Scoreboard de estrategias (U_robusta, descalificadas y **por qué**), desglose de la rúbrica con
los **pesos del modo vigente**, despacho 72 h + SoC, y **el acta sellada** (hash).

### 3.6 — `05.6` **LA CAPA DE DATOS PERSISTENTE** *(la plataforma "va guardando")*

Hoy cada consulta es efímera: si la fuente cambia o se cae, no queda rastro. Este incremento
hace que **el dato que la plataforma ya consulta se guarde**, con historia consultable.

**Qué se guarda** (5 familias):

| familia | contenido | frecuencia | tamaño |
|---|---|---|---|
| `clima_indices` | los 11 índices (mes nuevo) + los **crudos** tal como llegan | mensual | ~1 KB/mes |
| `clima_sitio` | serie ERA5 del sitio (nubosidad/GHI) incremental | diario/mensual | ~2 KB/mes |
| `clima_geo` | rejilla de radiación del departamento / capas del mapa | al regenerar | 100–500 KB |
| `figuras` | PNG/SVG generados (índices, mapas, puentes) | al regenerar | 100–500 KB c/u |
| `actas_director` (después) | decisión + su **lacre** (hash) | por decisión | ~2 KB |

**Cómo (reglas duras)**:
1. **Append-only**: un dato guardado **nunca se sobrescribe**. Cada descarga crea una **versión
   nueva**. (Misma regla que los modelos del proyecto: nuevos checkpoints, nunca pisar.)
2. **Metadata obligatoria** en cada registro: `fuente` · `descargado_en` (ISO) · `cobertura`
   (meses) · `sha256` · `licencia/atribución`.
3. **Dónde**: **archivos versionados en disco** como fuente de verdad
   (`data/clima/<familia>/<AAAA-MM>_<hash>.json` + un `manifest.json`) **+ espejo consultable en
   MongoDB** (la plataforma ya usa Mongo), con `_id` = hash. El frontend **no lee disco**:
   siempre a través del endpoint.
4. **Sin cron** (regla del autor): se refresca **al arrancar el servicio o a petición**.
5. **Degradación honesta**: si la fuente externa falla, se sirve la **última versión guardada**
   con `stale: true` y su antigüedad — **nunca** un gráfico vacío ni un cero inventado.
   (Este patrón ya existe en la plataforma para el MOS: reutilizarlo.)
6. **Valor**: (a) reproducibilidad — cada figura se rastrea a su dato; (b) la plataforma puede
   mostrar **evolución** (el modo cambió y la decisión cambió = el aprendizaje del bloque D);
   (c) auditoría.

> **Regla de oro del bloque**: *ningún número mostrado en la plataforma puede venir de un archivo
> no versionado ni de una constante escrita a mano.*

**7. Vigencia — contra las figuras congeladas** (el error que ya nos costó caro: un `metrics.json`
que decía 62.017 cuando el valor real era 54.006). Aquí **no hay imágenes fijas presentadas como
dato vivo**; se distinguen tres casos y ninguno se mezcla con otro:

| caso | ¿se actualiza? | cómo |
|---|---|---|
| **(a) gráficas vivas** (índices, panel, cono 72 h) | **sí, en cada carga** | se dibujan en el navegador (Plotly) **desde el JSON del endpoint**; no existe archivo intermedio |
| **(b) artefactos costosos** (mapa de superficie por regresión-kriging) | **sí, se regeneran** al cambiar el dato | se precalculan, pero con `generado_en` + `sha256` + `fuente`; si su dato base supera el umbral, la tarjeta se marca **"desactualizada"** y ofrece regenerar |
| **(c) instantáneas congeladas** (figuras de la tesis y paquete `reference/`) | **no, por definición** | es una **foto con fecha**: si el dato cambia se **publica una nueva**, nunca se sobrescribe |

**Regla visible obligatoria**: toda figura en la plataforma muestra **su fecha de generación y su
fuente**; ninguna se sirve sin ellas. Y el *fallback* por caída de fuente usa la **última versión
guardada** (con `stale: true` y su antigüedad), que es el patrón que la plataforma ya usa con el MOS.

### 3.7 — `05.7` **EL MÓDULO DE VISUALIZACIÓN** (prolijidad, no modales)

> **Motivo explícito**: en integraciones anteriores las gráficas terminaron **en modales** o
> **dentro del frame del diagrama**, en tamaños donde no se leían. Este bloque existe para que
> eso **no vuelva a pasar**, y es tan obligatorio como los datos.

**Principio**: el clima es un **módulo de primer nivel**, con **página propia y ancho completo**.
**No** es un modal, **no** es un widget del diagrama, **no** es una tarjeta lateral.

**Ubicación**: entrada propia en el menú (junto a las actuales de `Sidebar.jsx`) → ruta `/clima`.
Una entrada de menú = una página completa. El diagrama **enlaza** al módulo, nunca lo embebe.

**Estructura de la página** (una sola columna fluida, secciones de ancho completo):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CLIMA · Pasto, Nariño · 2 600 msnm          [ El Niño · RONI +1.36 ] [⟳]     │
│ última actualización: 2026-09-29 12:00 (hace 3 h) · CPC/NOAA · NCEI · PSL    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▲ ¿POR QUÉ?                                                                  │
│ ┌───────────────────────────┐ ┌──────────────────────────────────────────┐   │
│ │ A1  ONI y RONI (1950→hoy) │ │ A2  Pacífico: cajas Niño 1+2/3/3.4/4     │   │
│ └───────────────────────────┘ └──────────────────────────────────────────┘   │
│ ┌───────────────────────────┐ ┌──────────────────────────────────────────┐   │
│ │ A3  11 índices + roles    │ │ A4  El puente: nubosidad por modo        │   │
│ └───────────────────────────┘ └──────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ◆ ¿DÓNDE?                                                                    │
│ ┌─────────────────────────────────────┐ ┌─────────────────────────────────┐  │
│ │ A5  MAPA CONTINUO de Nariño         │ │ A6  MAPA LITERAL (Leaflet)      │  │
│ │     superficie + hillshade +        │ │     calles / relieve / satélite  │  │
│ │     municipios                      │ │     + activos del YAML           │  │
│ └─────────────────────────────────────┘ └─────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│ ● ¿QUÉ SABEMOS?          B1 cono 72 h (P10/P50/P90) · B2 hoy vs los 3 modos   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ■ LA IA DE PREDICCIÓN    flujo · arquitectura · desempeño (backtest)          │
├──────────────────────────────────────────────────────────────────────────────┤
│ ★ LA DECISIÓN            (cuando exista el bucle director)                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Tamaños mínimos (duros, no negociables)**:

| componente | ancho mín. | alto mín. | por qué |
|---|---|---|---|
| gráfico de líneas / panel | **380 px** | **260 px** | que se lean ejes, unidades y leyenda |
| **mapa** (continuo o Leaflet) | **640 px** | **480 px** | ver el polígono, el relieve y los rótulos |
| tarjeta de texto / insight | 300 px | 120 px | — |
| contenedor de la página | ancho completo | scroll vertical | nunca en dos columnas estrechas |

**Anti-patrones PROHIBIDOS** (cada uno tiene su porqué, ya sufrido en el repo):

1. **Gráficas dentro de modales** ✗ → si algo necesita detalle, se expande **en la propia
   página** (fila expandible o zoom dentro de la tarjeta).
2. **Gráficas dentro del frame del diagrama** ✗ → el diagrama **enlaza** (`/clima`), no embebe.
3. **Anchos fijos en píxeles que recortan** ✗ → contenedor fluido + `ResizeObserver` +
   `Plotly.Plots.resize` (y el `Plotly.purge` antes de cada dibujo).
4. **Series dibujadas como sparkline** cuando necesitan ejes ✗ → si no cabe, se enlaza.
5. **Ejes truncados sin declararlo** ✗ → se escribe *"eje truncado (84–91 %)"* (ya aplicado en A4).
6. **Scroll horizontal** ✗ → si aparece, el bloque está mal dimensionado.
7. **Cargar las 6 secciones a la vez** si eso congela la vista ✗ → carga por sección visible.

**Verificación medible** (no "se ve bien", sino medido con el navegador):

| # | prueba | criterio |
|---|---|---|
| V1 | en 1920×1080 y en 1366×768, medir el `bounding box` de **cada** gráfico | ≥ los mínimos de la tabla |
| V2 | comprobar que ningún contenedor de gráfico está **dentro** de un modal/overlay | 0 coincidencias |
| V3 | abrir y cerrar la vista 5 veces | mismo número de nodos de gráfico (sin acumulación) |
| V4 | redimensionar la ventana con la vista abierta | los ejes se reajustan, nada se recorta |
| V5 | con la vista al 100 % de zoom, leer los valores anotados | legibles en captura |

**Iteración**: se entrega `v1` con esta estructura, se **revisa con capturas a dos tamaños** y se
ajusta a partir del resultado. El layout es la hipótesis; la medición decide.

---

## 4. Lo que la plataforma mostrará (los hallazgos ya medidos, listos para mostrar)

Estos números salen del experimento de índices contra **1 032 meses** de ERA5 del sitio
(1940-2025) — se muestran, con su método y su salvedad:

| hallazgo | cifra | cómo se muestra |
|---|---|---|
| **El Niño = menos nube y más sol en Pasto** | nubosidad **−1.96 pts** (p=0.002) · GHI **+0.21 kWh/m²/día ≈ +4.4 %** (p<0.001, d=+0.46) | panel "qué esperar este trimestre" |
| **Quién manda es el Pacífico CENTRAL, no el costero** | Niño 4: r=−0.233 (p=1e-12) vs Niño 1+2: r=−0.056 (**n.s.**) | el ranking de índices (figura A4) |
| **El efecto es modesto** | **2.5–5.4 %** de la varianza mensual | se declara junto a la cifra (no se infla) |
| **ONI vs RONI cambian el modo 15 % de los meses** | 138 de 919 meses | ONI y RONI superpuestos en A3 |
| **El rótulo honesto ≠ el mejor predictor** | RONI: r=−0.024 (n.s.) · ONI: −0.140 · **Niño 4: −0.233** | tabla de roles (§3.1) |

---

## 5. Contrato de datos

```json
GET /api/climate/context
{
  "generado": "2026-09-29T12:00:00-05:00",
  "stale": false,
  "sitio": { "nombre": "Pasto", "lat": 1.2136, "lon": -77.2811,
             "altitud_m": 2600, "tz": "America/Bogota" },
  "modo_vigente": { "oni": 1.80, "roni": 1.36, "clasificacion": "nino",
                    "periodo": "JJA 2026", "fuente": "CPC/NOAA",
                    "fuente_clasificacion": "RONI" },
  "indices": { "mes": ["..."], "oni": [..], "roni": [..], "soi": [..], "nino4": [..],
               "nino12": [..], "nino3": [..], "nino34": [..], "pdo": [..],
               "mei": [..], "tni": [..], "ep_cp": [..] },
  "roles": { "etiqueta": "roni", "predictor_local": "nino4" },
  "climatologia_sitio": { "nubes_pct": 88.4, "ghi_kwh_m2_dia": 4.91,
                          "periodo": "1940-2025" },
  "ventanas_modo": { "nina": "2020-11", "neutral": "2023-04", "nino": "2023-12" },
  "mapa": { "capas_base": ["osm", "topo", "satelite"],
            "activos": [ { "id": "pv1", "tipo": "pv", "lat": null, "lon": null,
                           "geo_origen": null } ] },
  "climatologia_geo": { "variable": "ghi", "rejilla": { "lat": [..], "lon": [..],
                                                        "valor": [[..]] } },
  "meta": { "sha256": "…", "descargado_en": "…", "fuente": "CPC/NOAA · NCEI · PSL" }
}
```

```
GET /api/climate/snapshot?familia=clima_indices&desde=1950-01   → versiones guardadas + metadata
GET /api/climate/figuras                                        → catálogo (hash, fecha, fuente)
POST /api/climate/refresh                                       → fuerza descarga (protegido)
```

**Reglas del contrato**: (a) toda serie declara **fuente** y **fecha de descarga**;
(b) los `null` se muestran *"sin dato"*, **jamás como 0**; (c) nunca se dibuja un valor que no
venga del endpoint; (d) si `stale = true`, se muestra el aviso y la antigüedad.

---

## 6. Archivos que el cambio toca (declaración explícita — regla del repo)

**Se AÑADEN (todos nuevos — decisión del autor: módulo autocontenido):**
```
integracion_plataforma/cambio_05_contexto_climatico_visual/README.md       (este plan)
integracion_plataforma/cambio_05_contexto_climatico_visual/VERIFICACION.md (se escribe al verificar)
Backend/services/climateContextService.js     (índices + modo + climatología)
Backend/services/climateStoreService.js       (capa persistente: versiones + manifest + espejo Mongo)
Backend/routes/climate.js                     (router propio)
Frontend/GestionFront/src/climate/ClimatePage.jsx          (página /clima)
Frontend/GestionFront/src/climate/{OniChart,IndicesPanel,ZoneMap,ClimaContinua,PredictionAI,ClimaInsights}.jsx
data/clima/<familia>/…                        (almacén versionado; ver §3.6)
```

**Se MODIFICA: 3 líneas aditivas, y ninguna toca lógica existente.**

| archivo | cambio | líneas |
|---|---|---|
| `Backend/app.js` | `app.use('/api/climate', require('./routes/climate'))` | **+1** |
| Router del frontend | una entrada de ruta para `/clima` | **+1** |
| `Frontend/GestionFront/package.json` | deps `leaflet` + `react-leaflet` | **+2** |

> **Honestidad sobre "cero modificaciones"**: montar una URL nueva exige un registro de cada lado
> (Express y el router del frontend). **No se modifica ni una línea de lógica existente** y si el
> módulo falla **no afecta a nada más**. Si se exigiera cero absoluto, la variante es un **HTML
> autocontenido** servido desde carpeta estática.

---

## 7. Criterios de aceptación (verificables ejecutando)

1. `GET /api/climate/context` responde 200 y su `modo_vigente` **coincide con el CPC** (hoy:
   ONI **+1.80**, RONI **+1.36** → "nino").
2. La figura del ONI reproduce **los 4 eventos ancla** (1997-98, 2010-11, 2015-16, 2020-22).
3. El mapa carga tiles reales de las 3 capas y el marcador cae en las coordenadas del YAML.
4. Un activo **sin** `geo` no genera coordenadas inventadas (se marca "posición estimada").
5. Ningún componente viola la regla de `Plotly.purge` (abrir/cerrar 5 veces no duplica gráficos).
6. Con el backend caído, la vista muestra *"sin datos"* — no un gráfico vacío ni error en consola.
7. **Re-ejecutar el refresco NO sobrescribe**: crea versión nueva y el histórico sigue consultable.
8. Toda figura servida lleva **hash + fecha + fuente**, rastreable al dato que la produjo.
9. Si la fuente externa falla, la vista muestra la **última versión** con aviso `stale`, nunca vacío.
10. El espejo en Mongo se puede reconstruir **desde cero** con el manifest (sin pérdida).
11. **Tamaños**: medido en el navegador, **ningún** gráfico por debajo de 380×260 px ni ningún
    mapa por debajo de 640×480 px, tanto en 1920×1080 como en 1366×768.
12. **Cero gráficos en modales**: ninguna tarjeta de gráfico está dentro de un overlay/modal
    (comprobado en el DOM).
13. **Sin scroll horizontal** en ninguna resolución soportada (1280 px de ancho en adelante).

---

## 8. Riesgos y mitigaciones

| riesgo | mitigación |
|---|---|
| Añadir `leaflet` a un frontend desplegado | versión fijada + build en la VM; si falla, se cae solo la vista nueva |
| Tiles de terceros (límites de uso) | atribución obligatoria + uso moderado + caché en el backend |
| El esquema `geo` toca documentos existentes | campo **opcional** + lectura defensiva (`device.geo?.lat ?? null`) |
| **El almacén crece sin control** | familias acotadas + retención por política (crudos comprimibles; figuras: se conservan las publicadas) |
| **Licencia/atribución de las fuentes** | `licencia` obligatoria en la metadata; CPC/NCEI/PSL son dominio público con cita; OSM/OpenTopoMap requieren atribución visible |
| Duplicar lógica (Python y JS) | el endpoint es la única fuente para el frontend; el script Python solo produce datos |
| Deriva entre el proyecto y la VM | toda verificación se hace **sobre el repo, ejecutando** |

---

## 9. Decisiones del autor (RESUELTAS) y pendientes

| # | decisión | estado |
|---|---|---|
| 1 | Coordenadas | ✅ **están en el repo** (§3.2) |
| 2 | "Histórico" | ✅ historia del clima de la zona (§3.3) |
| 3 | Integración | ✅ módulo autocontenido `/clima` (§6) |
| 4 | Copia del plan al repo | ✅ autorizada |
| 5 | La IA visible | ✅ incorporada (§3.4) |
| 6 | Índices NOAA + RONI | ✅ **familia NOAA, sin recalcular** (§2, §3.1) |
| 7 | Experimentar con los índices | ✅ hecho; hallazgos listos para mostrar (§4) |
| 8 | **Guardar datos en la plataforma** | ✅ incorporado como **§3.6** |
| 9 | **Integración prolija: módulo propio, no modales ni frames del diagrama** | ✅ incorporado como **§3.7** (con tamaños mínimos medibles y anti-patrones prohibidos) |

**Pendientes (no bloquean)**:
1. ¿Los activos se georreferencian a mano o se acepta *"posición estimada"*? (por defecto lo 2º)
2. ¿La superficie continua (`05.3`) se hace con **ERA5-Land 11 km** (más detalle) o **ERA5 28 km**
   (consistencia exacta con la cadena ya validada)?
3. ¿Se sigue con el **mapa de teleconexión** (la correlación índice↔nubosidad punto por punto)?
