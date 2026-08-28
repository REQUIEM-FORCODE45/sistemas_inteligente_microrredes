# ✅ CIERRE DE CORRECCIONES MPC — Pasada final (2026-08-27)

**Repositorio**: `sistemas_inteligente_microrredes`
**Cadena completa**: `PLAN_CORRECCION_MPC.md` (E1-E9) → `VERIFICACION_CORRECCIONES_MPC.md` (R1-R6 + §7) → `CORRECCIONES_FINALES_MPC.md` (R1'+R2' + checklist A1-A10) → **este documento (C1-C3: el misterio de la carga + diésel)**
**Último commit verificado**: `3a5e419` (R1' PEN300/target fijo + R2' export≤PV) — batería ✅, pero **diésel sigue 0 L por escala de carga**.

---

## 1. EL MISTERIO DE LA CARGA — RESUELTO (causa raíz del diésel=0)

### 1.1 Las TRES fuentes de carga que existen en el sistema (verificadas)

| Fuente | Media | Pico | Uso actual |
|---|---|---|---|
| **`Consumo.mat`** (PL1+PL2+PL3) | **372 kW** | **680 kW (h18)** | Producción: `blendLoads` lo escala al `max_kw` del bloque 'mat' |
| Perfil calibrado `pasto_load.pkl` | **3.7 kW** | 7.4 kW | 🔴 **El forecast del lazo usa ESTE** (`ClosedLoopForecastProvider`) |
| Sensor Mongo `pasto_load` | **~3.7 kW** | ~7.4 kW | 🔴 **El backtest usa ESTE como 'realizada'** (`load_realized_demand`) |

**El bug**: el experimento usa las fuentes 2 y 3 (ambas ~3.7 kW, 90 kWh/día) mientras que
producción usa la fuente 1 escalada (43.8 kW media a pico 80 → 1,051 kWh/día). Con carga
de 3-7 kW y red de 30 kW, **el diésel jamás es necesario** → A5 imposible en 3 ni 14 días.

### 1.2 La escala correcta (lo que hace PRODUCCIÓN con `blendLoads`)

```js
// Backend/services/mpcScheduler.js — blendLoads()
scale = matCapacity / peak;      // matCapacity = Σ max_kw de bloques 'mat'
loadTotal = base.map(v => v * scale + staticKw);
```

| max_kw del bloque 'mat' | scale | Media resultante | Pico | kWh/día |
|---|---|---|---|---|
| 80 kW | 0.1176 | 43.8 kW | 80 kW | 1,051 |
| 100 kW | 0.1470 | 54.7 kW | 100 kW | 1,313 |

El experimento debe **replicar exactamente esto**: leer `Consumo.mat`, escalar al
pico objetivo `LOAD_MAT_PEAK_KW` y usar ESA curva tanto como pronóstico como
realizada (la incertidumbre del lazo la aporta el clima/PV, no la carga — y así el
lazo cierra físicamente).

---

## 2. CORRECCIÓN C1 — Usar Consumo.mat en el experimento (DIÉSEL ✓)

### 2.1 `optimization/experiments/config.py` — constante nueva

```python
# Carga del experimento = Consumo.mat escalado al pico del bloque 'mat'
# (mismo comportamiento que blendLoads de producción). 80 kW → media ~44 kW,
# picos nocturnos ~80 kW con la forma real de 18-21h del .mat.
LOAD_MAT_PEAK_KW = 80.0
```

### 2.2 `optimization/experiments/data_loader.py` — leer .mat y usarlo

**Añadir** (junto a los imports; `scipy.io` ya es dependencia — la usa `matlab_predictor`):

```python
import scipy.io as sio
from optimization.prediction.matlab_predictor import DEFAULT_CONSUMO
from optimization.experiments.config import LOAD_MAT_PEAK_KW

@lru_cache(maxsize=1)
def load_consumo_mat_profile() -> np.ndarray:
    """Perfil horario (24) del Consumo.mat escalado al pico del bloque 'mat'.
    Misma operación que blendLoads de producción (mpcScheduler.js)."""
    m = sio.loadmat(DEFAULT_CONSUMO)
    pl = (np.asarray(m["PL1"]).ravel() + np.asarray(m["PL2"]).ravel()
          + np.asarray(m["PL3"]).ravel())
    peak = float(pl.max()) or 1.0
    return pl * (LOAD_MAT_PEAK_KW / peak)
```

