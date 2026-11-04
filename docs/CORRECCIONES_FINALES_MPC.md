# 🛠 CORRECCIONES FINALES MPC — 3ª iteración (2026-08-27)

**Repositorio**: `sistemas_inteligente_microrredes`
**Historial**: `PLAN_CORRECCION_MPC.md` (1ª ronda E1–E9) → `VERIFICACION_CORRECCIONES_MPC.md` (verificación + §7 2ª ronda R1–R6) → **este documento (2ª verificación fallida + corrección final)**
**Último commit verificado**: `cc9ae6e` "fix(mpc): R1 valor terminal SoC 30 + regeneración ExpA 14d" — **R1 NO surtió efecto** (ver §2). Este documento contiene el fix definitivo.

---

## 1. ESTADO ACTUAL (verificado el 2026-08-27, evidencia en `expA_traces_smpc.csv`)

### 1.1 Lo que SÍ quedó resuelto (NO tocar)

| Ítem | Estado | Evidencia |
|---|---|---|
| Arbitraje diésel→red eliminado | ✅ | Costos positivos: S-MPC 11,933 / D-MPC 12,039 / HEUR 11,047 / MPC-PI 7,774 COP |
| Diésel ya no quema 24/7 | ✅ | 0 h encendido (antes 336/336) |
| Exportación realista | ✅ | ~2,200 kWh totales (antes 51,230) |
| ENS/violaciones | ✅ | 0 violaciones, ENS 0 |
| E1–E9 + UI (Parte II) | ✅ | Implementados y verificados (código + componentes React) |
| Batería: complementariedad Z big-M | ✅ | carga/descarga excluyentes |

### 1.2 Lo que SIGUE ROTO (objetivo de este documento)

| # | Problema | Evidencia |
|---|---|---|
| F1 | **La batería NUNCA carga** (`charge_kw = 0.0` en 72/72 h) | perfil S-MPC: ch=0 h00–h23, mismo valor que antes de R1 |
| F2 | **El SoC solo drena 130 → 81 kWh** y nunca vuelve a subir | SoC por día: 130→81 el 05, 130→80.7 el 06, 130→81.2 el 07 |
| F3 | **Descarga en valle (45 COP/kWh) exportando a 0 COP** | 23 h simultáneas (smpc), 20 h (dmpc) con `discharge>0 ∧ grid<0` |
| F4 | **PV de mediodía (22 kW) exportado entero a 0** en vez de cargar batería | h10–h14: grid −13/−19, ch=0 |
| F5 | **HEUR gana al MPC (−8%)** por batería irracional, no por superioridad | 50,866 vs 54,804 COP |
| F6 | **Ventana de 3 días** (08-05→08-07), no 14 | 72 filas; el commit dice "14d" pero el rango es 3 días |
| F7 | **Diésel nunca ejercitado** (0 L) — E1 sin demostrar | `max_import_kw=400` sigue permitiendo que la red lo cubra todo |

---

## 2. DIAGNÓSTICO — POR QUÉ FALLÓ R1 (causa raíz, verificada en código)

`optimization/solver/model_builder.py` (implementación actual):

```python
SOC_TERM_PEN = 30.0                              # ← línea 411
...
target = bmeta["initial_soc"] * cap              # ← línea 425: ¡target MÓVIL!
```

**Bug R1a — target móvil**: `target = initial_soc` del job, y en el lazo cerrado
`_build_job` pasa `initial_soc = SOC REAL de cada hora` (`strategies.py`). Si el MPC
drena la batería a 81, el target se mueve a 81 → la penalidad terminal se
**auto-anula**: nunca penaliza drenar. El valor terminal debe apuntar a un
**target FIJO** (0.65·cap), independiente del estado de entrada.

**Bug R1b — pena = λ**: `SOC_TERM_PEN = 30.0` es **igual** al costo de degradación
(30 COP/kWh). El incentivo es **neutro**: cargar 1 kWh cuesta 30 (degradación) y
ahorra 30 de pena → empate exacto → el solver elige el camino fácil (no cargar,
drenar). La pena debe ser **un orden de magnitud mayor** (≥300) para romper el empate.

**Bug R1c (síntoma de fondo) — degradación efectiva ~0**: la exportación simultánea
con descarga a tarifa 0 (F3) es una decisión que NINGÚN solver tomaría con
degradación real positiva: descargar 4.7 kW para exportarlos a 0 COP es perder
energía pagando degradación. Su presencia indica que la degradación no está
pesando en las decisiones (se documenta como síntoma; con R1' + R2 el modelo
queda forzado físicamente correcto).

