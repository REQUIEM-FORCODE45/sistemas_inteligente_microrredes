# PLAN — CAMBIO 11 · PRECIO DEL COMBUSTIBLE DECLARABLE + CALIBRACIÓN ECONÓMICA DEL DIÉSEL
### precio por sitio (Pasto real) · Willans de la tesis · régimen declarado en los resultados

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Este archivo vive en
> `C:\Users\2D\tesis-microrred\docs\` y se copia como
> `integracion_plataforma/cambio_11_calibracion_diesel/README.md`.
>
> **Estado**: **propuesta**. Nada implementado.
> **Clasificación**: 🖥️ **PRODUCCIÓN** (el MPC decide con estos precios) + **trazabilidad**.
> **Origen**: auditoría `AUDITORIA_06_08_09_10.md` **§8.3** + **decisión del autor (2026-10-11)**: el
> precio del diésel **varía por ciudad y en el tiempo** → debe ser **declarable desde la plataforma**;
> se define el de **Pasto** y los experimentos/validaciones lo usan.

---

## 0. Qué resuelve

Hoy el diésel está parametrizado con `fuel_cost = 100` (unidad adimensional) y la curva
`(0.5 + 0.5·P + 0.001·P²)`. **No es un precio**: da **56 COP/kWh** a 50 kW y deja la relación
ENS/diésel en **89.3×**, un régimen donde el optimizador elimina ENS a cualquier costo.

En Colombia **el ACPM varía mucho por ciudad** (oct-2026, Portal CREG):

| ciudad | galón | por litro |
|---|---|---|
| Bogotá | $11,616 | $3,069 |
| Cali | $11,763 | $3,108 |
| Medellín | $11,641 | $3,076 |
| Barranquilla | $11,291 | $2,983 |
| **Pasto** | **$10,529** | **$2,782** |
| Cúcuta | $9,486 | $2,506 |

**Conclusión de diseño**: el precio **no puede ser una constante del código**. Debe ser un **dato del
sitio, declarable desde la plataforma, con vigencia y fuente**, y la curva de consumo debe ser la
**Willans de la tesis** (que ya existe calibrada).

**Efecto de la corrección** (Willans `1.8 + 0.24·P + 0.0012·P²`):

| régimen | @50 kW | ENS/diésel @50 kW | consumo |
|---|---|---|---|
| **Pasto real (2,782 COP/L)** | **935 COP/kWh** | **5.35×** | 336 L/MWh |
| tesis actual (4,500 COP/L) | 1,512 COP/kWh | 3.31× | 336 L/MWh |
| repo actual (100 unidades) | 56 COP/kWh | **89.29×** | 560 L/MWh |

El diésel real de Pasto es **16.7× más caro** que el del repo, y el consumo del repo está
**1.67× sobreestimado** (560 vs 336 L/MWh).

---

## 1. Lo que YA existe (verificado con artefactos)

| pieza | ruta | estado |
|---|---|---|
| **Willans calibrada de la tesis** | `tesis-microrred/reports/fase2/resultados_fase2.json` → `diesel {a0: 1.8, a1: 0.24, a2: 0.0012, mae: 2.5e-14}` | ✅ **dato real, no inventado** |
| Precio usado en la tesis | `tesis-microrred/scripts/ems_balance.py:157` → `price_cop_per_L = 4500  # ~1.1 USD/L` (consistente en `ems_mpc.py`, `ems_decision_transformer.py`, `ems_dimensionamiento_pv.py`) | ✅ 62 % por encima de Pasto |
| Forma de la ecuación | repo `(c + b·P + a·P²)·fuel` == tesis `(a0 + a1·P + a2·P²)·4500` | ✅ **idéntica**: `c↔a0`, `b↔a1`, `a↔a2` |
| Precio real de Pasto | Portal CREG, oct-2026: $10,529/galón → **$2,782/L** | ✅ aportado por el autor |
| Nodo diésel del diagrama | `deviceTypes.js`: `costA/B/C`, `fuelCost` en `defaultParams` | ✅ **ya es editable** (falta unidad + procedencia) |
| Config del sitio | `optimization/config/sites/pasto_narino.yaml` | ✅ **fuente canónica del sitio** → aquí va el precio |
| Registro en salidas | `expA2_daily_*.csv` (`diesel_L`, `ens_kwh`, `costo_total`) | ✅ hay artefacto para declarar el régimen |

