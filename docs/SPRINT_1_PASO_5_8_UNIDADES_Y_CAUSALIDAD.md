# SPRINT 1 — Paso 5.8: Corrección de unidades (`km/h` → `m/s`), descontaminación de `v1` y causalidad de `pers_h24`

> **Estado**: BLOQUEANTE antes de ejecutar la **Tarea 0** (`FORECASTER=mos` global + re-corrida de Fase 1).
> **Complementa**: `docs/SPRINT_1_FORECAST_MOS.md` (§5.9 y §11.6).
> **Rol**: Especificación de auditoría/validación. Implementa el agente de la VM Linux.

---

## 1. Los tres defectos confirmados y medidos

Tras cerrar el paso **5.7** (`3ed25fd`), la auditoría cruzada de código y ejecución real confirmó **tres defectos** entre el entrenamiento offline (`train_mos_v2.py` / `mos_multivariable.py` sobre `era5_v3.parquet`) y la inferencia en producción/backtest (`mos_forecaster.py` + `openmeteo.py` + `compare_providers.py`):

| # | Defecto | Verificación empírica | Consecuencia |
|---|---|---|---|
| **1** | `optimization/weather/openmeteo.py:81-97` (`_build_params`) no pide `"wind_speed_unit": "ms"` → Open-Meteo devuelve **km/h** aunque el comentario en `:21-22` diga `[m/s]` | Llamada real: `3.8, 2.8, 1.5…` sin unidad vs `1.1, 0.8, 0.4…` con `ms` (**ratio 3,586**) | En producción y en `compare_providers.py`, `ctx["wind_speed_100m"]` y `ctx["wind_speed_10m"]` entran en **km/h**, mientras `era5_v3.parquet` está en **m/s** |
| **2** | `pers_h24` en entrenamiento (`train_mos_v2.py:226` y `mos_multivariable.py:188`) usa `t_idx - 24` ($\text{rel} = L + hh - 24$), que para $hh \ge 24$ cae **en el futuro** después del `anchor` | En $hh = 71$, $\text{rel} = 559 > 512$ (**+47 h de futuro**); en inferencia (`mos_forecaster.py:590-592`) sí es causal (`ctx` antes del `anchor`) | Los MAE offline de 5.7 a 72 h quedan marcados como **optimistas** en los días 2 y 3 ($hh \in [24, 71]$) porque entrenan y evalúan con persistencia a 24 h vista |
| **3** | En `mos_forecaster.py:498-501`, `wind_power_proxy = wsp ** 3` se calcula con `wsp` en **km/h** ($\times 3,6^3 = \mathbf{\times 46,7}$) y la anomalía horaria resta climatología en **m/s** a una serie en **km/h** | `stats["wind_speed_100m"]` del iTransformer tiene media `1,52` (**m/s**) y `wind_power_proxy` media `8,28` (**m³/s³**) | **El `v1` que entra al MOS hoy en producción está fuera del rango con el que se entrenó, y lo usan las 10 variables** (por *self-attention* entre los 33 canales), además de meter `pers_h24` $\times 3,6$ al booster de viento |

---

## 2. ⚠️ Trampa crítica en el código: `_proxy_df` vs `_ecmwf_frame` para `wind10_ecmwf` (`viento_ecmwf`)

**No todo el vector de features está roto**, y no hay que arreglar de más ni romper los 8 boosters `v1` congelados:

1. **En entrenamiento (`data/ecmwf/ecmwf_YYYY_MM.parquet`)**:
   - El archivo original del NWP se descargó **sin** `wind_speed_unit="ms"` (documentado en `scripts/descargar_ecmwf_v2.py:3-5`), por lo que `wind_speed_10m` del NWP (`viento_ecmwf` / `wind10_ecmwf`) está en **km/h** (media $9,10$).
   - Los **8 boosters `v1` congelados** (y los 2 `_v2`) se entrenaron con `viento_ecmwf` / `wind10_ecmwf` en **km/h**.
2. **En inferencia en vivo (`mos_forecaster.py:383-395`, `_ecmwf_frame`)**:
   - Llama a `requests.get(_ECMWF_URL, params=params)` **sin pasar por `OpenMeteoClient`** y sin `wind_speed_unit`, por lo que entrega `viento` en **km/h** (consistente con el entrenamiento).