**Reemplazar `load_realized_demand()`** (ya no Mongo ~3.7 kW; la curva del .mat
repetida en el rango):

```python
def load_realized_demand(start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Demanda horaria realizada [kW]: perfil Consumo.mat escalado (blendLoads),
    repetido sobre el rango. La realización = la curva del ejemplo (producción);
    la incertidumbre del lazo la pone el clima/PV pronosticado vs realizado."""
    prof = load_consumo_mat_profile()
    idx = pd.date_range(start.floor("h"), end.floor("h"), freq="h", tz=TZ)
    n = len(idx)
    return pd.Series(np.tile(prof, int(np.ceil(n / 24)))[:n], index=idx)
```

**Reemplazar el perfil del forecast** (`ClosedLoopForecastProvider.forecast` y
`OracleForecastProvider.forecast`, líneas ~165 y ~188): la carga pronosticada
también es el .mat escalado (así forecast == realizado para la carga):

```python
        # ANTES: profile = self.load_model.get("profile_kw", {})
        #        load = pd.Series([float(profile.get(int(h), 0.0)) for h in ...])
        # DESPUÉS: mismo .mat escalado que la realizada
        load = pd.Series(
            [float(load_consumo_mat_profile()[int(h) % 24]) for h in climate.index.hour],
            index=climate.index)
```

**Efecto esperado (C1)**:
- Carga media ~44 kW, picos nocturnos 18-21h de **~80 kW** (forma real del .mat).
- Con R4' (`max_import_kw=30` ya aplicado en config) → en picos nocturnos el déficit
  supera red+batería → **el diésel entra** (min 50 kW, on/off con E1) → **A5 ✅**.
- El lazo es físicamente consistente (misma curva en forecast y realizada → sin
  "desc&exp" por mismatch de carga; A4 debería caer a ~0 salvo efecto de horizonte).

### 2.3 Verificación rápida tras C1 (sin re-correr todo)

```python
from optimization.experiments.data_loader import load_consumo_mat_profile
p = load_consumo_mat_profile()
print(p.max(), p.mean())   # ≈ 80.0, ~43.8  → la carga ya no es 7.4 kW
```

---

## 3. CORRECCIÓN C2 — Afinar el par (λ degradación, PEN terminal)

Verificado en la pasada anterior: MPC-PI sobrecarga (SoC 155.7 > target 130) porque
λ=30 << PEN=300 → cargar PV "gratis" hasta el techo paga menos degradación que la
pena de no llenar. Con la carga nueva (44 kW media) el consumo real dará salida a la
batería, pero conviene equilibrar:

**En `optimization/solver/model_builder.py`** (2 constantes):
```python
SOC_TERM_PEN = 300.0          # mantener
SOC_TARGET_FRAC = 0.65        # mantener
```
**En `optimization/experiments/config.py`**:
```python
"degradation_cost_per_kwh": 50.0,    # 30 → 50 COP/kWh (acerca λ a ~PEN/6)
```

Regla práctica: λ_disp ≤ PEN/6 evita sobrecarga excesiva con PV gratis sin matar el
arbitraje valle→pico (45→140). Si tras C1+C2 MPC-PI aún termina >0.8·cap,
subir λ a 80-100; si S-MPC deja de cargar, bajarla a 30. (Sensibilidad de 5 min.)

---

## 4. CORRECCIÓN C3 — Recalibrar checklist A2/A4 para 3 días de depuración

Los criterios A2/A4 se definieron para 14 días; en modo depuración (3 días) usar:

| Criterio | 3 días (depuración) | 14 días (final) |
|---|---|---|
| A2 `charge_kw>0.1` | **≥ 10 h** (≈ 3-4 h/día) | ≥ 50 h |
| A3 SoC final ≈ 65% | 110-140 kWh (0.55-0.70·cap) | igual |
| A4 desc&exp simultánea | **0 h** (tras C1 ya no hay mismatch de carga) | 0 h |
| A5 diésel on/off | **≥ 5 h** con 0.5<diesel<300 | ≥ 30 h intermitentes |
| A1 filas | 73 (3×24+1) | 337 (14×24+1) |

**Importante**: A4 ya medía el slack físico del backtest; tras C1 la carga
pronosticada == realizada, así que las horas con `discharge>0 ∧ grid<0` deberían
ser 0 — si no, es un efecto real de horizonte (documentarlo, no "arreglarlo").

---

## 5. ORDEN DE EJECUCIÓN (pasada final)

