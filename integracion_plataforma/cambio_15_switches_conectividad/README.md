# PLAN — CAMBIO 15 · SWITCHES DE CONECTIVIDAD (F4)
### la topología deja de imponerse: el operador la fija y **ve** el resultado — o el MPC la **elige**

> **Naturaleza**: especificación para el repositorio. Vive en `C:\Users\2D\tesis-microrred\docs\` y se
> copia como `integracion_plataforma/cambio_15_switches_conectividad/README.md`.
> **Estado**: propuesta · **Clasificación**: 🖥️ PRODUCCIÓN · **Depende de**: cambios 12, 13, 14.
> **Origen**: petición del autor: *"tampoco se representa el switchado de la red… daríamos
> versatilidad de elegir y ver cómo funciona este switch entre todo; que se pueda ver y elegir"*.

---

## 0. Objetivo y por qué es el salto de mayor valor

Hoy la configuración de la microrred es un **parámetro del experimento** (`isla` / `grid10` / `grid30`
en `expA2_stochastic.py`): **se impone** desde fuera. Con switches:

1. El **operador** abre/cierra seccionadores en el lienzo y **ve** qué pasa (isla, acoplado, parcial).
2. El **solver** puede **elegir** la configuración como variable de decisión → el MPC deja de
   "operar en isla" y pasa a **"decidir cuándo operar en isla"**.

Eso reescribe la pregunta del Exp A2: de *"cómo se comporta en isla"* a **"qué configuración elige y
por qué"**.

---

## 1. Modelo (MILP estándar, sin invenciones)

```
P_rama ≤  M·s          y          −M·s ≤ P_rama            con s ∈ {0,1}
```
- `s = 1` (cerrado) → la rama conduce libremente (dentro de sus límites propios).
- `s = 0` (abierto) → la rama **no conduce**; `M` = cota holgada declarada por rama (no `1e6`
  arbitrario: se toma de los límites reales del equipo).
- **Conectividad real, no cosmética**: el solver recibe las ramas y su estado; la UI dibuja el estado.

---

## 2. Alcance (3 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **15.1** | **Contrato de conexiones** | enviar `connections[]` con `{from, to, kind, switch_state, switch_mode, M}` (hoy **solo se envían nodos**) |
| **15.2** | **Switch en el solver** | `switch_mode: "operador"` → `s` **fijo** desde la UI · `"solver"` → `s` **variable** con costo de maniobra declarable · `"ambos"` → fijo por horas de una tabla |
| **15.3** | **Vista y topología reportada** | icono de seccionador **abierto/cerrado** en el lienzo (F6.5) + el resultado reporta la **topología por hora** y las maniobras |

---

## 3. Contrato de datos

```json
"connections": [
  {"from": "grid_1",   "to": "bus_ac", "kind": "ac", "switch_state": "closed",
   "switch_mode": "operador", "M": 120.0},
  {"from": "grid_1",   "to": "bus_ac", "kind": "ac", "switch_state": null,
   "switch_mode": "solver",   "M": 120.0, "switch_cost_cop": 0.0}
]
```
| clave | semántica | default |
|---|---|---|
| `switch_mode` | quién decide el estado | **`"operador"`** (conservador: el solver no maniobra solo) |
| `switch_state` | estado fijado por el operador | `"closed"` |
| `M` | cota de la rama | de los límites del equipo; **obligatoria** en modo solver |
| `switch_cost_cop` | costo por maniobra | `0.0` declarado |

**Reglas**:
- En modo `"solver"`, `s` es **variable** y el resultado reporta **cuándo** maniobró y **cuánto costó**.
- Si la topología resultante deja una carga **sin fuente** → el modelo lo detecta (**ENS/infactible
  declarado**), no lo oculta.
- Un switch sin `M` en modo solver → **error atribuido** (no se adivina la cota).

---

## 4. Líneas a tocar (declaradas una a una)

| # | Archivo | Acción |
|---|---|---|
| 1 | `optimization/solver/topology_schema.json` | añadir `switch`/`connection` (params + `if_missing`) |
| 2 | `optimization/solver/model_builder.py` | aceptar `connections`; binarias `s`; `P ≤ M·s` por rama; costo de maniobra; topología en el resultado |
| 3 | `Backend/services/mpcScheduler.js` | reenviar `connections` (hoy solo pasan nodos y `sensor_mappings`) |
| 4 | `Frontend/.../diagram/DiagramOptimizationPanel.jsx` | construir `connections[]` desde los **edges** (hoy no se usan) |
| 5 | `Frontend/.../diagram/*` | tipo switch + estado visual abierto/cerrado + persistencia del estado (F6.5) |
| 6 | `optimization/experiments/expA2_stochastic.py` | `--topology-mode {impuesta|solver}` (aditivo; **no** romper los escenarios actuales) |
| 7 | `optimization/tests/test_switches.py` | **nuevo**: rama abierta no conduce; rama cerrada sí; modo solver maniobra y reporta; sin fuente → ENS declarado |

---

## 5. Criterios de cierre — verificables EJECUTANDO

- [ ] **C1 · El operador manda**: con la rama de red **abierta** por el operador, el `dispatch_plan` de
  esa rama es **0 en todas las horas** (verificado a mano) y el eco lo confirma.
- [ ] **C2 · El solver elige**: con `switch_mode: "solver"`, el resultado reporta la **topología por
  hora** y las maniobras con su costo; en un caso de red caro, el plan **abre** y en uno barato
  **cierra** (demostrar los dos sentidos).
- [ ] **C3 · Sin fuente → declarado**: forzar la apertura de todas las fuentes → el modelo devuelve
  **ENS > 0 declarado** (o infactible declarado), **nunca** un plan silencioso.
- [ ] **C4 · `M` obligatoria**: sin `M` en modo solver → **error atribuido** al switch (no adivina).
- [ ] **C5 · Visible**: el lienzo dibuja abierto/cerrado y coincide con la topología del eco.
- [ ] **C6 · Los escenarios actuales no cambian**: `--topology-mode impuesta` reproduce **exactamente**
  los resultados anteriores de `isla`/`grid10`/`grid30` (mismo sha256 de la tabla de costos).
- [ ] **C7 · Sin regresión** en la suite ni degradación de fluidez (criterio del cambio 12 · C8).

---

## 6. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Las binarias por rama y hora disparan el tiempo de solve | `M` ajustada (no `1e6`) + medir y reportar; si es necesario, `switch_mode: "operador"` por defecto |
| 2 | Maniobras excesivas (abrir/cerrar cada 15 min) | costo de maniobra declarable + reporte de nº de maniobras |
| 3 | La topología resultante invalide supuestos de la calibración | el eco reporta la topología; la validación la tiene en cuenta (bloque final) |
| 4 | Cambiar el contrato de entrada rompe el bucle | `connections` **opcional**: sin ella, comportamiento actual |

---

## 7. Fuera de alcance

| tema | dónde |
|---|---|
| Re-cierre automático, coordinación de protecciones, enclavamientos | fuera de la tesis (declarado) |
| Detalle de tensión del switchado | requiere AC-OPF (fase futura separada) |
| Flujo por potencia y vista dual en el lienzo | cambio **16** |

---

## 9. `reference/`

Sin artefactos de datos nuevos (spec de arquitectura). Ver `reference/README.md` para el manifiesto
(sha256) y los documentos que esta spec cita.

> **DECISIÓN DEL AUTOR (2026-10-11) — confirmada**: la microrred arranca con la topología **actual
> (AC, sin bus DC)** y **todo lo nuevo es opt-in**: con los defaults declarados aquí, **los resultados
> anteriores no cambian**. Confirmados: `bus_dc: false` · `switch_mode: "operador"` ·
> **frontera AC-OPF aceptada** (tensión/impedancia no se simulan) · vista dual `Esquema`/`Editor` ·
> `η` del inversor **declarable** (`null` si no se declara, sin inventar). **Nada queda bloqueado.**
