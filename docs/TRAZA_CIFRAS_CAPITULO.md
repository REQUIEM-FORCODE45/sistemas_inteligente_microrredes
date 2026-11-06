# Trazabilidad cifras del capítulo → artefacto (verificado 2026-11-05)

Una fila por tabla/cifra del capítulo: qué dice, de qué artefacto sale,
con qué cadena de predicción se generó, y su estado. Cifras desde artefacto
versionado (sha, json, csv), no desde memoria.

## 1. Cadena de producción vigente (quién habla por el sistema hoy)

`mos` — iTransformer + LightGBM (boosters `_v2` causales: cloud, wind,
DNI, DHI), viento en m/s. Unificado en T0.1 (`e58fad0`: factory default,
`deploy_pi.sh`, `data_loader.py` sin nombre inventado). Verificado en los
3 caminos (factory / FastAPI sin query / `ClosedLoopForecastProvider` con
anchor). Lo anterior (`FORECASTER=patchtst`) es histórico.

## 2. Tabla Expe A del manuscrito (3 días, "valores reales", §2)

| Versión manuscrito (27-ago-2026) | artefacto fuente en el repo |
|---|---|
| S-MPC −1.428.731 / D-MPC −1.428.730, "S-MPC ≈ D-MPC (0.00 %)", "diésel arbitra exportación a 140 vs 110", costo neto negativo | **NINGUNO**: `grep -rln 1428731` solo devuelve el propio manuscrito (más un fragmento float coincidente en `comparativa_detalle_2026-03.csv`, no relacionado) |

**Estado: HISTÓRICO SIN ARTEFACTO, NO REUTILIZABLE.** La corrida que la
produjo no está versionada y es anterior a las correcciones E1–E9 del MPC
(26-ago). Peor: el "diésel arbitra la exportación" no es una cifra vieja,
es **el bug que E2 eliminó** (`export_tariff = 0`, sin ingreso por
inyección). Re-correr (V4) da números nuevos; **no cura** que las viejas
describan un bug ya corregido. La tabla vieja se retira, no se sustituye
dejando las dos (dos cuerpos de evidencia = lo que encuentra un tribunal).

## 3. `fase_1/` (PatchTST) — histórico, intacto

V1/V2/V3/V5/V7 con PatchTST. **31/31 sha256 contra su MANIFEST.md**
(verificado antes y después de Tarea 0). No se toca. Sus cifras
(V1 ENS −5.13/−26.3 %, V2 grid10 −1.81 % / grid30 +1.62 %) son la línea
base pre-MOS, citables como tales.

## 4. `fase_1_mos/` (MOS) — vigente para V1/V2

9 archivos + MANIFEST con sha completos. Cada `resultado.json` declara
`provider/modelo/boosters{v2×4}/unidades_viento: ms`. Deltas que migran
al capítulo (`docs/PARRAFO_CAPITULO_TAREA0.md`, EN/ES):
V1 ENS −3.32 (−22.4 %), costo −0.19 %; V2 grid10 −3.44 % norm/ENS −7.84,
grid30 −3.59 %/ENS −6.26 (**signo invertido vs patchtst +1.62 %**,
reportado invertido, no ajustado). No corrido: V3/V5/V7 (motivo en su
README). Recalculables desde los CSV de la misma carpeta.

## 5. ExpB (tiempo de solver) — vigente

`expB_solver_times.csv` + `expB_hardware.json` (2026-10-09, 120/120
`optimal`). El `hardware.json` declara el modelo post-correcciones
("diésel linealizado por tramos + complementariedad big-M, 648+
binarias"), así que estos tiempos corresponden al MILP actual, no al del
bug. El timing no depende del forecast.

## 6. ExpC (rendimiento bajo carga) — vigente para su propósito

`expC_table.md` (2026-08-26): latencias MQTT/Mongo/WS/REST. Métricas de
infraestructura, independientes del modelo y del forecast. Sin fecha de
re-medición posterior; declarar la fecha al citar.

## 7. `expA_metrics.csv` / panel del dashboard — visible hoy, proveedor no declarado

`results/pasto_narino/experiments/expA_metrics.csv` (2026-09-15) alimenta
el panel "Análisis Experimental" (mismos números: S-MPC 836.767, D-MPC
832.478, HEUR 791.184, MPC-PI 781.903). Corrida de 14 días con proveedor
**no declarado en el artefacto** (anterior a T0.5). Se cita como "lo que
muestra el panel", no como validación del MOS.

## 8. Feature descartada (5.2) — resultado, no hueco

"La energía de alta frecuencia de la nubosidad no explica el residuo del
MOS (r = 0.015, n = 400, umbral 0.20 fijado antes)". Fuente: probe
versionado + veredicto medido en la máquina con parquets.

## Regla de pie

Estado de cada tabla según artefacto versionado (sha/json/csv con fecha),
no según memoria. Verificación sha de esta nota: `fase_1/` 31/31 el
2026-11-05; `fase_1_mos/` 9 archivos con MANIFEST propio.