---

## 2. Alcance (5 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **11.1** | **Precio del combustible en el sitio** | `fuel: {price_cop_per_l: 2782, vigencia: "2026-10", ciudad: "Pasto", fuente: "Portal CREG", galon_cop: 10529}` en `sites/pasto_narino.yaml` — **fuente única de verdad** para producción **y** experimentos |
| **11.2** | **Declarable desde la plataforma** | el nodo diésel toma el default del sitio y el operador puede **sobrescribirlo**; el valor efectivo viaja al solver y **queda registrado en el resultado** |
| **11.3** | **Curva Willans como default** | `cost_c=1.8, cost_b=0.24, cost_a=0.0012` (= `a0/a1/a2`) en la topología y en `experiments/config.py`, **con la equivalencia documentada** |
| **11.4** | **Declarar el régimen en los resultados** | nota obligatoria en las tablas del Exp A/A2 y en `informe.md`: **precio, vigencia, fuente y relación ENS/diésel** (89.29× antes → 5.35× después) |
| **11.5** | **Etiquetar lo publicado + programar la re-corrida** | las tablas se **etiquetan** con su régimen (no se reescriben); la re-corrida va al bloque de validación diferido |

**Decisiones declaradas**:
- **No se toca el modelo**: la forma de la curva es idéntica; solo cambian **valores** y su declaración.
- **Las validaciones usan el precio de Pasto** (decisión del autor).
- La **penalización de ENS se mantiene en 5,000 COP/kWh** (coincide con la tesis).

---

## 3. Contrato de datos

**En el sitio** (`sites/pasto_narino.yaml`) — nueva sección:

```yaml
fuel:
  price_cop_per_l: 2782      # $10,529/galón (Portal CREG, oct-2026, Pasto)
  galon_cop: 10529
  ciudad: "Pasto"
  vigencia: "2026-10"
  fuente: "Portal CREG"
```

**Claves del dispositivo diésel** (sin cambios de forma, semántica declarada):

| clave | unidad | semántica | default nuevo |
|---|---|---|---|
| `cost_c` | L/h | `a0` (Willans) | **1.8** |
| `cost_b` | L/h·kW⁻¹ | `a1` | **0.24** |
| `cost_a` | L/h·kW⁻² | `a2` | **0.0012** |
| `fuel_cost` | **COP/L** | precio efectivo | **del sitio** (2,782 Pasto) |
| `ens_penalty_cop_kwh` | COP/kWh | sin cambios | 5,000 |

**Regla de precedencia** (declarada): valor **del nodo** (si el operador lo edita) > **del sitio** >
default del código. El valor efectivo y su origen se reportan en el resultado
(`fuel_price_applied: {valor, origen: "nodo"|"sitio", vigencia, fuente}`).

**Regla de trazabilidad**: ningún precio se escribe a mano en un informe; sale del YAML versionado con
su vigencia y fuente.

---

## 4. Líneas a tocar (declaradas una a una)

| # | Archivo | Líneas | Acción |
|---|---|---|---|
| 1 | `optimization/config/sites/pasto_narino.yaml` | **añadir** sección `fuel:` | precio + vigencia + fuente |
| 2 | `optimization/config/loader.py` | `load_site()` | exponer `fuel` (lectura) |
| 3 | `Backend/services/mpcScheduler.js` | `DEFAULT_TOPOLOGY` (diésel) | `cost_a/b/c` Willans + `fuel_cost` del sitio |
| 4 | `optimization/experiments/config.py` | `:45-53` | mismas claves; docstring con la equivalencia Willans **y** la fuente del precio |
| 5 | `Frontend/.../diagram/constants/deviceTypes.js` | `defaultParams` diésel | valores del sitio + comentario de unidad |
| 6 | `Frontend/.../diagram/components/DeviceConfigPanel.jsx` | `paramLabels` | etiquetas con **unidad** (`COP/L`, `L/h`) + procedencia del precio |
| 7 | `optimization/solver/model_builder.py` | salida del resultado | `fuel_price_applied` (valor + origen + vigencia) |
| 8 | tablas del Exp A/A2 + `informe.md` | cabecera | **nota de régimen** (precio, fuente, ENS/diésel) |
| 9 | `integracion_plataforma/README.md` | tabla | fila del cambio 11 |

