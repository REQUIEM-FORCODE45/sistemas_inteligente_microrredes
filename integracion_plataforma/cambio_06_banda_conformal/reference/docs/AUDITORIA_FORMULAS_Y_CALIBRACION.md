# 🔍 AUDITORÍA — Fórmulas de optimización y ML de calibración de sensores

**Objetivo**: comparar **lo declarado** (informe/especificación/anexos) contra **lo programado** (código), e identificar vacíos y errores.
**Alcance**: read-only. No se modificó código ni resultados.
**Repo**: `sistemas_inteligente_microrredes` — rama `main`, HEAD `2e60acf`
**Fecha**: 2026-09-19

---

## Resumen ejecutivo

| Área | Estado | Hallazgos |
|---|---|---|
| **Formulación MILP (código)** | ✅ Sólida | Balance `==` con ENS/CURT, big-M del diésel, complementariedad, valor terminal del SoC |
| **Documentación de la formulación** | ⚠️ Desactualizada | 6 discrepancias entre `informe.md` §5.1 y el código |
| **Modelado de escenarios** | 🔴 Crítico | El informe declara un mecanismo (factores 60/30/10) que **no es** el programado (cuantiles 20/60/20) |
| **Banda de incertidumbre (ML)** | 🔴 Crítico | Radio conformal mal aplicado + in-sample + asimetría → cobertura **50%** con nominal 80% |
| **Ciclo de recalibración / deriva** | ⚠️ Vacío | `drift.py` existe pero **no está cableado**; artefactos sin refrescar |
| **Proveedor climático** | ⚠️ Dependiente de env | Default `openmeteo`; `patchtst` solo se fija en `deploy_pi.sh` |

---

# PARTE A — Fórmulas de optimización

## A.1. Lo que el informe declara vs lo que el código hace

| # | `informe.md` declara | Código implementa | Severidad |
|---|---|---|---|
| A1 | Balance `ΣP_diesel + P_grid + P_solar + ΣP_desc − ΣP_carg **≥** P_load` (§5.1.3) | `diesel + grid_net + pv + wind + desc + **ENS** − carg − **CURT** **==** load` (`model_builder.py:357-360`) | 🟡 doc vieja |
| A2 | Una variable `P_grid[t,s]` (§5.1.1) | `P_import` y `P_export` **separadas** + `P_export ≤ PV + 1e-3` (`:235-238`, `:361-364`) | 🟡 doc vieja |
| A3 | 5 variables de decisión (§5.1.1) | 11+: `ENS`, `CURT`, `U_diesel` (binaria), `Z` (binaria), `TERM_DEV_POS/NEG`, `DIESEL_COST` | 🟡 doc incompleta |
| A4 | Escenarios **Soleado 60% / Nublado 30% / Lluvia 10%** con factores de irradiancia **1.00 / 0.50 / 0.20** (§5.2) | `Soleado 20% P90 / Nublado 60% P50 / Lluvia 20% P10`, `factor_pv = 1.0` en los 3 (`scenarios.py:20-28`) | 🔴 **mecanismo distinto** |
| A5 | `P_min[d] ≤ P_diesel ≤ P_max[d]` continuo (§5.1.3) | Big-M con binaria: `P ≥ min·U`, `P ≤ max·U` (`:246-249`) | 🟡 doc vieja |
| A6 | Sin valor terminal del SoC | `TERM_DEV_POS/NEG`, target `0.65·cap`, `SOC_TERM_PEN = 300` (`:415-438`) | 🟡 doc incompleta |
| A7 | Anexo: *"solver usa **P10** (peor caso) en el balance (MPC robusto por cuantiles)"* | Usa el **cuantil del escenario**: P90/P50/P10 (`:311-313`) | 🔴 **describe otro MPC** |
| A8 | "término fijo que representa cargos de conexión" (§5.1.2) | `grid_d` (40 COP) se cobra **en cada hora** → 960 COP/día (`:491`, `:808`) | 🟠 sobrecosto |
| A9 | *(no declarado)* | **No hay restricción de rampa del diésel** (la tesis exige ≤25 kW/h) | 🟠 hueco físico |
| A10 | *(no declarado)* | **No hay no-simultaneidad import/export** (ambas ≥0 sin binaria) | 🟠 riesgo latente si `export_tariff > 0` |
| A11 | Anexo: "reporta P50 en el dispatch" | `_extract_dispatch_plan` usa **P50 para los 3 escenarios** (`:698`) aunque el solver usó P90/P50/P10 | 🟠 la UI no muestra la incertidumbre usada |
| A12 | Degradación lineal respecto a energía ciclada ✓ | `rate·(P_carg+P_desc)` con `rate` **default 30** (`cost_functions.py:45`); experimento usó **40**; tesis **200** | 🟠 producción ≠ experimento |