**Conclusión del diagnóstico**: R1 se implementó sintácticamente bien (variables,
constraints, objetivo) pero quedó **neutralizado por el target móvil + pena=λ**.
El comportamiento observado es idéntico al pre-R1 (mismos costos al céntimo:
11,933 COP), lo que confirma que la penalidad terminal nunca intervino.

---

## 3. CORRECCIONES FINALES (archivo por archivo, código listo para pegar)

### R1' — Valor terminal del SoC CORREGIDO (target fijo + pena alta)

**Archivo**: `optimization/solver/model_builder.py`

**Reemplazar el bloque actual** (líneas ~410-435, desde `SOC_TERM_PEN = 30.0` hasta
el cierre del `for bi ... for s ...`):

```python
    # === R1' CORRECCIÓN FINAL: valor terminal del SoC (target FIJO, pena ≫ λ) ===
    SOC_TERM_PEN = 300.0          # ≫ degradación (30): incentivo REAL a conservar reserva
    SOC_TARGET_FRAC = 0.65        # target FIJO, NO initial_soc (target móvil anulaba la pena)
    if storage_list:
        model.TERM_DEV_POS = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1), model.S,
            domain=pyo.NonNegativeReals,
        )
        model.TERM_DEV_NEG = pyo.Var(
            pyo.RangeSet(0, len(storage_list) - 1), model.S,
            domain=pyo.NonNegativeReals,
        )
        for bi, bmeta in enumerate(storage_vars):
            cap = bmeta["capacity_kwh"]
            target = SOC_TARGET_FRAC * cap          # ← FIJO (antes: initial_soc * cap)
            for s in s_ids:
                tH = horizon - 1
                model.add_component(
                    f"soc_term_pos_{bi}_{s}",
                    pyo.Constraint(expr=model.SOC[bi, tH, s] - target <= model.TERM_DEV_POS[bi, s]),
                )
                model.add_component(
                    f"soc_term_neg_{bi}_{s}",
                    pyo.Constraint(expr=target - model.SOC[bi, tH, s] <= model.TERM_DEV_NEG[bi, s]),
                )
```

**Verificar que el objetivo ya lo incluye** (debe estar — se sumó en la 2ª ronda, ~línea 496):
```python
total += prob * SOC_TERM_PEN * (m.TERM_DEV_POS[bi, s_idx] + m.TERM_DEV_NEG[bi, s_idx])
```
Si no está, añadirlo dentro del `for bi` del objetivo.

**Efecto esperado**: el MPC ahora pierde 300 COP por cada kWh que el SoC final se
desvía de 130 → le conviene terminar cada ventana cerca de 130 → CARGA con PV de
mediodía (costo solo degradación 30) y solo descarga cuando el valor de la energía
(evitar importación pico 140) supera la pérdida de reserva → ch>0 diurno, SoC
recorriendo [0.65→pico 95%→0.65].

### R2' — Exportación solo de excedente RENOVABLE (mata F3)

**Archivo**: `optimization/solver/model_builder.py` — dentro del bucle de balance
(donde se calcula `pv_kw`, tras la creación de `P_import/P_export` y dentro del loop
`for s_idx ... for t ...`):

```python
            # R2' (CORRECCIÓN FINAL): la exportación solo puede ser excedente
            # renovable, NUNCA energía de batería ni de diésel:
            model.add_component(
                f"exp_solo_pv_{t}_{s_idx}",
                pyo.Constraint(expr=model.P_export[t, s_idx] <= pv_kw + 1e-3),
            )
```

*(Requiere que las variables de exportación existan antes — están definidas en
`if storage_list`/grid; si el bloque `P_export` se define dentro de otro
condicional, mover la constraint a después de la definición de variables. Si el sitio
no tiene PV (solar_devices vacío), el lado derecho será 0.0 → exportación prohibida,
comportamiento correcto.)*

**Efecto esperado**: desaparecen las 23 h de descarga+exportación simultáneas
(F3). La batería solo descarga para atender carga interna → su energía nunca se
"regala" a la red a 0 COP.

### R3' — Confirmar degradación activa

**Archivo**: `optimization/experiments/config.py` — `degradation_cost_per_kwh: 30.0` ✅
(ya existe).

