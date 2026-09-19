# SPEC — PASO 2 (unificado): Comparativa del MOS **y** su panel en la plataforma

**Estado**: 🟢 **Listo para implementar** (es lo único que queda de la Fase 1).
**Parte de**: Cambio 01 (`SPEC_MOS_FASE1.md §4`); PASO 1 ya implementado, corregido
(`b67ba09`) y auditado (Cambio 02 `VERIFICACION.md`).
**Prerequisito**: Cambio 02 cerrado (provider funcionando).

Este paso es **uno solo**, con dos mitades que se implementan en orden:

| Mitad | Qué hace | Tecnología |
|---|---|---|
| **A — Motor** | Mide la comparativa y escribe los artefactos | Python (`optimization/prediction/`) |
| **B — Panel** | Muestra esa comparativa en el Dashboard | Node + React/Plotly (`Backend/`, `Frontend/`) |

> ⚠️ **No añade capacidad nueva al pronóstico**: no se toca la lógica del MOS.
> Se mide (A) y se muestra (B).

---

## 1. Lo que ya existe (reutilizar, no reinventar)

### 1.1 El arnés de evaluación — `optimization/prediction/evaluate.py`

| Elemento | Valor |
|---|---|
| `walk_forward_mae(climate, train_h, step_h, horizons, baselines, daytime_only, ghi_threshold)` | Motor de ventana móvil |
| `summarize(df)` | Pivote `(contendiente, horizonte) × variable` |
| Ventana | `train_h = 30*24`, `step_h = 24` |
| `daytime_only` | Radiación solo con `GHI_real > 50 W/m²` |
| Salida | `results/pasto_narino/forecast/` |
| Baselines | `persistence`, `climatology`, `arima` (+`chronos`) vía `baselines.run_baseline` |

**El hueco**: `evaluate.py` evalúa **solo baselines**; los *providers* no entran en el
bucle (el bucle llama a `run_baseline(...)`, un provider se invoca con
`forecast(anchor=...)`). **Ese es exactamente el trabajo de este paso.**

### 1.2 El molde del panel — el *Experimento A*

```
React (Dashboard) → GridAPI.get('/front/…') → Node (:3000/api)
                                     routes/Front.js  (validateJwt)
                                              ↓
                                 services/experimentService.js  (fs.readFileSync)
                                              ↓
                               results/pasto_narino/experiments/*.csv
```

| Capa | Archivo existente que sirve de molde |
|---|---|
| Servicio | `Backend/services/experimentService.js` |
| Rutas | `Backend/routes/Front.js` → `/optimization/experiment/{summary,traces/:strategy,status,run}` |
| Hook | `Frontend/GestionFront/src/Dashboard/components/optimization/hooks/useExperimentData.js` |
| Panel | `…/components/optimization/ExperimentPanel.jsx` (tabs + `variant`, dentro de `<ErrorBoundary>`) |
| Charts | `ExperimentCostChart.jsx` (**Plotly**, `plotly.js-dist-min` ya en `package.json`) |
| Tabla | `ExperimentMetricsTable.jsx` |
| Montaje | `Dashboard/pages/DashboardPage.jsx` → `<ExperimentPanel variant="side" />` (~línea 708) |

Los componentes **reciben datos por props**; el fetch vive en el `hook`.

---

## 2. Mitad A — Motor de comparación (Python)

### 2.1 Dónde va el código ✅ recomendado

Extender `walk_forward_mae` con un parámetro nuevo, **compatible hacia atrás**:

```python
def walk_forward_mae(climate, train_h=30*24, step_h=24, horizons=(1,6,12,24),
                     baselines=("persistence","climatology","arima"),
                     providers=(),            # <-- NUEVO: ("mos","patchtst")
                     arima_every=1, daytime_only=True, ghi_threshold=50.0):
```

En cada paso `t`, junto a los baselines:

```python
for name in providers:
    prov = get_climate_provider(site_cfg, name=name)     # instanciar UNA vez fuera del bucle
    fc = prov.forecast(days=max(horizons) / 24, anchor=climate.index[t])
    fc = fc.data.reindex(actual.index)                   # misma alineación que los baselines
    # ... el MISMO bucle de métricas que ya existe
```

Con `providers=()` (el default) el resultado actual **no cambia ni un decimal** →
**regresión cero por construcción**.

### 2.2 Contendientes

| Contendiente | Cómo | Estado |
|---|---|---|
| `mos` | `forecast(days, anchor=…)` | ✅ listo |
| `patchtst` | `forecast(days, anchor=…)` — `patchtst/patchtst_best.pt` **está en el repo** | ✅ listo |
| **ECMWF archive crudo** | NWP sin corregir = entrada del MOS (aísla el aporte del ML) | implementar (pequeño) |
| `persistence`, `climatology` | `baselines.run_baseline` | ✅ ya existe |
| ~~`openmeteo` en vivo~~ | **EXCLUIDO**: no puede backdatearse (solo `now`) | — |