### Consecuencia de A4 y A7 (lo más grave)
El **núcleo matemático documentado no corresponde al programa**: el informe describe escenarios con factores de irradiancia (1.0/0.5/0.2) y probabilidades 60/30/10, mientras el código usa **cuantiles de la banda conformal** con 20/60/20. Y el anexo describe un MPC **robusto (P10 en todos)** cuando el programado es **estocástico por cuantiles**. Cualquier jurado que compare informe ↔ código encuentra el desfase.

## A.2. Componentes verificados como correctos ✅

- **Balance con igualdad estricta** + `ENS`/`CURT` como variables penalizadas → no hay déficit ni vertido "invisibles" (corrige el bug E3).
- **Big-M binaria del diésel** (`U_diesel`) → permite apagado real y respeta el mínimo técnico (corrige E1).
- **`P_export ≤ PV`** → no se exporta energía de batería/diésel (corrige el arbitraje artificial de E2).
- **Complementariedad carga/descarga** con `Z` binaria (`:397-413`) ✓.
- **Dinámica del SoC**: `SOC_t = SOC_{t−1} + η_c·P_carg − P_desc/η_d` (`:385-395`) → **coincide exactamente con la física corregida de la tesis** ✓.
- **No-anticipatividad en `t=0`** acoplando diésel (P y U), import, export, carga, descarga y `Z` entre escenarios (`:440-455`) ✓.
- **Linealización por tramos del diésel** (10 tramos, reps `MC`) → MILP compatible con HiGHS, y el costo **cuadrático real** se reporta en `cost_breakdown` (`:465-480`, `:799`) ✓.
- **Valor terminal del SoC** con target fijo y penalización 300 → evita el drenaje del inventario inicial ✓.
- **Costo fijo/variable de red con ToU horaria** (`cost_variable` como lista por hora) ✓.

---

# PARTE B — ML de calibración de sensores

## B.1. Qué hay programado (mapa real)

| Activo | Método | Archivo |
|---|---|---|
| **Solar (PV)** | 4 etapas: derating K → params físicos pvlib → GBR residual → conformal P10/P50/P90 | `calibration/service.py:102-150` |
| **BESS** | `least_squares` sobre SOC medido (η_c, η_d, capacidad) | `service.py:153-184` |
| **Eólico** | K + GBR, con **modelo nulo honesto** si no hay señal | `service.py:187-233` |
| **Carga** | **Media por hora del día (24 valores)** + cuantiles globales del residuo | `service.py:236-248` |

Cableado del bucle verificado ✓: `/predict/calibrate` → `fit_from_sensor` (`prediction/main.py:86-94`); `/predict/sensor` → `predict_sensor` (`:116-138`); artefactos en `results/pasto_narino/calibrated/<sensor>.pkl`.

## B.2. 🔴 HALLAZGO CRÍTICO — La banda que alimenta los escenarios del MPC está mal calibrada