**Nota**: verificar además que `_build_job` (strategies.py) pase el dict completo:
```python
battery = dict(MICROGRID["battery"])   # incluye degradation_cost_per_kwh=30 (ya está)
```
**Opcional (recomendado)**: subir a 50 en la misma corrida si tras R1' la batería
cicla sin límite (sobre-arbitraje); bajar a 10 si no cicla nada. La sensibilidad se
documenta en el paper (la tesis usó λ=200 con costos 10× mayores — aquí 30–50 es el
orden correcto).

### R4' — Red limitada para ejercitar el diésel (E1 demostrable)

**Archivo**: `optimization/experiments/config.py` — bloque `grid`:

```python
    "grid": {
        "max_import_kw": 30.0,      # ← 400 → 30: red limitada (fallback débil)
        "min_import_kw": -300.0,
        "cost_fixed": 40.0,
    },
```

**Efecto esperado**: cuando carga+demanda nocturna (>30 kW en picos) supere la red,
el diésel entra → los traces muestran **on/off intermitente** (U=1/0 por horas),
E1 demostrado con datos. Declarar en el paper: "escenario de red débil (fallback),
equivalente al caso de microrred con respaldo diésel".

**Alternativa (si no se quiere tocar la topología)**: escalar la carga de prueba a
~34 kW nominal (`data_loader.py` o un `--load-scale`), manteniendo max_import alta —
pero entonces el diésel solo aparecerá si la carga supera 400 kW-import, cosa que no
pasará → **la opción R4' (red limitada) es la que garantiza ejercitar E1**.

### R5' — Reescritura honesta de la discusión (F1–F5)

**Archivos**: `results/pasto_narino/experiments/expA_table.md` + `informe.md` §7.1

Eliminar (textos heredados falsos):
- "la batería hace el arbitraje valle→pico (carga a 45, descarga a 140)" — ❌ nunca cargó
- "el SOC recorre el rango operativo completo [0.2, 0.95]" — ❌ solo [0.40, 0.65]
- "microred exportadora... se vende al precio variable del período" — ❌ export_tariff=0
- cualquier "0.27%", "1,112%", "14 días" que no corresponda a los datos finales