### 2.3 Protocolo (idéntico al del repo)

- Ventana móvil `train_h=30*24`, `step_h=24`.
- Horizontes `1,6,12,24,48,72` (72 = límite operativo del MOS). El default del repo
  es `1,6,12,24` → se pasa por CLI.
- `daytime_only=True`, `ghi_threshold=50` para las 3 radiativas.
- Verdad única: **ERA5 del archive**. **Mismo periodo para todos** (si un paso falla
  para un contendiente, se descarta para todos — nunca comparar ventanas distintas).

### 2.4 Métricas

**MAE** (la del repo) + **RMSE**, **bias** y **Skill Score vs persistencia**
(`1 - MAE_modelo / MAE_persistencia`), por variable y horizonte.

### 2.5 ⚠️ Limitación MEDIDA de la ventana (decide el diseño)

Los providers sacan el contexto de `fetch_forecast(past_days=…)` (tope **92 días**) y
necesitan **536 h**. Medido en vivo:

```
 3 días atrás OK | 30 OK | 60 OK | 85 FALLA (184h<512h) | 95+ FALLA (0h)
```

→ **El backtest con `anchor` solo llega a ~70 días atrás.** PatchTST tiene el mismo
límite (`forecaster.py:293`, mismo patrón).

- **Opción A** — comparar solo los últimos ~2 meses. Cero código, evidencia corta
  (no cubre ene‑feb ni jul‑dic 2025).
- **Opción B** ✅ **recomendada** — en `_context_df`, si `anchor is not None`, traer el
  contexto del **archive** (`client.fetch_archive`) en vez del forecast API. Habilita
  comparar **todo 2025** y deja contexto+proxy+verdad **todos en ERA5**. Aplicar a
  **ambos** providers. **La ruta en vivo (`anchor is None`) NO se toca.**

### 2.6 Artefactos que debe escribir (contrato con la Mitad B)

En `results/pasto_narino/forecast/`:

| Archivo | Contenido |
|---|---|
| `comparativa_detalle.csv` | largo: `contendiente, horizonte_h, variable, mae, rmse, bias` |
| `comparativa_resumen.csv` | pivote `(contendiente, horizonte) × variable` |
| `comparativa_skill.json` | skill score vs persistencia |
| `comparativa_series.parquet` | ventana(s) de ejemplo: real + predicción de cada contendiente |

---

## 3. Mitad B — Panel en la plataforma

### 3.1 ⚠️ Decisión clave: NO calcular al vuelo

El walk-forward tarda **decenas de minutos a horas**. **Nunca** dentro de una petición
HTTP del Dashboard.

1. La **Mitad A** calcula offline → escribe en `results/pasto_narino/forecast/`.
2. El panel **lee esos archivos** (<2 s), igual que hoy el Experimento A.
3. Opcional: `POST …/run` que lo lance en background (como `/optimization/experiment/run`).

> Alternativa descartada: exponerlo en el Python :8000 y proxearlo como
> `/prediction/weather` (`Front.js:96`). Vale para consultas rápidas; **no** para una
> comparativa pesada.

### 3.2 Node — piezas nuevas

- **`Backend/services/forecastComparisonService.js`** (nuevo), copiando
  `experimentService.js`:
  ```js
  const FORECAST_DIR = path.join(__dirname, '..', '..',
                                 'results', 'pasto_narino', 'forecast');
  ```
  Funciones: `getComparisonSummary()`, `getComparisonSkill()`,
  `getComparisonSeries(contender)`, `getComparisonStatus()`,
  `runComparison({months, horizons})` (opcional).
  Debe **degradar con gracia** si faltan los archivos (`{available:false}`, no 500).

- **Rutas nuevas en `Backend/routes/Front.js`** (con `validateJwt`, estilo idéntico):
  ```js
  router.get('/prediction/forecast/comparison', validateJwt, …)
  router.get('/prediction/forecast/comparison/series/:contender', validateJwt, …)
  router.get('/prediction/forecast/comparison/status', validateJwt, …)
  router.post('/prediction/forecast/comparison/run', validateJwt, …)   // opcional
  ```
  Respuesta `{ success: true, ... }`. URL final: `/api/front/prediction/forecast/comparison`.

### 3.3 React — carpeta nueva `components/prediction/`