**No se toca**: la fórmula del modelo, `cost_functions.py`, la penalización de ENS, ni ninguna salida
publicada (se **etiqueta**, no se reescribe).

---

## 5. Criterios de cierre — verificables EJECUTANDO

- [ ] **C1 · El precio sale del sitio**: cambiar `fuel.price_cop_per_l` en el YAML y verificar que el
  job lo recibe; con el default de Pasto, el costo calculado a 50 kW es **~935 COP/kWh** (mostrar la cuenta).
- [ ] **C2 · Declarable desde la plataforma**: editar `fuelCost` en el nodo diésel del diagrama →
  el job lleva **ese** valor y el resultado reporta `origen: "nodo"`; sin editar → `origen: "sitio"`.
- [ ] **C3 · Un job de prueba cuadra a mano**: 8 h con el diésel encendido N horas → el
  `cost_breakdown` coincide con `Willans × precio` (tolerancia declarada).
- [ ] **C4 · El régimen queda escrito**: `89.29× antes → 5.35× después` aparece textualmente en las
  tablas y el informe, con precio, vigencia y fuente.
- [ ] **C5 · Lo publicado se etiqueta, no se reescribe**: cifras del Exp A/A2 intactas + marca de régimen.
- [ ] **C6 · Trazabilidad**: el precio efectivo consta en el YAML **y** en el resultado del solver;
  ninguna cifra de precio transcrita a mano.
- [ ] **C7 · El consumo es el de la tesis**: el diésel de un job de prueba consume **~336 L/MWh**
  (no 560), coherente con la Willans calibrada (`resultados_fase2.json`).

---

## 6. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Invalida la escala de los resultados publicados** (costos ×16.7) | no se reescriben: se etiquetan + re-corrida programada (C5) |
| 2 | El **plan del MPC cambiará** (diésel real, más caro) | es el objetivo: medir y reportar el cambio de plan |
| 3 | **Dos lados con precios distintos** (tesis 4,500 vs plataforma 2,782) | **declararlo explícitamente** (§7); el autor decide si la tesis se actualiza (implicaría rehacer tablas del Módulo 3) |
| 4 | El precio **caduca** (varía mes a mes) | campo `vigencia` + `fuente` obligatorios; el reporte muestra la antigüedad del precio (patrón `stale` ya existente) |
| 5 | Un operador con valores propios en el diagrama | precedencia declarada: manda el nodo (§3) |

---

## 7. Fuera de alcance (declarado)

| tema | dónde va |
|---|---|
| **Re-corrida** del Exp A/A2 con el precio de Pasto | bloque de **validación**, al final (diferido) — *las validaciones usan el precio de Pasto* |
| Actualizar el precio **en la tesis** (4,500 → CREG) | decisión del autor: implicaría rehacer tablas del Módulo 3; hoy se **declara la diferencia** |
| Precio de exportación/inyección | no aplica (`export_tariff = 0`) |
| Sobrecobertura de la banda (§7.2 de la auditoría) | línea abierta independiente |

**Nota declarada sobre la tesis**: el valor de la tesis (**4,500 COP/L**, "~1.1 USD/L") es **62 % más
alto** que el de Pasto (2,782). Se mantiene el de la tesis en los capítulos ya escritos y la plataforma
usa el **real del sitio**; la diferencia queda **explícita** para que no parezca una inconsistencia.
(Para futuras revisiones del manuscrito, el dato CREG con vigencia es más defendible que 1.1 USD/L.)

---

## 8. Fila para la tabla de `integracion_plataforma/README.md`

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **11** | `cambio_11_calibracion_diesel/` | Precio del combustible **declarable por sitio** (default Pasto: 2,782 COP/L, CREG oct-2026) + curva Willans de la tesis + régimen ENS/diésel declarado en los resultados | 🟡 Spec v1 · sin implementar |
