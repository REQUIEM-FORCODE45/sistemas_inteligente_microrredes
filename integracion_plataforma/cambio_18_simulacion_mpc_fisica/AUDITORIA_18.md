# AUDITORÍA — CAMBIO 18 (simulación MPC, física de batería y robustez del lazo)

> Ejecutada por quien especifica, sobre **`9b07245`** (2026-10-26). Este clon es solo de revisión.
> Método: lectura del diff (`model_builder.py`, `solvers.py`), del `README`/`VERIFICACION` y **cotejo con
> los resultados ya validados** (Fases 0–1). Tests estáticos corridos: **3/3 PASS**.

---

## 1. Veredicto

**Cinco de los seis puntos son hallazgos reales y bien resueltos. El sexto (C6) es un defecto de
severidad alta que, tal como está, rompe la reproducibilidad de las cifras de la tesis.**

| # | Punto | Veredicto |
|---|---|---|
| C1 | `pythonBin.js` multiplataforma | ✅ **bug real** (en Windows `python3` cae al alias de la Store) |
| C2 | `activePollers` en vez del singleton | ✅ **el mejor hallazgo del cambio**: un trigger manual cancelaba el poller del ciclo automático y **`mpcRunning` quedaba atrapado en `true`** → el lazo se congelaba en silencio |
| C3 | `dt = time_step/60` en SoC y objetivo | ✅ **correcto y retrocompatible**: ExpA/ExpB usan `time_step_minutes: 60` → `dt = 1.0` → idéntico |
| C4 | No-anticipatividad de `SW_S` en `t=0` | ✅ **bug real de modelado** (el seccionador podía abrirse en el presente "sabiendo" el clima futuro) — es la E4 del checklist |
| C5 | Cuantiles por escenario en `dispatch_plan` | ✅ **bug real**: el plan forzaba P50 y el **balance de potencia visual no cerraba** en Soleado/Lluvioso |
| **C6** | `TimeLimit=60 s`, `MIPGap=1 %`, `feasible`→`optimal` | 🔴 **inaceptable tal como está** (§2) |

---

## 2. 🔴 C6: introduce límites que cambian los resultados — y los etiqueta como óptimos

### 2.1 Los tres defectos, juntos

```python
solver.options["TimeLimit"] = time_limit     # 60 s por defecto
solver.options["MIPGap"] = 0.01              # 1 %
...
if termination in ("optimal", "feasible"):
    return SolverResult(status="optimal", ...)   # ← feasible se reporta como "optimal"
```

1. **`TimeLimit = 60 s` contra un solver que tarda ~110 s/solve.** El ritmo lo midió el propio proyecto
   en la Fase 0 (`sonda_threads.json`: 52,9–95,9 s por solve). Con 60 s **la mayoría de los solves se
   cortan** y devuelven el **incumbente**.
2. **`MIPGap = 1 %`** en un problema donde las diferencias que se publican son del **0,6–2 %** (V1, V2).
   Un gap del 1 % es del mismo orden que la señal: **la comparación deja de ser fiable**.
3. **`feasible` se reporta como `optimal`.** Es lo más grave: convierte una solución truncada en
   "óptima" y **elimina la posibilidad de declararlo**. La regla del proyecto es lo contrario: *fuente de
   la cifra declarada o `null`*, nunca una etiqueta que oculta la condición real.

### 2.2 El "0,0 % de regresión" **no se midió** y es falso para C6

El `VERIFICACION` dice:

> *"Para `time_step_minutes = 60`, `dt = 1.0`, garantizando 0.0 % de regresión respecto a las líneas base"*

Eso es cierto **para `dt`** (y lo verifiqué: `strategies.py:53` y `experiment_b_solver_time.py:35` usan
`time_step_minutes: 60`). Pero **el mismo commit cambia el solver**, así que la afirmación global es
falsa: con `TimeLimit=60` y `MIPGap=1 %` **las líneas base no se reproducen**.

Y lo que se midió fue **sintaxis** (`node --check`, `py_compile`). No hay **ni una corrida**, ni un
`reference/`, ni un test. Eso no es una verificación de comportamiento.

### 2.3 Consecuencia directa para la tesis

Las cifras que van al capítulo (**ENS −5,13 kWh / −26 %**, V2 grid10/grid30, V7) se midieron **sin**
límite de tiempo y **sin** gap. Si mañana se re-corre con el código actual, **saldrán otras** y el
capítulo no será reproducible con el repo. Eso es exactamente lo que el bloque de validación evitó
durante toda la semana.

---

## 3. Lo que pido (en orden)

1. **Parametrizar `mip_gap` y `time_limit`**, con default **sin límite** y **gap 0** (reproducibilidad),
   y un modo "producción" que los active **declarándolo**. `time_limit` ya es parámetro; `MIPGap` no.
2. **No colapsar `feasible` en `optimal`.** Mantener `status="feasible"` y **reportar el gap y el
   termination** en el resultado del job. Si se quiere tratar como aceptable, que sea decisión aguas
   arriba, no una etiqueta silenciosa.
3. **Demostrar la no-regresión de verdad**: una corrida de una celda de la Fase 1 con el código nuevo
   (sin límites) comparada **por sha256** con `validacion/fase_1/`. Con `dt=1`, sin `connections` (así
   que `SW_S` no entra) y con el plan por cuantiles (que **no** toca costo ni ENS), **debe dar idéntico**.
   Si da idéntico, todo lo publicado sigue válido y el cambio 18 se acepta entero. Si no, hay que saber
   **qué** cambió antes de escribir una sola cifra.
4. Menor: el commit **no tiene cuerpo** — no explica el porqué de los seis cambios. La metodología pide
   archivo + línea + razón, y el `README` lo cubre, pero el mensaje de git debería apuntar a él.

---

## 4. Estado de las cifras ya validadas

| Cifra | ¿La toca el cambio 18? |
|---|---|
| Fase 1 · ENS S vs D (−5,13 kWh / −26 %) | **Solo si se re-corre con límites** (C6). Con `dt=1` y sin `connections`, el modelo es idéntico. **Pendiente de la corrida de §3.3** |
| Fase 1 · V2 grid10/grid30 | Igual |
| Fase 1 · V7 (inversor) | Igual |
| `dispatch_plan` por escenario (y el unifilar del 16) | **Sí mejora**: ahora muestra el cuantil real de cada escenario (C5). Los costos/ENS no cambian |

**Ninguna cifra queda invalidada por el modelo; quedan en riesgo solo por los límites del solver (C6).**
