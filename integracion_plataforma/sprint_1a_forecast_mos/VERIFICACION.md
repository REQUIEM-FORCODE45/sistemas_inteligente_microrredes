# VERIFICACIÓN — Sprint 1a (paquete A: iTransformer sano, con tests y en la página)

Código verificado en `f60b849` (los dos runs registran ese commit en su
`skill.json`). Método: protocolo existente (`walk_forward_mae` +
`compare_providers.py`), sin métrica nueva. Todo sale de artefactos
versionados; lo no medido se declara.

## Cierre del paquete A (los 4 artefactos)

1. `python -m optimization.prediction.compare_providers --providers
   mos,patchtst,itransformer` **termina** (20 meses, `--no-resume`,
   132.608 filas en 20 parciales) y escribe `comparativa_resumen.csv` /
   `comparativa_series.json` canónicos (periodo 2025-02-13..2026-10-14).
2. Captura del panel con **tres contendientes** (mos, patchtst,
   itransformer + real + crudo en el overlay):
   `reference/resultados/s1a_panel_overlay_3contendientes.png`
   (leyenda verificada por DOM + 0 `pageerror`; el endpoint
   `/prediction/forecast/comparison/series` sirve los 4 contendientes y
   `/comparison` devuelve 45 filas `itransformer` en la tabla).
   Nota: itransformer pinta en gris (fallback `CONTENDER_COLORS[c] ||
   '#6b7280'`); la UI no se tocó por decisión del documento §5.3.
3. Tabla de MAE con el iTransformer incluido (abajo). Es la respuesta a
   "cuánto aporta el LightGBM del MOS".
4. Tests nuevos en verde: `test_mos_forecaster.py` **9/9** (salida del
   runner abajo).

## Tabla principal (canónica, 20 meses, step 24h, n=518 por celda, h=12)

A h=12 porque es el único horizonte con filas diurnas en esta ventana
(ver §"Artefacto del protocolo"). MAE:

| variable | MOS | iTransformer | Δ MOS vs ITR | patchtst |
|---|---|---|---|---|
| GHI (W/m²) | 77.50 | 137.54 | **−43.7 %** | 146.87 |
| DNI (W/m²) | 135.79 | 208.93 | **−35.0 %** | 222.47 |
| DHI (W/m²) | 62.37 | 68.76 | **−9.3 %** | 66.47 |
| temperatura (°C) | 0.90 | 1.25 | **−28.0 %** | 1.30 |
| humedad (%) | 5.96 | 8.98 | **−33.6 %** | 9.34 |
| nubes (%) | 28.89 | 16.96 | **+70.3 % (peor)** | 17.10 |
| presión (hPa) | 0.38 | 0.55 | **−30.9 %** | 0.56 |
| precipitación (mm) | 0.76 | 0.84 | −9.5 % | 0.85 |
| viento 100 m (m/s) | 4.86 | 2.27 | **+114 % (peor)** | 2.30 |
| viento 10 m (m/s) | 3.71 | 1.62 | **+129 % (peor)** | 1.65 |

H=24 (variables no radiativas, n=518): temp −23.4 %, humedad −25.2 %,
presión −41.7 %, precipitación −11.1 %, nubes **+15.3 % (peor)**,
viento10 +14.9 %, viento100 +43.8 %.

Lectura: el LightGBM aporta −44 % GHI, −35 % DNI, −28 % temp, −34 %
humedad, −31 % presión. **No aporta** en nubes (pass-through del NWP:
MOS = crudo 28.89 a h=12) ni en viento (lo degrada ×2: proxy ×1.3 de
`_PROXY_SCALE` + booster). El iTransformer crudo **le gana al MOS en
nubes** (16.96 vs 28.89) y en viento. Limitaciones ya conocidas del MOS
(documento §4.1/§10), ahora tabuladas.

## Suplemento h=24 en GHI (step 6h, 2 meses, n=50, periodo 2026-08-15..2026-10-14)

`results/pasto_narino/forecast/sprint1a_h24_ghi/` (outdir propio, no
toca el canónico):

| variable h=24 | MOS | iTransformer | Δ | patchtst | ecmwf_crudo |
|---|---|---|---|---|---|
| GHI | 56.82 | 87.08 | **−34.8 %** | 67.81 | **47.30** |
| DNI | 99.81 | 151.45 | **−34.1 %** | 129.02 | N/A |
| DHI | 45.94 | 45.06 | +1.9 % (no aporta) | 51.84 | N/A |
| temp | 0.74 | 0.96 | −22.9 % | 1.02 | 1.32 |

**Hallazgo que no se esconde**: en esta ventana reciente el NWP crudo
(47.30) **le gana al MOS** (56.82) en GHI h=24. La ventaja del MOS sobre
el crudo, que en la ventana vieja era amplia, aquí se estrecha/invierte;
la ventaja sobre el iTransformer crudo (−35 %) y sobre PatchTST (−16 %)
se mantiene. Ventana corta (n=50) + same-family ERA5/ECMWF: se reporta,
no se ajusta.

