# PLAN — CAMBIO 08 · FÍSICA DEL MODELO MPC DE PRODUCCIÓN
### rampa del diésel · no-simultaneidad import/export · cargo fijo de red · contrato de exportación

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Este archivo vive en
> `C:\Users\2D\tesis-microrred\docs\` y se copia como
> `integracion_plataforma/cambio_08_modelo_mpc_fisica/README.md`.
>
> **Estado**: **propuesta**. Nada implementado.
> **Clasificación**: 🖥️ **PRODUCCIÓN** — es el modelo que resuelve cada 15 min en el bucle del
> diagrama. **No** depende de re-correr experimentos de validación (ver §6).
> **Origen**: auditoría `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` §A.1 (A8, A9, A10) + hallazgo D
> (§2.4) encontrado al escribir esta spec.
> **Prerequisito**: ninguno. Es independiente del cambio 06.

---

## 0. Qué resuelve

El modelo que hoy resuelve el bucle del diagrama es correcto en su estructura (balance `==` con
ENS/CURT, big-M del diésel, complementariedad, valor terminal del SoC) pero tiene **3 huecos de
física/contrato** que hacen que el plan emitido pueda ser **no ejecutable** o **mal contabilizado**:

1. **El diésel puede saltar de 0 a 300 kW en una hora.** No existe restricción de rampa — ni en el
   modelo, ni en la topología, ni en el editor del diagrama (grep `ramp` → **0 resultados**).
2. **Puede importar y exportar en la misma hora.** No hay binaria de exclusión.
3. **El cargo fijo de red se cobra por hora** (40 COP × 24 h = **960 COP/día**), aunque esté
   declarado como "cargos de conexión".

Ninguno de los tres cambia la *estructura* del MPC: son física y contabilidad.

---

## 1. Lo que YA existe en el repo (verificado leyéndolo, HEAD `2e60acf`)

| pieza | ruta:línea | estado |
|---|---|---|
| Binaria del diésel (big-M) | `solver/model_builder.py:229-249` | ✅ correcto, base para la rampa |
| Límites de import/export | `:216-222`, `:251-258` | ⚠️ sin exclusión mutua |
| `max_export` derivado | `:222` (`-grid_min` si `grid_min < 0`) | ⚠️ ignora `max_export_kw` de la topología |
| Balance con ENS/CURT | `:357-360` | ✅ |
| `P_export ≤ PV` | `:361-364` | ✅ (limita el arbitraje, no lo elimina) |
| Función objetivo | `:482-504` | ⚠️ `grid_d` suma por hora |
| Cargo fijo en el breakdown | `:808` | ⚠️ mismo criterio |
| Topología de producción | `Backend/services/mpcScheduler.js:20-40` | diésel `max 300 / min 50`; grid `max_import 400`, `max_export_kw 300`, `min_import_kw -300`, `cost_fixed 40` |
| Costos por defecto | `solver/cost_functions.py:24-30` | `cost_fixed 40`, `cost_variable 60` |
| Timing de referencia | Exp B (`expB_*`) | **0.45 s p50**, 120/120 `optimal`, p95 0.59 s |

---

## 2. Los defectos (síntoma → causa raíz)

### 2.1 — No hay rampa del diésel (defecto A9 de la auditoría)

**Evidencia**: `grep -rn "ramp" optimization Backend Frontend/GestionSrc` → **vacío**. No existe el
concepto en ninguna capa (modelo, API, editor).

**Por qué importa**: el plan que ve el operador puede exigir un salto de 0 → 300 kW en 60 min. Un
generador diésel de esa potencia no lo hace: la rampa típica de arranque/aceptación de carga es del
orden de decenas de kW por minuto **según la máquina**. El MPC puede estar entregando un plan
**físicamente inejecutable** y el jurado puede señalarlo.

**Decisión declarada (no se inventa el valor)**: la rampa es un **dato del equipo**, no una
constante de código. Se declara en la topología:
```js
{ id:'diesel_1', type:'diesel', max_kw:300, min_kw:50, ..., ramp_kw_per_h: <valor del fabricante> }
```
- Si `ramp_kw_per_h` **no viene** → el modelo **no impone rampa** (comportamiento actual) y devuelve
  `warnings: ["diesel_1: rampa no declarada, plan sin límite de rampa"]` en el resultado.
  **Nunca un 0 silencioso ni un valor inventado** (regla dura 4).
- El autor debe fijar el valor real del equipo antes de activarlo en producción.

### 2.2 — Import y export pueden coexistir (defecto A10)

**Evidencia** (`:235-238`): `P_import` y `P_export` son variables independientes `NonNegativeReals`
sin binaria. Con `export_tariff = 0` no hay incentivo económico, pero **en cuanto el sitio tenga
tarifa de inyección** aparece un arbitraje ilegal en la misma hora (importar a tarifa valle y
exportar a tarifa de venta).

**Arreglo (condicional, para no encarecer el modelo sin motivo)**: la binaria `U_grid[t,s]` se crea
**solo si `export_tariff > 0`**. Con `export_tariff = 0` se conserva el modelo actual (menos
binarias → Exp B no se degrada).

### 2.3 — El cargo fijo de red se cobra por hora (defecto A8)

**Evidencia** (`:491`): `total += prob * (grid_d + grid_e[t]*P_import − export_tariff*P_export)` →
40 COP **en cada hora del horizonte**, esté o no importando.

**Hallazgo que tranquiliza (y hay que declarar)**: `grid_d` **no depende de ninguna variable de
decisión** → quitarlo del objetivo **no cambia el plan óptimo**; cambia únicamente **el valor
reportado** (`objective_value` y `cost_breakdown`). Es corrección de contabilidad, no de despacho.

**Decisión declarada**: separar en el contrato `cost_fixed` (**COP/hora de conexión**, criterio
actual) de `cost_fixed_month` (**COP/mes**, cargo fijo real). Si el operador configura el mensual,
se prorratea por hora del horizonte. El plan no se altera en ningún caso.

### 2.4 — `max_export_kw` se ignora (hallazgo nuevo, defecto D)

**Evidencia**: la topología declara `grid.max_export_kw: 300`
(`mpcScheduler.js:36`) **pero el modelo lo ignora** y deriva el tope exportando desde
`min_import_kw` (`model_builder.py:222`). Si el operador configura
`max_export_kw: 100` con `min_import_kw: -300`, el solver **permitiría 300 kW** de exportación.

**Arreglo**: declarar la precedencia — `max_export_kw` si está presente, `-min_import_kw` como
fallback — y **reportar en el resultado cuál se usó** (`grid_limits: {max_import, max_export, source}`).

---

## 3. Alcance (3 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **08.1** | **Rampa del diésel** | `ramp_kw_per_h` en el contrato + restricción `|P_d[di,t,s] − P_d[di,t−1,s]| ≤ rampa` + **estado inicial** `initial_diesel_kw` en el job (necesario para `t=0`) + `warnings` si falta el dato |
| **08.2** | **No-simultaneidad import/export** | Binaria `U_grid[t,s]` con big-M **solo si `export_tariff > 0`** + precedencia de límites de export |
| **08.3** | **Cargo fijo de red** | Separar `cost_fixed` (COP/h) de `cost_fixed_month` (COP/mes, prorrateo) y **etiquetar** el término en el desglose |

**Convención de rampa en el arranque** (declarada): el paso de **0 → mínimo técnico** se permite en
un período (es un arranque, no una rampa de carga); la rampa se exige **entre dos períodos
encendidos**. Si el equipo real no lo permite, se declara en la topología como una rampa desde 0 y
se modela con `ramp_kw_per_h` sobre `U_diesel` — **decisión del autor, no del implementador**.

---

## 4. Contrato de datos

**Entrada del job** (lo que `mpcScheduler` envía al solver):

| campo | hoy | tras el cambio | obligatorio |
|---|---|---|---|
| `sources[].ramp_kw_per_h` | — | **nuevo**, por generador dispatchable | no (si falta → sin rampa + warning) |
| `initial_diesel_kw` | — | **nuevo**, potencia del período anterior por generador | recomendado (si falta → se asume `min_kw·U`) |
| `grid.max_export_kw` | existe pero se ignora | **se respeta**, con precedencia declarada | no |
| `grid.cost_fixed_month` | — | **nuevo** (COP/mes) | no |
| `grid.cost_fixed` | COP/h | se conserva con su semántica documentada | no |

**Salida del resultado**:

| campo | nuevo | contenido |
|---|---|---|
| `warnings[]` | ✅ | p. ej. rampa no declarada; límite de export no declarado |
| `grid_limits` | ✅ | `{max_import, max_export, source: "max_export_kw"|"min_import_kw"}` |
| `cost_breakdown.fixed_matrix` | ✅ | cargo fijo aplicado, separado del variable |

**Compatibilidad**: con un job **sin** los campos nuevos, el comportamiento es **idéntico al de hoy**
(salvo los warnings informativos).

---

## 5. Líneas a tocar (declaradas una a una)

| # | Archivo | Líneas | Acción |
|---|---|---|---|
| 1 | `optimization/solver/model_builder.py` | `:202-213` | leer `ramp_kw_per_h` del dispositivo |
| 2 | `optimization/solver/model_builder.py` | **añadir** tras `:249` | restricciones de rampa (2 por generador y período: subida y bajada) |
| 3 | `optimization/solver/model_builder.py` | `:216-222` | precedencia de `max_export_kw` + registrar la fuente |
| 4 | `optimization/solver/model_builder.py` | `:235-238` + tras `:258` | binaria `U_grid` **condicional** a `export_tariff > 0` + 2 big-M |
| 5 | `optimization/solver/model_builder.py` | `:457-463`, `:491`, `:808` | separar cargo fijo (hora vs mes prorrateado) y etiquetarlo |
| 6 | `optimization/solver/model_builder.py` | `:511-538` | añadir `warnings`, `grid_limits` y `cost_fixed_applied` a `variables`/salida |
| 7 | `Backend/services/mpcScheduler.js` | `:20-40` (`DEFAULT_TOPOLOGY`) | declarar `ramp_kw_per_h` y `cost_fixed_month` (valores del autor) |
| 8 | `Backend/services/mpcScheduler.js` | donde construye el job | enviar `initial_diesel_kw` (del resultado del ciclo anterior) |
| 9 | `optimization/tests/test_solver.py` | **añadir** tests | rampa respetada; exclusión import/export con tarifa; cargo fijo |

**No se toca**: `cost_functions.py` (la firma no cambia), `scenarios.py`, `solvers.py`,
`calibration/**`, `Frontend/**` (el editor puede añadir el campo después, en otro incremento).

---

## 6. Criterios de cierre — verificables EJECUTANDO (sin validación)

- [ ] **C1 · Tests del modelo**
  ```bash
  cd optimization && pytest tests/test_solver.py tests/test_complementarity_scenarios.py -q
  ```
  → pasa lo existente + los tests nuevos de rampa/exclusión.

- [ ] **C2 · La rampa se respeta de verdad** (test con dato declarado)
  → con `ramp_kw_per_h = 25` y un salto de demanda que exigiría 0→300, el plan **no** salta más de
  25 kW entre períodos consecutivos. Se imprime la secuencia de `P_diesel` como evidencia.

- [ ] **C3 · Sin penalización de rendimiento**
  ```bash
  cd optimization && python -m optimization.experiments.experiment_b_solver_time --cycles 30
  ```
  → **criterio**: p95 ≤ 1.0 s (línea base 0.59 s) y 30/30 `optimal`. Si la binaria de `U_grid`
  sube el tiempo, se reporta el número real.

- [ ] **C4 · Compatibilidad hacia atrás**
  → un job como los de hoy (sin campos nuevos) produce el **mismo plan** (comparar
  `dispatch_plan` contra una corrida previa guardada).

- [ ] **C5 · El plan de hoy era inejecutable (evidencia del hallazgo)**
  → tomar el `dispatch_plan` de la última corrida en Redis y calcular el **máximo salto** de
  `P_diesel` entre horas consecutivas. Reportar el número (si es > rampa del equipo, el defecto
  queda demostrado con el artefacto real).

- [ ] **C6 · Contabilidad del cargo fijo**
  → con `cost_fixed = 40` y horizonte 24 h, el desglose muestra **960 COP/día** identificados como
  cargo fijo; el `objective_value` deja de mezclarlo con el costo variable.

---

## 7. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | La rampa puede hacer **infactible** el balance en un salto brusco de demanda | declarar la rampa como "blanda" (slack penalizado) si el autor lo prefiere **— decisión del autor** |
| 2 | Más binarias (`U_grid`) → modelo más lento | se activan **solo** con `export_tariff > 0`; C3 mide el impacto |
| 3 | Un valor de rampa mal declarado invalida planes | el valor es dato del fabricante, no del implementador; se reporta en `warnings` si falta |
| 4 | Cambiar el cargo fijo altera **números publicados** del Exp A | **declarar que el plan no cambia**: solo el valor reportado (ver §2.3) |

---

## 8. Fuera de alcance (declarado)

| tema | dónde va |
|---|---|
| Banda de incertidumbre (escenarios) | `cambio_06` |
| Re-corrida del Exp A/A2 con la física nueva | bloque de **validación**, al final |
| Campo de rampa en el editor del diagrama (UI) | incremento posterior de UI |
| Informe §5.1 (documentar rampa y exclusión) | redacción del capítulo, con el código congelado |

---

## 9. Fila para la tabla de `integracion_plataforma/README.md`

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **08** | `cambio_08_modelo_mpc_fisica/` | Física del MPC de producción: rampa del diésel, no-simultaneidad import/export, cargo fijo de red y contrato de exportación | 🟡 Spec v1 · sin implementar |
