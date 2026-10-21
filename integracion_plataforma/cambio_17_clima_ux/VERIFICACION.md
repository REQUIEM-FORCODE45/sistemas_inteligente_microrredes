# VERIFICACION — Cambio 17 (clima UX + P7)

Método: Playwright + Chromium headless shell, misma sesión/token (`sensor_token`
+ `sensor_user`; causa raíz del 16), página `/clima` real contra backend en
vivo. Fecha: 2026-10-21. Figuras en `reference/figuras/`.

## V1–V2 (escritorio: 1920×1080 y 1366×768)

| gráfico | 1920 | 1366 | mínimo |
|---|---|---|---|
| chart-a1-oni | 578×300 | 467×300 | ≥380×260 ✓ |
| chart-a2-nino | 578×300 | 467×300 | ✓ |
| chart-a3-indices | 578×300 | 467×300 | ✓ |
| chart-a4-puente | 1230×300 | 1008×300 | ✓ |
| map-a5-narino | 1230×480 | 1008×480 | ≥640×480 ✓ |

- V2: 0 gráficos en modales (`[role=dialog]/.modal/.overlay` con chart dentro).
- Sin scroll horizontal (`scrollWidth == innerWidth`) en ambos tamaños.
- Hero "Modo vigente" y chip "sincronizado …" presentes en DOM.

## V3 (sin acumulación)

5 recargas × `/clima`: `.plot-container` constante **5**, `svg.main-svg`
constante **15**, 0 `pageerror`. (15 = 3 internos de Plotly × 5 gráficos;
el mapa también renderiza traces SVG.)

## V4 (resize cruzado 1920↔1366)

Representado por las dos pasadas V1: mismos mínimos, `clipped=false`
(`scrollWidth == innerWidth` en ambas). El `ResizeObserver` + `Plots.resize`
re-encuadra sin recorte.

## V5 (legibilidad en DOM)

Ticks de año presentes, `±0.5` visible, leyenda ONI+RONI, valor RONI
renderizado (`RONI 1.69`), 10 títulos de ejes. Captura
`c17_clima_desktop.png` como prueba visual.

## V6 móvil (390×844 y 375×667)

- Sin scroll horizontal en ambos; altura mínima de gráfico 300 (≥240).
- Hero arriba del viewport (`top≈282`).
- Los 3 estados del mapa se disparan y distinguen (stub de red en el
  harness): `/geo` 503+`necesita_generacion` → tarjeta "Generar mapa";
  `/geo` 500 → "no cargó / Reintentar". El catch mudo quedó eliminado.

## P7 (auto-reporte del cambio 05, medido aquí)

- `yarn build`: **✓ 2.64 s**, sin errores (antes: 18.35 s auto-reportado).
- `yarn lint src/climate/*`: **0 avisos/errores**.
- `reconstruirEspejo()` contra Mongo Atlas: `{total: 34, ok: 34, fallo: 0}`.
- V1–V5 redun: ver arriba (mismos umbrales de la auditoría, todos PASS).

## Backend (medido en vivo)

- `POST /climate/refresh` ×2 seguidos: primero `updated:true` (una versión
  nueva, la primera con `sha_contenido`), segundo `updated:false` (dedup:
  sin versión spam).
- `GET /climate/sync` → `{active:true, every_hours:24}`.
- `GET /climate/geo/build/status` → `state:idle` (el build completo NO se
  corre aquí: tarda ~30-60 min con 429; queda el endpoint + estado).
