# VERIFICACION MVP — Cambio 05 (05.1 + 05.6 + 05.7, ERA5 28 km)

Evidencia **medida ejecutando**, no descripciones. Fecha: 2026-09-30.
Método frontend: Chrome headless (system google-chrome) + puppeteer-core sobre
`yarn dev`, página `/clima` real con fixture = `GET /front/climate/context` en vivo.
Método backend: router `Front.js` montado en express efímero + JWT firmado con
`SECRET_JWT_SEED` de prueba (puertos 3100–3102, sin tocar servicios reales).

## F0 — Semilla (26/26 sha256, prefijo 16 hex)

Medido `sha256sum | cut -c1-16`: los 26 coinciden con `reference/README.md`
(`b9f767997de896a9` parquet índices … `6d4ff62095847e46` verificar_fuente_power.py).
Parquet: `indices_mensual.parquet` 2072 filas × 11 índices + `mes`;
`sitio_pasto_1940_2025.parquet` 31411 filas diarias.
Sitio del YAML: lat 1.2136 · lon −77.2811 · 2600 msnm · America/Bogota.

## Criterios §7 (MVP: 1, 2, 4–10; el 3 y 11-mapas son fase 2)

| # | Medición | Resultado |
|---|---|---|
| 1 | `GET /api/front/climate/context` (JWT) | **200**, `modo_vigente={oni:1.80, roni:1.36, nino, JJA 2026, RONI}`, `stale:false` (red NOAA alcanzable), 2076 meses, `meta.sha256=434ba3242efb45d6` |
| 2 | `verificarAnclas()` sobre la serie | **4/4**: 1997-12 +2.37 · 2010-11 −1.57 · 2015-12 +2.59 · 2020-11 −1.11 |
| 4 | `mapa.activos` del endpoint | `pv1/bess1` con `lat/lon=null, geo_origen=null` — **cero coordenadas inventadas** |
| 5 | 5 ciclos montar/desmontar × 2 viewports | `svg.main-svg` constante **12** (3 internos de plotly × 4 gráficos), `children=1` por div, `.plot-container=1` — **sin acumulación** |
| 6 | `GridAPI.get` rechazada (backend caído) | **"Sin datos climáticos" + Reintentar**, 0 gráficos, 0 `pageerror` |
| 7 | `snapshot` → 2× `POST refresh` → `snapshot` | **3 → 5 versiones**, archivos distintos, la primera (`2026-09_34eb85a614c9c399.json`) sigue listada — **no sobrescribe** |
| 8 | `meta` de cada respuesta | `sha256 + descargado_en + fuente` siempre presentes |
| 9 | Fuente simulada caída (stub `getContext` sin red) | **200 + `stale:true` + `antiguedad`**, 2076 meses servidos del almacén |
| 10 | `reconstruirEspejo()` | Implementada (`climateStoreService.js`); **pendiente de medir: no hay Mongo local** |

Sin JWT → **401** (validateJwt). Cobertura por índice: oni/roni 919 · nino 918 · soi 900 · pdo 2072 · mei 576 · tni/ep_cp 918.

## V1–V5 (§3.7, `getBoundingClientRect`, scale=1)

| gráfico | 1920×1080 | 1366×768 | resize cruzado |
|---|---|---|---|
| A1 ONI/RONI | 898×300 | 621×300 | 621×260 / 898×260 sin recorte |
| A2 cajas Niño | 898×300 | 621×300 | — |
| A3 índices | 898×300 | 621×300 | — |
| A4 puente | 1870×300 | 1316×300 | — |

- **V1**: mínimo medido 621×300 ≥ 380×260 en los 4 gráficos y 2 tamaños. **Pasa.**
- **V2**: selectores `[role=dialog], .modal, .overlay` con `[data-testid^=chart-]` dentro = **0**. **Pasa.**
- **V3**: tabla §7.5 (12 constante en 10/10 ciclos). **Pasa.**
- **V4**: tras `setViewport` cruzado, A1 621×260 y 898×260, `clipped=false`. **Pasa.**
- **V5**: ejes/leyendas/valores legibles en captura (texto del DOM verificado: ticks, ±0.5 °C, RONI 1.36). **Pasa.**
- Sin scroll horizontal: `scrollWidth == innerWidth` en 1920 y 1366. Consola: 1 único 404 = favicon del harness (el harness temporal no tenía; la app real sí).

## Calidad

- `yarn build`: **✓ 18.35 s**, sin errores.
- `yarn lint`: **0 avisos/errores** en `src/climate/*` (los 27 errores restantes son preexistentes: `store.js`, `ui/*`, `vite.config.js`).
- Harness de medición (`climate-harness.html`, `__harness.jsx`, `__fixture.json`) **eliminado** tras medir.
- `data/clima/` (5 versiones, ~800 KB) en `.gitignore`: regenerable vía refresh desde `reference/`; el manifest es la verdad local y el espejo Mongo su réplica.

## Archivos del MVP

Nuevos: `Backend/services/climateContextService.js`, `climateStoreService.js`,
`Frontend/.../src/climate/{ClimatePage,ClimateChart,OniChart,IndicesPanel,ClimaInsights}.jsx`.
Modificados (aditivo): `Backend/routes/Front.js` (+4 endpoints `/climate/*`),
`Dashboard/pages/App.jsx` (menú `clima` + URL real `/clima` + rama de contenido),
`locales/{es,en}.json` (`nav.clima`), `integracion_plataforma/README.md` (fila 05),
`.gitignore` (`data/clima/`). `Backend/app.js`: **cero toques** (C2).