Nueva narrativa (con los datos post-R1'+R2'+R4'):
1. El MPC carga la batería con el excedente solar diurno y la descarga en pico
   (arbitraje legítimo valle→pico con degradación λ).
2. La comparación vs HEUR depende de la ventana y la topología — reportar el valor
   real y explicar (HEUR puede competir con red débil y cargas bajas).
3. El diésel demuestra on/off (E1) con red limitada (R4').
4. MPC-PI sigue siendo cota superior; la brecha se recalcula con los fixes.
5. Coherencia estricta de periodos/fechas/números en toda la tabla.

### R6' — Re-correr correctamente (modo DEPURACIÓN rápido + modo FINAL 14 días)

> ⚠️ **Lección de la iteración anterior**: el commit decía "14d" y eran 3 días.
> Con este esquema el Nº de días es **explícito y verificable en cada corrida**:
> se depura con pocos días y SOLO la corrida final usa 14.

**CLAVE — días cortos solo sirven si el experimento ya ejercita el diésel.**
Con carga real ~3–7 kW y `max_import=400` el diésel NUNCA enciende, ni en 3 ni en
14 días (por eso la ventana anterior dio 0 L). Para que la depuración rápida sea
**válida** hay que aplicar ANTES:
- `R4'` con **red limitada a 30 kW** (config) **Y** el pico de carga real (>30 kW)
  o **escala de carga** (`--load-scale 10` ≈ 34 kW media, picos ~58–74 kW como la
  tesis) para que en noches el déficit supere la red → diésel entra → **E1 se
  demuestra incluso en 3 días**.

**Modo A — DEPURACIÓN (iteraciones de corrección, ~2-5 min por corrida):**
```bash
cd optimization
python -m optimization.experiments.experiment_a --days 3 --load-scale 10
#    ^ N días corto (3-5)  ^ carga escalada a nominal (~34 kW)
```
Validación mínima (depuración):
- `wc -l expA_traces_smpc.csv` = **73** (3×24+1) para 3 días — el Nº debe
  **coincidir con lo que se va a commitear**: si el commit dice "3d", las trazas
  tienen 73 filas; si dice "14d", 337. NUNCA uno en el mensaje y otro en el archivo.
- `ch>0` diurno, 0 desc&exp simultáneas, `diesel` con on/off, SoC termina ≈65%.
- El script `experiment_a.py` ya acepta `--days` (default 14); añadir `--load-scale`
  (default 1.0) si no existe, aplicándolo a `load_realized_demand()` en `main()`:
```python
ap.add_argument("--load-scale", type=float, default=1.0,
                help="Escala la carga realizada (1.0=original; 10≈34 kW nominal)")
# en main():
load_real = load_realized_demand(days[0], end) * args.load_scale
```

**Modo B — FINAL (solo para el paper, cuando A1–A10 estén en verde en modo A):**
```bash
cd optimization
python -m optimization.experiments.experiment_a --days 14 --load-scale 10
python -m optimization.experiments.experiment_b_solver_time   # MILP creció con R1'/R2'
# Validación obligatoria antes de commitear:
wc -l results/pasto_narino/experiments/expA_traces_smpc.csv   # DEBE ser 337 (14×24+1)
```

---

## 4. CHECKLIST DE ACEPTACIÓN FINAL (todo debe pasar)

| # | Criterio | Comando/evidencia |
|---|---|---|
| A1 | 4 trazas = 336 filas, rango 14 días | `wc -l expA_traces_smpc.csv` = 337 |
| A2 | `charge_kw > 0` en horas diurnas | `(tr["charge_kw"]>0.1).sum()` > 50 |
| A3 | SoC recorre y termina ≈ 65% | SoC final ≈ 130±10 kWh en cada día |
| A4 | 0 horas descarga+export simultánea | `((dch>0.1)&(grid<-0.1)).sum()` == 0 |
| A5 | Diésel on/off evidente (si R4') | horas `diesel>0` entre 50 y 300 (no 0 ni 336) |
| A6 | Costos positivos, violaciones 0 | tabla expA_metrics |
| A7 | Figuras regeneradas sin diésel 255 kW | fecha y contenido de `expA_figures.png` |
| A8 | Tabla/discusión sin textos heredados falsos | grep "1,112%\|0.27%\|arbitraje valle→pico\|14 días" (si 14d ok) |
| A9 | UI muestra los CSV nuevos | prueba manual panel Experimental |
| A10 | Commit con `git tag v3-mpc-final` | historial limpio, backup antes |

**Si A2/A3/A4 fallan tras R1'+R2'**: subir `SOC_TERM_PEN` a 1000 o forzar
`SOC_TARGET_FRAC` a 0.5 (más fácil de alcanzar), y verificar `degradation_cost_per_kwh`
realmente llega al objective (print del rate en debug).

---

## 5. ARCHIVOS AFECTADOS (resumen)

| Archivo | Cambio |
|---|---|
| `optimization/solver/model_builder.py` | R1' (target fijo 0.65 + PEN 300), R2' (P_export ≤ PV) |
| `optimization/experiments/config.py` | R4' (max_import_kw 30), R3' tuning λ si aplica |
| `optimization/experiments/strategies.py` | (verificar solo que pasa los dicts completos) |
| `optimization/experiments/data_loader.py` | (solo si se cambia test_period_days a 14d explícito) |
| `results/.../expA_table.md` + `informe.md` | R5' reescritura honesta |
| `Backend/` / `Frontend/` | **SIN CAMBIOS** (la UI consume los CSV automáticamente) |

---

## 6. RIESGOS Y NOTAS

- **R1' aumenta el desvío terminal 10×**: es intencional (rompe el empate); el valor
  exacto (300 vs 1000) se calibra con A2/A3. No afecta la física del balance.
- **R2' puede hacer infactibles ventanas con batería llena y PV alto** si la
  exportación queda restringida a PV y no hay curtailment suficiente → el CURT ya
  existe (variable de vertido) → el excedente se vierte en vez de exportarse: es el
  comportamiento físico correcto. Verificar A4/A6 que no aparezcan violaciones.
- **R4' cambia la naturaleza del experimento** (red débil): declararlo explícitamente
  — es el caso de uso real de la tesis (microrred con respaldo diésel) y la UI
  permite al usuario volver a 400 kW con un clic.
- **No confundir "14 días"**: el commit anterior decía 14d y eran 3 — la validación
  A1 (wc -l = 337) es obligatoria antes de commitear.
- **Traza para el jurado**: este documento + `PLAN_CORRECCION_MPC.md` +
  `VERIFICACION_CORRECCIONES_MPC.md` forman la cadena plan→implementación→
  verificación→corrección final. Referenciar los 3 en `AGENTS.md` (ya se hizo para
  los dos primeros).

---

*Fin de la 3ª iteración. Este documento se marca ✅ solo cuando A1–A10 pasen completos.*