3. **¡OJO CON `_proxy_df` (`mos_forecaster.py:437-446`, ruta de backtest)!**:
   - Cuando `now_hour < cut`, `_proxy_df` descarga el proxy `ecmwf_ifs025` usando **`OpenMeteoClient`**:
     ```python
     client = OpenMeteoClient(
         latitude=self.site_cfg["latitude"],
         longitude=self.site_cfg["longitude"], timezone=tz,
         variables=list(_ECMWF_COLS),
         models="ecmwf_ifs025")
     ```
   - **Si cambias `OpenMeteoClient` a `"wind_speed_unit": "ms"` por defecto sin tocar `_proxy_df`**, entonces en backtest `_proxy_df` empezará a entregar `proxy_src["viento"]` en **m/s**, mientras que `_ecmwf_frame` (en vivo) y los boosters entrenados con `data/ecmwf/` esperan **km/h**.
   - **Solución exacta**:
     - `OpenMeteoClient` pasa a tener `wind_speed_unit: str = "ms"` por defecto (arreglando `_context_df` del MOS, `v1` del iTransformer, `pers_h24`, `PatchTST`, `OpenMeteoForecaster` y la verdad ERA5 / `ecmwf_crudo` en `compare_providers.py`).
     - Y en `_proxy_df` (`mos_forecaster.py:437-444`), se pasa explícitamente `wind_speed_unit="kmh"` con comentario declarado para mantener paridad exacta con `_ecmwf_frame` y con los boosters entrenados sobre `data/ecmwf/`.

---

## 3. Tareas a implementar

### TAREA T1 — `optimization/weather/openmeteo.py`: `wind_speed_unit = "ms"` por defecto

En `optimization/weather/openmeteo.py`:
1. Añadir el atributo `wind_speed_unit: str = "ms"` en `OpenMeteoClient.__init__` (`:55-68`).
2. En `_build_params` (`:81-97`), incluir `"wind_speed_unit": self.wind_speed_unit` dentro del diccionario `params`.

**Efecto verificado**:
- `MOSClimateForecaster._context_df` (`mos_forecaster.py:339`) descarga el contexto ERA5 / `past_days` en **m/s** $\implies$ `v1` del iTransformer recibe `wind_speed_100m`, `wind_speed_10m` y `wind_power_proxy` en **m/s** y **m³/s³** (descontaminando las 10 variables), y `pers_h24` entra en **m/s**.
- `PatchTSTClimateForecaster._context_df` (`forecaster.py:190`) y `OpenMeteoForecaster` (`forecaster.py:100`) reciben viento en **m/s**.
- `compare_providers.py` (`climate` verdad ERA5 en `:111` y `ecmwf_crudo` en `:45`) mide el viento en **m/s**.

---

### TAREA T2 — `optimization/prediction/mos_forecaster.py`: preservar `wind_speed_unit="kmh"` en `_proxy_df`

En `optimization/prediction/mos_forecaster.py:437-445` (`_proxy_df`):
- Pasar `wind_speed_unit="kmh"` al instanciar `OpenMeteoClient` para el proxy `ecmwf_ifs025`:
  ```python
  client = OpenMeteoClient(
      latitude=self.site_cfg["latitude"],
      longitude=self.site_cfg["longitude"], timezone=tz,
      variables=list(_ECMWF_COLS),
      # Misma fuente y unidad que el entrenamiento (data/ecmwf/ se descargo
      # sin wind_speed_unit -> km/h, igual que _ecmwf_frame en vivo).
      models="ecmwf_ifs025",
      wind_speed_unit="kmh")
  ```
- **No tocar `_ecmwf_frame`** (`:383-395`), que ya pide a `_ECMWF_URL` en km/h. Así `proxy_src["viento"]` (`viento_ecmwf` y `wind10_ecmwf`) es **km/h** tanto en entrenamiento como en backtest y en vivo, sin romper los 8 boosters `v1` congelados.

---

### TAREA T3 — `optimization/prediction/mos/train_mos_v2.py`: `pers_h24` estrictamente causal

