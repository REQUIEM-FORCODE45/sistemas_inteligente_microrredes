# VERIFICACION FASE 2 — Fix de graficas + Mapa de calor de Narino (A5)

Evidencia **medida ejecutando**. Fecha: 2026-10-02.
Metodo: Chrome headless + puppeteer-core sobre `yarn dev`, pagina `/clima` real
con fixtures = `GET /front/climate/context` y `/front/climate/geo` en vivo
(express efimeros + JWT de prueba). Capturas: `a1_fix.png`, `a5_*.png`.

## 1. Bug del eje 1860 — causa y fix (medido)

Causa: `indices.mes` = union de todas las series (PDO desde **1854**, MEI hasta
2026-12); ONI/RONI/Nino son `null` en 1157 de 2076 meses. Los charts graficaban
`x` completo -> 96 anos vacios que aplastaban la senal.
Fix: `src/climate/window.js` (`dataSpan`/`recentSpan`/`sliceSeries`) — cada
grafico se recorta a su tramo con dato. Medido en DOM (primer xtick):

| grafico | antes | despues |
|---|---|---|
| A1 ONI+RONI | 1860 | **1950** (`1950-01 → 2026-07` en el titulo) |
| A2 cajas Nino | 1860 | **1950** (`1950-01 → 2026-06`) |
| A3 panel | 1860 | **ventana reciente** (`Jan 2024 →`, ultimos 36 meses con dato, como `fig_indices.py`) |

El endpoint no se toco: los `null` historicos siguen siendo la verdad.

## 2. A5 — Mapa de calor de Narino (dos capas conmutables)

Artefacto v1: `data/clima/clima_geo/2026-10_c2f40b51bef0188e.json`
(35 551 bytes) + `manifest.json`. Medido del JSON:

- Poligono GADM 4.1: 17 anillos, 1669 pts, bbox lon −79.01/−76.83 · lat 0.36/2.68.
- Rejilla ERA5 0.25°: 11×11, **40 celdas** dentro del poligono.
- `nubosidad` % rango **[83.1, 97.3]**, 40/40 validas.
- `teleconexion_nino4` r rango **[−0.26, 0.03]**, 40/40 validas (>=60 meses solape).
- Periodo efectivo **1950-01..2009-12** (ver §4: las decadas 2010s/2020s cayeron por
  429 durante la primera corrida; hay re-corida en curso que las agregara como
  version nueva append-only).
- Lectura: El Nino = menos nube en casi todo Narino (r negativa), mas fuerte en
  el centro-oriente (azul, r≈−0.26); costa pacifica casi neutra. Coherente con el
  §4 del plan (Nino 4 manda, efecto modesto).

Endpoints (JWT, medidos en vivo):

- `GET /api/front/climate/geo` → **200**, `{meta, geo}` con `poligono/lat/lon/capas`.
- Sin artefacto → **503** con instruccion de generacion. Sin JWT → **401**.
- `/context.climatologia_geo` → `{disponible:true, sha256:c2f40b51bef0188e,
  descargado_en, fuente, capas:[nubosidad, teleconexion_nino4]}` (liviano; el
  blob va por `/geo`).

## 3. Medidas navegador (post-fixes, 1920×1080 y 1366×768)

| grafico/mapa | 1920 | 1366 | minimo |
|---|---|---|---|
| A1/A2/A3 | 898×300 | 621×300 | ≥380×260 ✓ |
| A4 | 1870×300 | 1316×300 | ✓ |
| **A5 mapa** | **1870×480** | **1316×480** | ≥640×480 ✓ |

- V2: 0 graficos/mapas en modales. Sin scroll horizontal (1920 y 1366).
- V3: 5 ciclos montar/desmontar → `.plot-container` constante (**5** = 4 charts + mapa), mapa OK 10/10, 0 `pageerror`.
- Toggle de capas: el header cambia a `Teleconexión Niño 4 ↔ nubes (r)` y el colorbar a `r`.
- Encuadre: `xaxis.range=[−79.36,−76.48]` medido en `_fullLayout` (el `constrain:domain`
  + `scaleanchor 1:1` evita que Plotly estire x a −85..−70). Leyenda: solo
  `Nariño (GADM)` + `Pasto (sitio)` (borde en un solo trace).
- `yarn build` ✓ 21.58 s. `yarn lint`: **0** en `src/climate/*`.

## 4. Nota operativa: re-corida del precomputo

La primera corrida sufrio 429 de Open-Meteo (doble proceso tras un `kill` que no
mato a tiempo + lote inicial de 40 ubicaciones). El artefacto v1 quedo con
1950–2009 (valido y verificado arriba). Quedo corriendo una re-corida con lotes
de 8 + backoff + **cache** (`.cache_clima_geo/`, gitignored): al terminar agrega
la version completa como **version nueva** sin tocar la v1; la pagina la toma
sola. Comando: `python3 -m climate.build_clima_geo` (desde `optimization/`).

## 5. A3 con selector (2026-10-02, segunda iteracion)

El panel de 5 series juntas no se leia (escalas mezcladas). A3 pasa a **una
serie a la vez** con `<select data-testid="select-a3">` (SOI, PDO, MEI v2, TNI,
EP−CP) y toggle **Todo/Reciente** (`data-testid="toggle-a3"`). Cada indice con
su unidad real en el eje Y (°C o indice) + rol + ventana efectiva en el
subtitulo. Medido en Chrome headless (1920×1080 y 1366×768):

- A3 898×300 / 621×300 ≥380×260 ✓. Opciones del select: 5/5.
- Select → PDO: 1 trace, leyenda [PDO], eje desde 1900 (historia adaptativa).
- Toggle Reciente: Jan 2024 → Jul 2026 (36 meses).
- 5 cambios de select: `.plot-container`=1, `children`=1 (sin acumulacion).
- 0 `pageerror` en ambos tamanos. `yarn build` ✓. Lint 0 en `src/climate/*`.

## Archivos

Nuevos: `Frontend/.../src/climate/{window.js,ZoneMap.jsx}`,
`optimization/climate/{__init__.py,build_clima_geo.py}`,
`cambio_05.../VERIFICACION_FASE2.md`.
Modificados: `OniChart.jsx`, `IndicesPanel.jsx`, `ClimatePage.jsx` (seccion
¿DONDE? + fetch `/geo` con pendiente honesto si no hay artefacto),
`Backend/routes/Front.js` (`GET /climate/geo` + `climatologia_geo` liviano),
`.gitignore` (`data/clima/`, `.cache_clima_geo/`).
