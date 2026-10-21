# Cambio 17 — Clima UX (el módulo climático se vuelve producto)

El módulo `/clima` funcionaba pero parecía consola: textos de desarrollador
("genera con python3…"), gráficas estáticas (sin toolbar, hover crudo, ejes
sin formato), títulos en jerga (A2·A3…, "Mes"), y en móvil desbordaba y el
mapa mostraba un error genérico aunque el artefacto existiera.

Este cambio lo vuelve producto sin tocar el modelo ni los datos:

## Frontend (`src/climate/`, 7 archivos)

| Archivo | Cambio |
|---|---|
| `ClimateChart.jsx` | Motor pro: toolbar al hover (zoom/pan/reset), `hovermode:'x unified'` con estilo oscuro, gridlines sutiles, ticks de fecha por ventana (`%Y` / `%b %Y`), transiciones 350 ms, responsive real (el `minWidth` solo ≥768 px; en móvil manda el contenedor) |
| `ClimatePage.jsx` | Hero con modo vigente KPI + impacto en lenguaje de microrred; chip de frescura legible ("sincronizado hace X" / STALE); botón Actualizar con estados; skeletons de carga; 3 estados del mapa (disponible→reintentar, inexistente→Generar, error genérico) usando `climatologia_geo.disponible`; `overflow-x: hidden`; hash plegado en `<details>` |
| `IndicesPanel.jsx` | Títulos humanos ("Cajas Niño…", "Índices de contexto: …") |
| `ClimaInsights.jsx` | Título humano + KPIs con icono/acento/delta ↗ |
| `ZoneMap.jsx` | Título humano ("Mapa de nubosidad de Nariño") |
| `OniChart.jsx` | Título humano ("Oscilación del Pacífico…") |

**Sin códigos A# en la UI** (decisión del autor: nadie los entiende). Quedan en
`data-testid` (`chart-a1-oni`, `chart-a2-nino`, `chart-a3-indices`,
`chart-a4-puente`, `map-a5-narino`, `select-a3`, `toggle-a3`) y en esta spec.

## Backend (dedup + auto-sync + mapa bajo demanda)

| Pieza | Cambio |
|---|---|
| `climateStoreService.js` | `sha_contenido` por versión + `hayCambios(familia, datos)`; exporta `espejoMongo` |
| `routes/Front.js` | `/context` y `/refresh` con dedup (versión nueva SOLO si cambia; `updated:true/false`); `GET /climate/sync` (estado); `POST /climate/geo/build` + `GET /climate/geo/build/status`; sync arranca lazy (cero toques a `app.js`); `/geo` 503 con `necesita_generacion:true` en vez de instrucción de terminal |
| `climateSyncService.js` (nuevo) | Auto-sync cada 24 h (primer tick a los 5 min del arranque): mismo refresh-dedup del botón; sin red no hace nada (el endpoint ya sirve la última con `stale`) |
| `climateGeoBuild.js` (nuevo) | Spawn de `python3 -m climate.build_clima_geo` (cwd `optimization/`, 1 a la vez); al terminar OK espeja la última `clima_geo` a Mongo |
| `build_clima_geo.py` | `CLIMA_GEO_CACHE_DIR` (durable `data/clima/.cache_geo` cuando lo lanza el backend; igual que antes por defecto) |

## Reglas que no cambian

- Append-only; la semilla `reference/` sigue siendo la verdad del arranque sin red ni Mongo.
- Mongo guarda parseados y artefactos; nunca sustituye la semilla.
- Sin cifras a mano; manifiesto con sha256 completo recalculado en el mismo commit.