En `optimization/prediction/mos/train_mos_v2.py:221-227` (`row_for`):
1. Sustituir `pers = float(era[var].values[t_idx - 24])` (que para $hh \ge 24$ lee el futuro posterior al `anchor = i + L`) por el índice causal idéntico al de producción (`mos_forecaster.py:590-592`):
   ```python
   def row_for(var, i, hh):
       """Una fila (X-dict, y) para `var` en la ventana i, hora hh."""
       i = int(i)
       t_idx = i + L + hh
       # 5.8/T3: pers_h24 causal (ultimo dia del contexto [i + L - 24, i + L - 1]
       # con la misma hora del dia que t_idx; prohibido leer >= i + L).
       p_idx = i + L - 24 + (hh % 24)
       assert p_idx < i + L, f"Fuga temporal en pers_h24: {p_idx} >= {i + L}"
       v1 = v1_all[var][hh]
       pers = float(era[var].values[p_idx])
   ```
2. Nota: para el día 1 ($hh \in [0, 23]$), `i + L - 24 + (hh % 24)` coincide con `t_idx - 24`; para los días 2 y 3 ($hh \in [24, 71]$), usa la última observación disponible antes del `anchor`, igual que `mos_forecaster.py:590-592`.

---

### TAREA T4 — Tests herméticos en `optimization/tests/test_mos_forecaster.py`

Añadir tests unitarios que fallen si se revierte cualquiera de las 3 correcciones:
1. **`test_openmeteo_client_wind_speed_unit_ms_por_defecto`**:
   - Verifica que `OpenMeteoClient()._build_params(forecast_days=1)["wind_speed_unit"] == "ms"`.
   - Verifica que `OpenMeteoClient(wind_speed_unit="kmh")._build_params(forecast_days=1)["wind_speed_unit"] == "kmh"`.
2. **`test_mos_context_usa_ms_y_proxy_mantiene_kmh`**:
   - Con `monkeypatch` sobre `OpenMeteoClient`, verifica que `_context_df` lo invoca con `wind_speed_unit == "ms"` (tanto con `anchor=None` como con `anchor` en el pasado) y que `_proxy_df` (`live=False`) lo invoca con `wind_speed_unit == "kmh"`.
3. **`test_train_mos_v2_pers_h24_causal_sin_fuga_futura`**:
   - Verifica que en `train_mos_v2.py`, para cualquier ventana `i` y para **todas** las horas `hh in range(72)`, si se sobrescribe el futuro `era[var].iloc[i + L : i + L + H] = 99999.0`, el valor de `Xd["pers_h24"]` devuelto por `row_for` **no cambia ni un bit** (prueba mutante anti-fuga: con `t_idx - 24` falla en `hh = 24..71`; con `i + L - 24 + (hh % 24)` pasa en las 72 horas).

---

### TAREA T5 — Reentreno de `cloud_cover_v2` y `wind_speed_100m_v2` (o humo sintético si no hay parquets en la VM)

- Si tienes acceso a `era5_v3.parquet` y `ecmwf/ecmwf_YYYY_MM.parquet`: corre `python3 -m optimization.prediction.mos.train_mos_v2 --data-dir ...` para regenerar `lgbm_mos_cloud_cover_v2.txt`, `lgbm_mos_wind_speed_100m_v2.txt` y `mos_v2_manifiesto.json` con `pers_h24` causal (en LF), y reporta la nueva tabla T4 (`MAE, corr, std, media, skill` + baselines triviales).
- Si los parquets siguen sin estar en la VM: valida el script actualizado con tu prueba de humo sintética, deja el manifiesto sintético en `integracion_plataforma/sprint_1a_forecast_mos/reference/resultados/` y la auditoría ejecutará el reentreno real en la máquina del autor (igual que en `480d7d5`).

---

## 4. Qué NO se toca

- **NO lances la Tarea 0** (`forecaster.py` default, `data_loader.py:154`, `deploy_pi.sh:52` ni re-corrida de Fase 1).
- **NO toques los 8 boosters `v1` congelados** ni el checkpoint `modelo_b.pt`.
- **NO toques `_ecmwf_frame`** (`mos_forecaster.py:383-395`).
- **NO toques el solver MILP ni el conformal**.

---

## 5. Qué debes reportar al cerrar

1. Salida de `pytest optimization/tests/test_mos_forecaster.py` (con los 3 tests nuevos de 5.8 incluidos y prueba mutante verificada).
2. Confirmación de que `OpenMeteoClient` pide `wind_speed_unit="ms"` por defecto y `_proxy_df` pide `wind_speed_unit="kmh"`.
3. Resultado de `train_mos_v2.py` con `pers_h24` causal (tabla T4 real si hay parquets, o humo sintético + diff listo para que la auditoría regenere los dos `_v2` reales).