**Evidencia en código** (`service.py:129-141`):
```python
k = estimate_derating(nominal.ac_power(cli_tr), p_tr, ...)   # ajustado con TODO cli_tr
params = calibrate_params(nominal, cli_tr, p_tr)              # idem
plant_calib = build_plant(nominal, params)
resid_fit = p_tr[:n_fit] - plant_calib.ac_power(cli_tr[:n_fit])/1000   # residuo del modelo FÍSICO
gbr = fit_residual_gbr(feats_fit, resid_fit)                  # GBR aparte
cal_resid = resid_fit.iloc[-int(0.2*n_fit)]
radius = conformal_radius(cal_resid, alpha=0.2)               # radio del modelo FÍSICO, in-sample
```
`calibrated_plant.py:72-78`:
```python
p50 = self.predict_power(climate, use_residual=...)  # P50 = físico + GBR  (HÍBRIDO)
band = conformal_band(p50, self.conformal_radius_kw) # banda SIMÉTRICA P50 ± radio
```
`conformal.py:53-59`:
```python
"P10": (p50 - radius).clip(lower=0.0), "P90": p50 + radius   # simétrica + clip a 0
```

**Tres defectos que se acumulan**:
1. **Desajuste de distribución**: el radio mide el error del modelo **físico**, pero se aplica a la banda del **híbrido (físico+GBR)**, cuyo error es distinto (menor y con otra forma). Es un supuesto de conformal prediction violado.
2. **Calibración in-sample**: `params` y `k` se ajustaron con los **mismos datos** donde se mide el residuo → radio **subestimado**; tampoco hay split disjunto entre ajuste y calibración del cuantil.
3. **Simetría + clip**: el error de un modelo PV es **heterocedástico** (crece con la irradiancia) y **truncado en 0**. Una banda simétrica de radio constante subestima P10 en horas de alta generación y el `clip(lower=0)` **rompe la garantía de cobertura**.

**Síntoma ya medido en el anexo del informe**: cobertura holdout **50.2% / 54.8%** con banda nominal **80%** (`informe.md:456-465`), atribuido a "deriva temporal". El código indica que **también hay causa estructural**.

## B.3. 🔴 Consecuencia directa sobre el MPC (el enlace que faltaba explicar)

Los escenarios del S-MPC **son** la banda P10/P50/P90 (`sensor_predictor → predictions_pv_band → model_builder._band_at`, `:311-313`).

```
Banda subestimada (cobertura real 50% en vez de 80%)
   → escenarios P10/P90 comprimidos hacia el P50
   → el S-MPC "ve" menos incertidumbre de la que existe
   → sus decisiones convergen a las del D-MPC
   → S-MPC ≈ D-MPC  (lo observado en el Exp A y A2)
   → ENS residual pequeño (3.5 vs 10.6 kWh)
```

**Esto da una explicación causal al resultado del A2** (antes solo descriptivo) y una **hipótesis verificable**: recalibrar la banda debería **aumentar la separación S-MPC vs D-MPC** en isla (más valor de la robustez). También explica por qué la brecha contra el oráculo MPC-PI es del 11%: parte de esa brecha es incertidumbre mal representada, no solo error de pronóstico.

## B.4. Otros hallazgos del ML de sensores

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| B5 | **La carga no tiene modelo ML**: es la media por hora del día (24 valores) + cuantiles globales | `service.py:236-248` | 🟠 |
| B6 | El resumen JSON del load (`pasto_load.json`, 104 B) guarda `{"profile": "calibrado", q10, q90}` → **no verificable**; el del solar sí expone k/params/radio | `service.py:324-338` | 🟡 trazabilidad |
| B7 | **No hay ciclo de recalibración**: `fit_from_sensor(force=False)` reutiliza; artefactos del 26-ago (≈3.5 semanas) | `service.py:283-294`, `ls calibrated/` | 🟠 |
| B8 | **`monitoring/drift.py` NO está cableado** a la recalibración ni al bucle (grep vacío en `main.py`, `mpcScheduler.js`, `service.py`) | grep | 🟠 |
| B9 | **Proveedor climático por defecto `openmeteo`**; `FORECASTER=patchtst` solo se fija en `deploy_pi.sh:52` / docs. Sin `.env` versionado → arranque local cae a NWP directo, no a PatchTST | `forecaster.py:436-446`, `deploy_pi.sh` | 🟠 |
| B10 | La banda del **viento** usa el mismo radio conformal solar (`predict_band` compartido) aunque el modelo eólico es nulo en Pasto | `sensor_predictor.py:47-59` | 🟡 |