## Artefacto del protocolo (declarado, no es un bug)

Con step 24 h las anclas caen siempre a la misma hora (00:00) y el filtro
`daytime_only` (GHI_real > 50) solo deja filas diurnas en **h=12**
(h=1/6/24/48/72 caen de noche → NaN parejo para los 6 contendientes).
Mismo periodo y mismos pasos para todos: la comparación intra-run es
justa; lo que no hay es número de radiación fuera de h=12 con step 24.
Por eso el suplemento step 6h (el propio `compare_providers.py`
documenta: "step_h 6 cubre los 6 horizontes en radiación").

## A.0/A.1/A.2 — tests y hardening

`optimization/tests/test_mos_forecaster.py`, 9 tests herméticos (sin
red; modelos reales, contexto/proxy sintéticos): contrato 72×10
tz-aware sin NaN; 10 boosters declaran 8 features; monotonía
P10≤P50≤P90 en 11.520 tripletas (pre-A.1: ~27 cruces esperados);
recorte físico con conteo exacto; horizonte>72 h falla antes de la red;
registro del provider en la factory. **Prueba mutante**: con la guarda
de features retirada del src, `test_guarda_features...` **FALLA**
(verificado por edición temporal + restore); con la guarda, pasa.
`strict=True` carga 42/42 sin warning (9 cargas en la suite + live).

## Recortes medidos (nada silencioso)

Vivo (72 h, 2026-10-28): `{hr:1, nubes:11, precip:21}`. Backtest
(20 meses, 500+ pases): típico `{nubes:40-65, precip:4-48, dni:1-6,
ghi:0-2}` — el mismo perfil del documento §4.1 (nubes worst offender).
Cada pase del provider lo loguea (`itransformer recortes físicos ...`).

## Lo que NO se hizo (ni se tocó)

MILP, conformal, capítulos/Fase 1, checkpoints/boosters congelados
(solo lectura), UI (una línea de backend: `--providers`), `FORECASTER`
default (sigue `openmeteo`; el cambio a `mos` es decisión del autor con
tabla Fase 1 re-corrida — fuera de este paquete). Paquete B bloqueado
por datos (sin parquet de entrenamiento en repo/VM) + ingesta parada
desde 13-oct: declarado en el reporte, no trabajado.

## Salida del runner (tests nuevos)

```text
optimization/tests/test_mos_forecaster.py .........  [100%]
9 passed in ~18s
```

## Evidencia versionada

`reference/resultados/`: captura del panel, resumen/series/skill
canónicos copiados con fecha, resumen del suplemento step-6h. Sha256
completos en `reference/README.md` (mismo commit).

---

## PRINT-1 — forecast operativo con el MOS en la página (2026-10-30)

5.1 cerrado y no adoptado (medido por el autor; sin reentreno, sin tocar
boosters). Lo que cambia aquí es solo el circuito operativo (b):

**P1 — default MOS.** `Backend/routes/Front.js`: `provider:
req.query.provider || 'mos'` (si llega `?provider=...`, se respeta).
`DashboardPage.jsx`: estado inicial del selector `'openmeteo'` → `'mos'`
(era necesario: la UI siempre mandaba provider explícito y pisaba el
default del backend). NO se tocan `forecaster.py` (default `openmeteo`),
`data_loader.py:154` ni `deploy_pi.sh:52` (Tarea 0, decisión del autor).

**P2 — badge + nota.** El header muestra badge con el proveedor
EFECTIVO (`data?.provider`, no lo pedido) y la nota de same-family ahora
se condiciona a lo entregado (`data?.provider === 'mos'`).

**P3 — sin caídas silenciosas.** `/predict/weather` rechaza provider
explícito desconocido con error declarado (`provider_pedido`,
`provider_servido: null`, operativos listados). `timesfm` también
falla explícito (decisión del autor: ya no es necesario; la fábrica con
su fallback y el test de retiro no se tocan).

Criterios (medidos en vivo, backend+FastAPI+frontend corriendo):
1. `GET /api/front/prediction/weather` sin query → `"provider": "mos"`,
   2 filas (horas=2). ✓
2. Captura `reference/resultados/p1_weathercard_mos_badge.png`: badge
   `mos` + nota "misma familia", selector en MOS, 48 h de sparklines,
   0 pageerrors. ✓
3. `?provider=narnia` y `?provider=timesfm` → `status:"error"` con el
   motivo, sin datos de openmeteo. ✓ (Antes: 200 con datos del crudo.
   El FastAPI viejo en memoria devolvía crudo; se reinició predicción.)
4. Antes/después 24 h mismo instante (2026-10-30T11:00-05:00):
   `reference/resultados/p1_antes_despues_24h.json` — mediana |ΔGHI|
   diurna 77.18 W/m² (11 h), mediana |Δtemp| diurna 0.75 °C.
   (Sin filtro diurno: 0.53 / 0.44 por las 13 h nocturnas idénticas.)
   Dirección coherente con la comparativa: el MOS baja el pico del
   mediodía del crudo (p.ej. 12:00: 753 → 685.7).

---

