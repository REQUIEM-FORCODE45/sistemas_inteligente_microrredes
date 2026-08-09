# PatchTST — Modelo de Forecast Climático 72h (Pasto, Nariño)

Modelo de pronóstico multivariado basado en **PatchTST** (Transformer) entrenado
con 6 años de datos ERA5 de Pasto (2020-2025). Predice **10 variables climáticas**
para las próximas 72 horas, con cuantiles P10/P50/P90.

---

## 1. Contenido del paquete

| Archivo | Descripción |
|---|---|
| `patchtst_best.pt` | El modelo entrenado (pesos + configuración) |
| `target_specs.json` | Transformaciones (clear-sky index / anomalías) para decodificar |
| `norm_stats.csv` | Estadísticas de normalización (media/std del train) |
| `patchtst.py` | Arquitectura del modelo (NO modificar) |
| `targets.py` | Funciones de transformación (NO modificar) |
| `pasto_narino.yaml` | Configuración del sitio (coords, targets, hiperparámetros) |
| `predict_72h.py` | **Script de inferencia: usa este** |
| `README_SERVIDOR.md` | Este archivo |

---

## 2. Requisitos (Python 3.10+)

```bash
pip install pandas numpy torch requests pyyaml
```

- **CPU es suficiente**: el modelo tiene 2.1M de parámetros y predice 72h en
  ~2 segundos en CPU. Si hay GPU, se usa automáticamente.
- El script **solo necesita internet** para descargar los datos recientes de
  Open-Meteo (gratis, sin API key). El modelo en sí es 100% local.

---

## 3. Cómo ejecutar

```bash
# Predicción con los datos más recientes (hoy)
python predict_72h.py

# Guardar el resultado en otro archivo
python predict_72h.py --out forecast.json

# Especificar fecha de corte del contexto (útil para backtesting)
python predict_72h.py --date 2026-08-10

# Más días de contexto (si el modelo lo necesita)
python predict_72h.py --days 30
```

---

## 4. Salida (JSON)

```json
{
  "site": "pasto_narino",
  "emitted_at": "2026-08-08T23:00:00",
  "horizon_hours": 72,
  "quantiles": [0.1, 0.5, 0.9],
  "timestamps": ["2026-08-09T00:00:00", "...", "2026-08-11T23:00:00"],
  "series": {
    "shortwave_radiation":   {"p10": [...72 valores...], "p50": [...], "p90": [...]},
    "direct_normal_irradiance": {"p10": [...], "p50": [...], "p90": [...]},
    "diffuse_radiation":     {"p10": [...], "p50": [...], "p90": [...]},
    "temperature_2m":        {"p10": [...], "p50": [...], "p90": [...]},
    "relative_humidity_2m":  {"p10": [...], "p50": [...], "p90": [...]},
    "cloud_cover":           {"p10": [...], "p50": [...], "p90": [...]},
    "wind_speed_100m":       {"p10": [...], "p50": [...], "p90": [...]},
    "wind_speed_10m":        {"p10": [...], "p50": [...], "p90": [...]},
    "surface_pressure":      {"p10": [...], "p50": [...], "p90": [...]},
    "precipitation":         {"p10": [...], "p50": [...], "p90": [...]}
  }
}
```

**Unidades**: radiación W/m² · temperatura °C · humedad % · viento m/s ·
presión hPa · precipitación mm. `p50` es la predicción central; la banda
`p10-p90` es el rango de incertidumbre (80% de confianza del modelo).

**Horas**: los timestamps son hora local de Colombia (America/Bogota, UTC-5).

---

## 5. Interpretación rápida (para consumir desde tu sistema)

- Para **energía esperada**: usa `p50` de `shortwave_radiation` como entrada al
  modelo de planta PV.
- Para **energía garantizada (conservadora)**: usa `p10` — la radiación que se
  superará con 90% de probabilidad. Útil para dimensionar respaldo (BESS).
- Para **planificación optimista**: usa `p90`.
- Para **control de turbinas**: usa `wind_speed_100m` (velocidad a altura de hub).

---

## 6. Notas técnicas (si alguien necesita modificarlo)

- **Las 10 variables se predicen simultáneamente** (un solo modelo, no 10).
- **Transformación clear-sky (truco kt)**: la radiación se predice como
  `GHI/ghi_toa` (índice de claridad) y las demás como anomalías respecto a su
  ciclo diurno medio. Esto mejora el MAE de radiación en ~31% vs predecir GHI
  directo. La decodificación a unidades físicas ocurre dentro del script.
- **Métricas de test (horizonte 72h, datos 2025)**: GHI MAE=54 W/m²,
  temperatura MAE=0.93 °C, viento 100m MAE=0.58 m/s, nubosidad MAE=14.1%.
- **El modelo NO requiere reentrenamiento para usarlo.** Solo se reentrena si
  cambia el sitio o se quiere mejorar (los datos de ERA5 se descargan solos).
- Los archivos `patchtst.py` y `targets.py` deben permanecer junto al checkpoint;
  la arquitectura se reconstruye desde la configuración guardada en el `.pt`.

---

## 7. Troubleshooting

| Problema | Solución |
|---|---|
| `Error: Faltan datos de contexto` | El script descarga 25 días; si la fecha dada es muy antigua o reciente, ajusta `--days`. |
| `ModuleNotFoundError: patchtst` | Ejecuta el script desde el directorio del paquete (donde está `patchtst.py`). |
| Sin internet | El script necesita Open-Meteo para los datos recientes. Para uso offline, se requiere un archivo de datos locales (contactar al autor). |
| Resultados distintos a los esperados | Verifica la fecha del sistema (el contexto usa la fecha de hoy por defecto). |