**Nota**: la sospecha previa sobre `pasto_load.json` (104 B, `profile: "calibrado"`) queda **aclarada: es un resumen, no el artefacto**; el modelo real está en el `.pkl` (382 B) y `load_calibrated()` lee el pickle. No era un bug, sí una debilidad de trazabilidad.

---

# PARTE C — Priorización de correcciones

## 🔴 Críticas (afectan resultados o validez ante el jurado)
1. **`conformal.py` + `calibrated_plant.py` + `service.py:129-141`** — recalibrar la banda: split disjunto, radio sobre el **error del predictor final (híbrido)**, cuantiles **condicionales** (por nivel de irradiancia) y sin clip que rompa la cobertura. *Efecto esperado: cobertura → ~80% y más separación S-MPC vs D-MPC.*
2. **`informe.md` §5.2 + anexo §"Endpoints"** — alinear con `scenarios.py` (cuantiles, 20/60/20) y con `model_builder.py:311-313` (cuantil por escenario, no P10 en todos).
3. **`informe.md` §5.1** — actualizar balance (`==` con ENS/CURT), variables (ENS, CURT, U_diesel, Z, TERM_DEV), big-M del diésel, `P_export ≤ PV`, valor terminal del SoC.

## 🟠 Altas (huecos físicos o de configuración)
4. **Añadir rampa del diésel** (≤25 kW/h) al modelo, si la especificación de la tesis la exige.
5. **Añadir no-simultaneidad import/export** (o documentar por qué no es necesaria con `export_tariff=0`).
6. **`grid_d`**: definir si es cargo por hora o mensual (hoy 40 COP × 24 h = 960 COP/día).
7. **Alinear la degradación** de producción (30) con la del experimento validado (40) — y documentar el λ elegido frente al realista (200).
8. **Cablear `drift.py`** a la recalibración automática + política de refresco de artefactos.
9. **Documentar el proveedor activo** (`FORECASTER`) en el arranque, no solo en `deploy_pi.sh`.

## 🟡 Medias (trazabilidad)
10. Exponer en el JSON de resumen del **load** los 24 valores del perfil y `n_muestras` (simetría con solar/BESS).
11. Documentar en el informe el **modelo de carga** realmente usado (perfil horario + escalado de producción; no ML).
12. Aclarar en la UI/anexo que el dispatch reporta **P50** mientras el balance usa el cuantil del escenario — o reportar la banda usada.

---

## Anexo — Verificaciones realizadas

| Verificación | Resultado |
|---|---|
| Balance del modelo | `==` con ENS/CURT ✓ |
| Dinámica del SoC vs física de la tesis | coincide (η_c en carga, ÷η_d en descarga) ✓ |
| Big-M diésel y mínimo técnico | implementado con `U_diesel` ✓ |
| `P_export ≤ PV` | implementado ✓ |
| Complementariedad carga/descarga | `Z` binaria ✓ |
| Linealización diésel | 10 tramos `MC`, cuadrático real en breakdown ✓ |
| Valor terminal del SoC | target 0.65, PEN 300 ✓ |
| No-anticipatividad | `t=0`, 6 familias acopladas ✓ |
| Banda conformal | **3 defectos acumulados** 🔴 |
| Recalibración / deriva | **no cableado** 🟠 |
| Proveedor climático | dependiente de env 🟠 |

*Auditoría read-only. No se modificó código, resultados ni artefactos.*