## Sprint-1 5.7 — nubes y viento del MOS (2026-11-03, runtime listo, reentreno pendiente de datos)

**T1+T2 (runtime, en `mos_forecaster.py`)**: `cloud_cover` sale de
`_PASS_THROUGH` (queda solo `precipitation`; `_PASS_SRC` intacto por
orden); su booster se resuelve como los demás (mismas 8 features) con
recorte a [0,100] contado en log. `wind_speed_100m` con `_v2` usa
`[wind10_ecmwf crudo SIN x1.3, pers_h24, hora]` (3 features con nombre);
sin `_v2` en disco rige el legado (proxy ×1.3, booster v1) — por eso
`_PROXY_SCALE` se conserva: borrarlo antes de que exista el `_v2`
desplazaría el X del v1 publicado (regresión silenciosa).
Resolución por variable (`_resolve_boosters`): prefiere
`lgbm_mos_{var}_v2.txt`, guarda por conteo contra su propia lista
(`_V2_FEATS`), orden de columnas por `feature_name()` cuando el booster
trae nombres semánticos (v1 `Column_N` sigue posicional).
**15/15 tests** (7 nuevos 5.7: resolve prefiere v2, guarda contra v2
malformado, mutante de features, rama wind v2 sin escala ×1.3 con
booster identidad, orden por nombre con y=hora, cloud fuera de
pass-through y en rango).

**T3 (script versionado, NO ejecutado con datos reales)**:
`optimization/prediction/mos/train_mos_v2.py` — réplica exacta del
protocolo de la línea base (ventanas 2024/2500/seed5, test jul-dic
2025/400/seed0, mismos hiperparámetros, mismo v1, `strict=True`),
solo cloud (8) y wind (3 nuevas). Nombres `_v2` (nunca sobrescribe),
LF normalizado, aserción de recarga, manifiesto sha256 de los 4,
tabla T4 con baselines triviales y veredicto. Sin `--data-dir` válido
falla con mensaje claro. **Bloqueo**: los parquet no están en esta VM
(re-verificado); el script espera A (datos en `/home/david/mos_data/`)
o B (el autor lo corre y pasa los 2 `.txt`).
**Prueba de humo sintética** (NO es T4, se declara):
`reference/resultados/s57_synthetic_smoke_manifiesto.json` — el script
corre de punta a punta con datos sintéticos (cloud MAE 0.84, wind
0.26: solo prueba plomería), y el runtime carga esos `_v2`
sintéticos (ver v2, nombres semánticos, LF, contrato 72×10 sin NaN).
**Viejos publicados (intactos)**: cloud
`ae5509dd…0e233b6`, wind `b3f62d1a…a0c68a6bcf`.

---

## Sprint-1 5.8 — unidades m/s, descontaminación v1 y pers_h24 causal (2026-11-04)

Especificación: `docs/SPRINT_1_PASO_5_8_UNIDADES_Y_CAUSALIDAD.md` + §11.6.
Bloqueante antes de Tarea 0. Implementado en esta VM; reentreno real en la
máquina del autor (parquet ausentes aquí, igual que en 5.7).

**T1** (`weather/openmeteo.py`): campo `wind_speed_unit: str = "ms"` +
parámetro en `_base_params()` (afecta a `fetch_archive` y `fetch_forecast`:
contexto MOS/PatchTST/openmeteo, verdad ERA5 y `ecmwf_crudo` pasan a m/s).

**T2** (`mos_forecaster.py` `_proxy_df`): `wind_speed_unit="kmh"` explícito
con comentario (paridad con `data/ecmwf/` y `_ecmwf_frame`, sin tocar los
10 boosters publicados). **No-regresión medida en vivo**: un día de archive
con kmh-explícito es **byte-idéntico** al default anterior (24/24 filas;
media 15.58 km/h, coherente con el diagnóstico). `_ecmwf_frame` intacto.

**T3** (`train_mos_v2.py`): `pers_h24` causal
(`p_idx = i+L-24+(hh%24)` + `assert p_idx < i+L`, idéntico a producción).
`row_for` y el índice extraídos a `_row_for` / `_pers_idx` (testeables).

**T4** (3 tests nuevos, 18/18 en verde): default `ms` / `kmh` explícito;
contexto `ms` (vivo y anchor) + proxy `kmh` (captura de kwargs, sin red);
**mutante anti-fuga verificado**: con `t_idx-24` el test FALLA, con el fix
PASA (futuro a 99999.0, pers_h24 bit-idéntico en 72 h).

**T5** (humo sintético, NO es T4): `s57_synthetic_smoke_manifiesto.json`
actualizado con el script causal (cloud 0.85, wind 0.25: solo plomería).
Los `_v2` reales publicados siguen entrenados con pers no-causal:
**la auditoría debe regenerarlos** (mismo comando que `480d7d5`).

**Criterio abierto declarado**: con T1/T2 el contexto/`v1` en producción
pasan a m/s (descontaminación pedida), pero los `_v2` reales se entrenaron
con mezcla de unidades/pers no-causal; el reentreno real cierra el bucle.