| Archivo nuevo | Basado en |
|---|---|
| `hooks/useForecastComparison.js` | `useExperimentData.js` (Redux + `GridAPI.get`) |
| `ForecastComparisonPanel.jsx` | `ExperimentPanel.jsx` (tabs, `variant`, Refresh/Run) |
| `ForecastMetricsTable.jsx` | `ExperimentMetricsTable.jsx` |
| `ForecastMaeChart.jsx` | barras agrupadas: MAE por variable, series = contendientes |
| `ForecastSkillChart.jsx` | curvas MAE vs horizonte (1→72 h) |
| `ForecastOverlayChart.jsx` | temporal: real vs cada contendiente |

Estilos Plotly copiados de `ExperimentCostChart.jsx` (`Plotly.purge` + `newPlot`,
`paper_bgcolor:'transparent'`, `font:{color:'#64748b'}`, `responsive:true`) para que
**se vea idéntico** al resto del Dashboard. Paleta fija por contendiente, p. ej.
`mos:#2563eb`, `patchtst:#16a34a`, `ecmwf_crudo:#f59e0b`, `persistence:#dc2626`,
`climatology:#9333ea`.

### 3.4 Montaje

En `Dashboard/pages/DashboardPage.jsx`, junto al panel de experimento:

```jsx
<ErrorBoundary compact>
  <ForecastComparisonPanel variant="side" />
</ErrorBoundary>
```

### 3.5 Qué debe mostrar

1. **Tabla MAE por variable** + skill vs persistencia (para el horizonte elegido).
2. **Barras agrupadas**: MAE por variable, una serie por contendiente.
3. **Curvas MAE vs horizonte** para GHI/DNI/DHI.
4. **Overlay temporal**: real vs contendientes (ver el error "a ojo").
5. **Aviso metodológico visible**: *"NWP corregido con ML — ERA5 (verdad) y ECMWF
   (entrada) son de la misma familia; el MAE del MOS es optimista."*
6. Selectores de **horizonte** (1/6/12/24/48/72) y **variable** (las 10).

---

## 4. Criterios de cierre (unificados)

**Mitad A**
- [ ] `providers=()` (default) → resultados **idénticos** a antes (regresión cero).
- [ ] Tabla con los 5 contendientes × 6 horizontes, sin huecos, **mismo periodo**.
- [ ] **MAE por variable** para cada contendiente (no solo agregados).
- [ ] Figuras generadas (barras, curvas, overlay).
- [ ] El MOS **gana o empata** en GHI/DNI/DHI a todos los horizontes vs `patchtst` y
      vs el NWP crudo. Si **no** gana en algo, **se reporta igual** (honestidad).
- [ ] Caveat declarado: *"NWP corregido con ML"*, nunca *"ML puro"*.

**Mitad B**
- [ ] El panel aparece junto al de experimentos y **carga < 2 s** (lee archivos).
- [ ] Se ven 5 contendientes × 6 horizontes × 10 variables.
- [ ] Las 3 gráficas renderizan legibles en tema oscuro; los selectores funcionan.
- [ ] Sin artefactos → muestra "sin datos", **no** rompe el Dashboard.
- [ ] Rutas con `validateJwt`.
- [ ] **Regresión**: `ExperimentPanel`, `CalibrationCard` y `SensorsRow` siguen igual.

---

## 5. Trampas conocidas

1. **CRLF**: dentro de `optimization/prediction/mos/**` e `integracion_plataforma/**`
   ya hay `-text` en `.gitattributes`. Los CSV/JSON generados por el script no son
   problema; los `.txt` de modelos, fuera de esas rutas, sí.
2. **No bloquear el UI** con un walk-forward síncrono.
3. **Prefijo `/front`**: el front llama `/front/...`; el `baseURL` ya aporta `/api`.
4. **`results/` es el punto de encuentro** entre A y B (mismo `outdir`).
5. **No reusar** los nombres de archivo del Experimento A.
6. **No instanciar el provider en cada paso** (la carga de modelos es lazy y costosa):
   instanciar **una vez** fuera del bucle.
7. **`_context_df` nunca debe ver datos posteriores al `anchor`** (fuga). El corte
   `df.index < anchor` debe conservarse también en la Opción B.
8. **`openmeteo` live dentro del backtest** = comparación inválida.

---

## 6. Orden de trabajo sugerido

1. Decidir **2.5**: Opción A o B.
2. Extender `walk_forward_mae` con `providers=()` y verificar **regresión cero**.
3. Añadir el contendiente **ECMWF archive crudo**.
4. Correr la comparativa → artefactos en `results/pasto_narino/forecast/`.
5. Figuras de la Mitad A y revisión visual.
6. Servicio Node + rutas.
7. Hook + panel + charts React + montaje.
8. Verificación final contra los criterios de cierre.
