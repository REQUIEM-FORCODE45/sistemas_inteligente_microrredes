# `integracion_plataforma/` — Integración de desarrollos de la tesis

Carpeta de trabajo para integrar en la plataforma los desarrollos del proyecto de
tesis (`C:\Users\2D\tesis-microrred`). Cada incremento vive en su **carpeta numerada**
y se planifica **antes** de crearse.

> **Regla de oro**: aquí solo se **AÑADEN** archivos. **No se modifica** código
> existente del repositorio. Cada cambio declara explícitamente las líneas que toca.

---

## Cambios

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **01** | `cambio_01_mos_forecaster/` | Integrar el **MOS** como provider de clima (PASO 1) + comparativa con el protocolo del repo (PASO 2) | 🟡 PASO 1 ✅ auditado · PASO 2 ✅ **cerrado con lo verificado** → `CIERRE_PASO2.md` |
| **02** | `cambio_02_correcciones_mos/` | Corregir los 3 defectos hallados en la revisión QA del Cambio 01 | ✅ **Cerrado y verificado** (`b92c72c`) |
| **03** | `cambio_03_mos_visible_dashboard/` | **Ver el MOS en el Dashboard**: añadirlo al selector de providers + avisos de credibilidad (N/A en la tabla, datos previos al fix) | ✅ **3.1–3.6 implementado y verificado** (`f3abca8`) · 🟢 3.7 (reproducibilidad) → `VERIFICACION.md` |

**PASO 2 — cerrado con los datos disponibles** (sin re-correr; cuota Open-Meteo agotada):

- ✅ **Ingeniería demostrada**: regresión cero (`max|Δmae| = 0.000e+00`), aliasing resuelto,
  Opción B correcta, panel integrado y **ejecutado**, fix del proxy IFS aplicado (`1a0c19d`).
- ✅ **Hallazgos válidos** (4 contendientes no contaminados): **el NWP crudo gana en GHI**
  (63.5 vs 107.0 de PatchTST) → el camino es corregir el NWP (MOS), no sustituirlo;
  **PatchTST gana en las otras 9** (excepto DHI → climatología).
- ⚠️ **La fila del MOS de esta tabla no es interpretable** (su proxy fue ERA5 = la verdad;
  probado: las 2 variables pass-through dan 0.000 exacto). Su evidencia válida sigue siendo
  la del proyecto: MOS 29.44 vs crudo 30.93 (jul-dic 2025, proxy correcto).
- 📌 El panel **hoy muestra números pre-fix** → no presentarlos como finales.

Detalle y evidencia: `cambio_01_mos_forecaster/CIERRE_PASO2.md`.

> Los cambios posteriores a la Fase 1 (servicio de escenarios, nodo LLM-director,
> bucle evolutivo) **no están planeados todavía** y por eso **no existen carpetas**
> para ellos. Se crearán cuando su diseño esté cerrado.

### Revisión QA del Cambio 01

`cambio_01_mos_forecaster/REVISION_QA.md` — 3 defectos (2 bloqueantes) + PASO 2 sin
implementar, con causa raíz demostrada y arreglo exacto para cada uno.

| # | Defecto | Severidad |
|---|---|---|
| 1 | git/CRLF corrompe los 10 modelos LightGBM | 🔴 Crítica (Windows) |
| 2 | `precipitation` devuelve GHI crudo | 🔴 Crítica |
| 3 | Import circular `mos_forecaster` ↔ `forecaster` | 🟠 Media |
| 4 | PASO 2 (comparativa) sin implementar | ⚪ Pendiente |

---

## Cambio 01 — MOS forecaster

**Leer en este orden**:
1. `cambio_01_mos_forecaster/README.md` — guía de uso del paquete
2. `cambio_01_mos_forecaster/SPEC_MOS_FASE1.md` — especificación de implementación

### Contenido

```
cambio_01_mos_forecaster/
├── README.md                  ← guía del paquete (leer primero)
├── SPEC_MOS_FASE1.md          ← SPEC de implementación (PASO 1 y 2)
├── MANIFEST.json              ← hashes sha256 de cada artefacto
├── models/                    ← 10 correctores MOS LightGBM (YA ENTRENADOS)
├── itransformer/              ← iTransformer v1 YA ENTRENADO + config autocontenido
└── reference/                 ← recetas de referencia (runtime y features)
```

**No se reentrena nada**: los modelos se portan tal cual.

### Reglas duras (detalle en la SPEC)

1. `MAX_HORIZON_H = 72` → `RuntimeError` si piden más (igual que PatchTST).
2. `cloud_cover` y `precipitation` → **pass-through** del ECMWF en vivo (el MOS no
   mejora esas dos variables; para precipitación no hay señal física).
3. **Advertencia metodológica**: ERA5 (verdad) y ECMWF (entrada) son de la misma
   familia → el MAE es optimista. Reportar como *"NWP corregido con ML"*, nunca
   como *"ML puro"*.
4. Sin fuga de datos: `pers_h24` y `v1` solo usan información pasada.
5. Carga **lazy** del modelo (patrón `PatchTSTClimateForecaster`).
6. **No usar `TRANSFORMS` del config** (está corrupto: dicts serializados como
   listas). El correcto está en `reference/prediccion_en_vivo.py`.

### Impacto en el código existente

| Archivo | Cambio |
|---|---|
| `optimization/prediction/mos_forecaster.py` | **nuevo** (la clase) |
| `optimization/prediction/forecaster.py` | **2 líneas**: `import` + `_PROVIDERS["mos"]` |

Nada más. Los providers `openmeteo`, `timesfm` y `patchtst` no se tocan.

---

## Criterio de cierre del cambio

- [ ] El código nuevo corre sin alterar la lógica existente.
- [ ] Los providers y endpoints previos funcionan idéntico (sin regresión).
- [ ] Hay evidencia **ejecutada** (salida real), no descripción.
- [ ] Documentado en el README de su carpeta y en el HANDOFF de la tesis.

---

## Trazabilidad

- Proyecto origen: `C:\Users\2D\tesis-microrred`
- Evidencia del MOS: `tesis-microrred/docs/HANDOFF_TECNICO.md §19`
- Paquete comprimido original: `tesis-microrred/entregables/MOS_FASE1_paquete.zip`
- Verificación ejecutada: 10/10 LightGBM cargan y predicen `(72,8)→(72,)`;
  iTransformer carga con 0.50 M params, 33 features, `tgt_idx=[23..32]`.
