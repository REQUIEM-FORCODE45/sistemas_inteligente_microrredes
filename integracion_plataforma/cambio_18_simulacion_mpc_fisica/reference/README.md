# `cambio_18_simulacion_mpc_fisica/reference/` — Evidencia de cierre C6

## No-regresión Fase 1 (medida ejecutando, 2026-10-26)

Corrida: 1 celda idéntica a la Fase 1 (isla, smpc, 1 día 2026-08-03, banda C
`conformal_disjunto`, planta calibrada ERA5) con el solver nuevo en modo
`exact` (sin límites, gap 0.0). Comparación columna a columna contra la línea
base versionada (`validacion/fase_1/v1_bandc/expA2_daily_v1_c_smpc.csv`).

## Manifiesto (sha256 del blob versionado, LF)

| archivo | bytes | sha256 |
|---|---|---|
| `resultados/expA2_daily_c6_noregresion_test.csv` | 416 | `3b710bfc15bf0075c57dec05f0ece7a155e816cd6df57f890bbcf369e0818d34` |
| `resultados/c6_noregresion_fase1_run2.txt` | 248897 | `3cec950e79ee9bbb50b8bde2a5647cfbdff89bf37c5ebfbfdacad583a23acc30` |
| `resultados/c6_unittest.txt` | 1132 | `d1212fcccd9cd3878b77281ce67f2476d0dc787debb17f57b8c89a0a206d66e8` |

> Los sha256 son **completos (64 hex)**, recalculados en el mismo commit que
> toca este README. Verificación canónica: `git show HEAD:<path> | sha256sum`.
