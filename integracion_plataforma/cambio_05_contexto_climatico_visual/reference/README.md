# `reference/` — paquete de referencia del Cambio 05

**Por qué existe**: el plan (`../README.md`) cita artefactos del proyecto de tesis
(`C:\Users\2D\tesis-microrred`) que **no viven en este repo**. Esta carpeta los trae para que
quien implemente **no tenga que adivinar** formatos, esquemas ni cifras.

---

## Qué es cada cosa

| ruta | para qué sirve |
|---|---|
| `scripts/descargar_indices.py` | los **4 parsers** de CPC / NCEI / PSL. Trampa documentada: el archivo de regiones Niño trae pares *(temperatura, anomalía)* → hay que tomar las **anomalías** (posiciones 3, 5, 7, 9), no las temperaturas (24–28 °C). Validado contra **4 eventos ancla** (1997-98, 2010-11, 2015-16, 2020-22). |
| `scripts/explorar_indices_sitio.py` | el experimento índice ↔ sitio: correlaciones con desfase 0–3 meses, compuestos por modo, comparación ONI vs RONI y la **figura A4** |
| `scripts/fig_indices.py` | figuras **A1** (ONI 1950→) y **A3** (panel de índices), en PNG **y SVG** |
| `scripts/verificar_fuente_power.py` | el contraste **NASA POWER vs ERA5 (−20.2 %)** que justifica por qué el mapa **no** se construye con POWER |
| `datos/indices_mensual.parquet` | **11 índices × 2 072 meses** — esquema a replicar en el almacén (§3.6 del plan) |
| `datos/sitio_pasto_1940_2025.parquet` | **1 032 meses** de nubosidad y GHI del sitio (ERA5 vía Open-Meteo) |
| `datos/raw/` | los **6 archivos crudos** tal como llegan de la fuente (para probar los parsers sin red) |
| `resultados/exploracion_indices.json` | las cifras del **§4 del plan**, rastreadas (nada transcrito a mano) |
| `resultados/verificacion_power.json` | el −20.2 % y el desglose mensual |
| `resultados/escenarios_72h.json` | salida actual del motor de escenarios |
| `figuras/` | **A1 · A3 · A4** en PNG y **SVG** — el SVG es lo que el módulo puede embeber directamente |
| `figuras/ia/` | el backtest de la IA de predicción (§3.4): 4 vías · real vs predicciones · 10 variables |
| `docs/` | el plan hermano (bloques A/B/C/D) y el informe de arquitecturas |

---

## Reglas de esta carpeta (importante)

1. Es una **instantánea congelada** — caso **(c)** de la *regla de vigencia* del plan. Sirve de
   **blanco visual** y de **respaldo del día 1**. **NO es la fuente de datos de la plataforma**:
   la fuente es el endpoint; en el módulo las gráficas se dibujan vivas y los mapas se regeneran.
2. Los `.parquet` son **binarios**. El cambio incluye un `.gitattributes` en su raíz con
   `*.parquet -text` porque este repo tiene `core.autocrlf=true` y ya nos costó caro (un `.txt` de
   modelo convertido → *"Model format error"* y proceso muerto).
3. **Nada de aquí se edita a mano**: todo se regenera con los scripts de `scripts/`.

---

## Integridad — `sha256` (prefijo de 16 hex) y tamaño

| archivo | bytes | sha256 |
|---|---:|---|
| `datos/indices_mensual.parquet` | 54 449 | `b9f767997de896a9` |
| `datos/sitio_pasto_1940_2025.parquet` | 363 597 | `1da7e22459ec6346` |
| `datos/raw/meiv2.data` | 5 652 | `bbb694becd7375bc` |
| `datos/raw/nino.txt` | 68 006 | `b6b85b985c98b6f6` |
| `datos/raw/oni.txt` | 23 920 | `b200945985193fa6` |
| `datos/raw/pdo.txt` | 13 590 | `3895b3960f5f8c33` |
| `datos/raw/RONI.ascii.txt` | 15 640 | `dcb0782bfe762653` |
| `datos/raw/soi.txt` | 13 136 | `499a5662aecc5ec4` |
| `docs/INFORME_BENCH_LSTM.md` | 11 472 | `927b8821c462e957` |
| `docs/PLAN_GRAFICAS_EVOLUTIVO.md` | 9 083 | `a1ea1bca33e9cc15` |
| `figuras/fig_A1_oni.png` | 135 156 | `638fec0d9203435a` |
| `figuras/fig_A1_oni.svg` | 110 366 | `b7762c07417b7b5a` |
| `figuras/fig_A3_indices.png` | 154 009 | `75fc259c8472ee7a` |
| `figuras/fig_A3_indices.svg` | 106 422 | `5329c1c79511c29d` |
| `figuras/fig_A4_puente.png` | 92 880 | `ac2203072f4c36e3` |
| `figuras/fig_A4_puente.svg` | 91 113 | `8ae27f0d5181881b` |
| `figuras/ia/fig_backtest_10vars.png` | 147 320 | `dc99c3f1c688c36b` |
| `figuras/ia/fig_backtest_4vias.png` | 219 730 | `43300a9aeaa4fd6d` |
| `figuras/ia/fig_backtest_real_vs_pred.png` | 481 013 | `ec1ff933871a4b21` |
| `resultados/escenarios_72h.json` | 1 838 | `bf34d186aca07d05` |
| `resultados/exploracion_indices.json` | 3 685 | `07c3abd2f766c9bc` |
| `resultados/verificacion_power.json` | 1 997 | `af095059b5f1e5bc` |
| `scripts/descargar_indices.py` | 6 647 | `399bb45959ca55c9` |
| `scripts/explorar_indices_sitio.py` | 12 375 | `11fb3b2651dbf8bc` |
| `scripts/fig_indices.py` | 5 149 | `ae83f078ea1af2a5` |
| `scripts/verificar_fuente_power.py` | 5 455 | `6d4ff62095847e46` |

**26 archivos · 2.05 MB.** Para verificar cualquiera: `sha256sum <archivo> | cut -c1-16`.