```bash
# 0. backup
git add -A && git commit -m "chore: backup antes de C1-C3"

# 1. Aplicar C1 (config + data_loader), C2 (λ=50) — ya están R1'/R2'/R4'

# 2. Sanity rápido de la carga (5 s):
cd optimization && python -c "from optimization.experiments.data_loader import load_consumo_mat_profile as f; p=f(); print(p.max(), round(p.mean(),1))"
#    expect ≈ 80.0 43.8

# 3. Depuración 3 días (2-5 min):
python -m optimization.experiments.experiment_a --days 3
#    (la carga YA es el .mat escalado: NO hace falta --load-scale)

# 4. Validar modo A (3d): A1=73, A2≥10, A3∈[110,140], A4=0, A5≥5, A6✅

# 5. Si pasa → final 14 días (10-20 min):
python -m optimization.experiments.experiment_a --days 14
wc -l results/pasto_narino/experiments/expA_traces_smpc.csv   # = 337
python -m optimization.experiments.experiment_b_solver_time

# 6. Actualizar expA_table.md / informe.md con los números nuevos y
#    la narrativa: red débil (30 kW) + carga Consumo.mat escalada (44 kW media)
#    → diésel intermitente (E1), batería con ciclo diario (R1'), export solo PV (R2').

# 7. Commit de cierre:
git add -A && git commit -m "fix: C1-C3 — carga Consumo.mat escalada (diésel E1 ✅), λ=50, checklist 3d/14d"
```

---

## 6. CRITERIOS DE ACEPTACIÓN FINALES (todo en verde = tesis lista)

| # | Criterio | Esperado | Dónde se ve |
|---|---|---|---|
| A1 | 4 trazas, 336 filas (14d) | 337 líneas | `wc -l expA_traces_smpc.csv` |
| A2 | Batería carga de día | ch>0 diurno ≥ 50 h (14d) | traces |
| A3 | SoC cicla y termina ~0.65 | final 120-140 kWh | `soc_kwh` |
| A4 | Sin descarga+export simultánea | 0 h | traces |
| A5 | **Diésel on/off intermitente** | ≥ 30 h entre 50-300 kW | `diesel_kw` |
| A6 | Costos positivos, viol=0, ENS≤1% | sí | expA_metrics.csv |
| A7 | Figuras regeneradas | fecha hoy | expA_figures.png |
| A8 | Tabla sin textos heredados | grep vacío de "1,112%"/"0.27%"/"arbitraje valle→pico" | expA_table.md |
| A9 | UI muestra los CSV nuevos | prueba manual | panel Experimental |
| A10 | Commit + tag `v3-mpc-cerrado` | historial limpio | git |

---

## 7. ARCHIVOS AFECTADOS (esta pasada)

| Archivo | Cambio |
|---|---|
| `optimization/experiments/config.py` | `LOAD_MAT_PEAK_KW=80` + `degradation_cost_per_kwh=50` (C1+C2) |
| `optimization/experiments/data_loader.py` | `load_consumo_mat_profile()` nueva; `load_realized_demand()` y ambos `forecast()` usan el .mat escalado (C1) |
| `optimization/solver/model_builder.py` | sin cambios (R1'/R2' ya aplicados y verificados ✅) |
| `results/.../expA_*` + `informe.md` | regenerados con la carga correcta + narrativa (pasos 5-6) |
| `Backend`/`Frontend` | sin cambios (la UI consume CSV) |

---

## 8. RIESGOS RESIDUALES (declarar en el paper)

- **La carga del experimento es el .mat escalado, no el sensor Mongo**: es la MISMA
  cadena de producción (`blendLoads`); el sensor Mongo (~3.7 kW) describe una demo a
  escala y no se usa en la validación. Documentar: "carga del ejemplo modular
  escalada al bloque del diagrama (80 kW pico), como en producción".
- **Red limitada a 30 kW** (R4'): escenario de red débil — declararlo; es el caso de
  uso de la tesis (microrred con respaldo diésel).
- **λ=50 vs PEN=300**: sensibilidad documentada; el rango razonable es λ∈[30,100].
- **ENS**: con red 30 kW y picos 80 kW puede aparecer ENS real en horas extremas —
  es FÍSICO (la ENS es variable del modelo, penalizada): reportarla como métrica,
  no ocultarla (mismo rigor que la tesis).

---

*Fin de la pasada final. Este documento cierra la cadena de correcciones; se marca ✅
cuando A1-A10 pasen en 14 días.*