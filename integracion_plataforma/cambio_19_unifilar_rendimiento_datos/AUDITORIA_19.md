# AUDITORÍA — CAMBIO 19 (unifilar vivo, rendimiento y gobernanza de datos)

> **Auditoría ejecutada** sobre `285cfeb`, `c3d38d0`, `d90e16b` y `afd0061` (2026-10-27/28).
> Reemplaza la versión anterior de este archivo, que era **estática** (sólo lectura de diffs) y
> **aprobaba 6/6 sin ejecutar nada**. Aquí se separa lo verificado de lo que sigue sin verificar.

Método: lectura de diffs + **comprobación en el código y en los artefactos** (grep sobre el árbol,
sha256 de los binarios, lectura de los productores/consumidores de `createAt`). Lo que no se pudo
ejecutar se declara al final.

---

## 1. Los 6 criterios, verificados uno por uno

| # | Criterio | Verificación propia | Estado |
|---|---|---|---|
| **C1** | `Plotly.react` en los gráficos del panel | **15 componentes** usan `Plotly.react`; `purge` queda **solo en el cleanup** de dos sitios (`climate/ClimateChart.jsx:72`, `charts/PlotlyMini.jsx:49`), que es lo correcto | ✅ |
| **C2** | Badges y tarjetas por `horaMostrada`, con el fix `data.id → id` | **0 ocurrencias de `data.id`** en los nodos (9 nodos, 7 con `getNodeBadgeInfo`) → el emparejamiento ya usa `id` | ✅ |
| **C3** | Seccionador por hora (`schedule[hora - 1]`) | Presente en `PowerEdge.jsx:116` con glifos `#s-sw-o` / `#s-sw-c` | ✅ |
| **C4** | Fallback `SOCKET_URL` homogéneo | **4 archivos** con la referencia unificada | ✅ |
| **C5** | Índice `{ createAt: -1 }` en telemetría | `Backend/services/mqttService.js:19` → `schema.index({ createAt: -1 })`, en el `getModel()` que registra el esquema | ✅ |
| **C6** | Timestamps UTC nativos | `createAt: new Date()` (`mqttService.js:64`) y **`getColombiaDate` solo sobrevive en un comentario**; la resta de 5 h está eliminada | ✅ |

**Artefacto del harness**: `reference/resultados/c19_verificacion_harness.json`, 1018 bytes, sha256
**`b99ad348d784a83772081e9d82de396359ab80ae167d0811ede7da97d770a7c0`** → **coincide** con el declarado.

---

## 2. 🔴 Hallazgo crítico: el histórico anterior al fix queda con **−10 h**, y nada lo distingue

El fix de C6 es **correcto**, pero sólo hacia adelante. El propio commit lo advierte
(*"las lecturas quedaban 5 h en el pasado, −10 h para quien las reinterpreta"*), y al leer a los
consumidores se confirma que el problema es real y sigue vivo en los datos viejos.

`optimization/calibration/service.py:81-84` lee la telemetría y hace:

```python
df = pd.DataFrame(docs).set_index("createAt")
# BSON guarda en UTC (naive al leer): convertir a hora LOCAL del sitio.
if df.index.tz is None:
    df.index = df.index.tz_localize("UTC").tz_convert("America/Bogota")
```

Es decir: **el consumidor asume que `createAt` está en UTC y resta 5 h para llevar a Bogotá**.

- **Datos escritos después del 27-oct** (`createAt = new Date()` UTC nativo): correcto. Desfase 0.
- **Datos escritos antes del 27-oct** (`getColombiaDate()` ya había restado 5 h): el consumidor les
  resta **otra** 5 h → **desfase neto de 10 horas**, en el pasado.

Y no hay nada que los distinga: **no existe migración** (grep de `migra|shift|desfase` en `Backend/` y
`optimization/` → vacío) ni marca en los documentos. Los dos formatos conviven en la misma colección.

**Agravante**: `sensor_series(..., max_days: float = 30.0)` toma **los últimos 30 días**. Entre el
27-oct (fecha del fix) y hoy, esa ventana es **casi toda del formato viejo**. Una calibración lanzada
hoy mezcla las dos escalas de tiempo en la misma serie.

**Quién consume `createAt`** (todo lo que queda expuesto): `optimization/calibration/service.py`
(calibración del PV), `Backend/services/changeStreamService.js:39` (dashboard en vivo),
`Backend/services/sensorDataService.js:25` (`sort({createAt: -1})`), `Backend/services/dashboardAgent.js`.

---

## 3. Alcance: lo que NO se tocó (verificado sano)

- **Formulación del MILP** (`solver/model_builder.py`, `solver/solvers.py`): intacta. Los criterios del
  cambio 18 se mantienen.
- **Fase 1 de la validación**: **no afectada**, y esto se puede afirmar con fundamento, no por
  confianza: los experimentos leen ERA5 y la planta física (`_context_df` → Open-Meteo archive), **no
  `createAt` de Mongo**. ENS −26 %, V2 y V7 siguen siendo válidos.
- **5 componentes de `optimization/`** (`DispatchSchedule`, `DispatchByDevice`, `ExperimentCostChart`,
  `ExperimentProfileChart`, `ExperimentTraceChart`) **siguen con `Plotly.newPlot`**. Fuera del alcance
  declarado de C1, pero conviene saberlo: son justo los gráficos del panel de optimización.

---

## 4. Lo que NO he verificado (y no puedo desde este clon)

- **La fluidez de 19,8 FPS**: el artefacto existe y su sha256 coincide, pero **no re-corrí el harness**.
  Aquí no hay `node_modules` ni navegador del proyecto. Se acepta como medición del implementador, no
  como medición propia.
- **Los 20 gráficos Plotly sin fugas en el DOM** y la sincronía h5/h6 en pantalla (`5 kW` / `105 kW` /
  `#s-sw-o` → `6 kW` / `106 kW` / `#s-sw-c`): vienen del harness, no los reproduje.

---

## 5. Veredicto

**El cambio 19 se aprueba en su implementación (6/6)**, con **una condición sobre los datos**: el
histórico anterior al 27-oct no es utilizable tal cual para calibrar ni para reconstruir series de
tiempo, porque está a **−10 h** respecto a lo que el consumidor asume.

Acción derivada (**P10**): **migrar o cortar por fecha**. Cualquiera de las dos, pero declarada:

- **migrar**: sumar 5 h a los `createAt` anteriores al 27-oct (una sola vez, con manifiesto del rango
  tocado), o
- **cortar**: que `sensor_series` filtre `createAt >= 2026-10-27T00:00-05:00` y lo declare en el log.

Lo que no vale es lo de ahora: dos escalas de tiempo indistinguibles en la misma colección y una
ventana de 30 días que las mezcla.
