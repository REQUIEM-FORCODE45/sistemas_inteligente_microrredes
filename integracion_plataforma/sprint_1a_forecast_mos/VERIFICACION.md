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
