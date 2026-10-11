# PLAN — CAMBIO 14 · TRANSFORMADOR (F3)
### pérdidas + límite de capacidad · y la FRONTERA declarada (no es AC-OPF)

> **Naturaleza**: especificación para el repositorio. Vive en `C:\Users\2D\tesis-microrred\docs\` y se
> copia como `integracion_plataforma/cambio_14_transformador/README.md`.
> **Estado**: propuesta · **Clasificación**: 🖥️ PRODUCCIÓN · **Depende de**: cambios 12 y 13.
> **Origen**: petición del autor: *"deberíamos agregar transformadores… esto no es nada si no tenemos
> transformadores"*.

---

## 0. Objetivo y **declaración de frontera**

Añadir el transformador al modelo **en lo que el solver puede simular de verdad**: **pérdidas** y
**límite de capacidad**. Y **declarar explícitamente lo que NO puede**: el solver es un **despacho
económico (MILP de potencia activa)**, **no** un flujo de potencia AC. Por tanto:

| se modela aquí | **NO** se modela aquí (fase futura separada) |
|---|---|
| pérdidas `P_out = P_in·(1−p)` (o η_trafo) | impedancias, caída de tensión, regulación de tomas |
| límite `P_in ≤ S_max·pf` (kVA × factor de potencia) | flujo de carga / AC-OPF, ángulos y tensiones nodales |
| ratio de transformación como **etiqueta informativa** | cambiar de nivel de tensión con efectos eléctricos |

**Por qué se declara**: si el trafo apareciera "completo" sin poder simular tensiones, el usuario
**adivinaría** — exactamente lo que el autor pidió evitar.

---

## 1. Lo que YA existe

| pieza | ruta | nota |
|---|---|---|
| Cargo fijo/variable de red y ToU | `model_builder.py` (grid) | ✅ patrón para un elemento "de paso" con coste/límite |
| Curtailment como variable | `model_builder.py` (`CURT`) | ✅ destino natural de la potencia perdida |
| Precedente de frontera declarada | `PLAN_AMPLIACION_MODELO_ELECTRICO.md` §F3 | ✅ ya acordada con el autor |

---

## 2. Alcance (2 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **14.1** | **Modelo del trafo** | `P_out = P_in·(1−pérdidas)`; límite `P_in ≤ S_max·pf`; pérdidas declarables (constante o `η`); `null` si no se declara → **aviso + eco**, sin inventar |
| **14.2** | **Símbolo + rótulo de frontera** | símbolo SVG del trafo (dos círculos) + rótulo informativo del nivel (`220/13.2 kV`) y, en el panel, la **nota de alcance** ("modelo de despacho: pérdidas y capacidad; tensión/impedancia no incluidos") |

---

## 3. Contrato de datos

| clave (nodo trafo) | unidad | semántica | default |
|---|---|---|---|
| `capacityKva` | kVA | `S_max` | obligatorio |
| `powerFactor` | 0-1 | `pf` para el límite activo | **`null`** → si falta, el límite **no** se aplica y el eco lo dice |
| `lossesPct` | % | pérdidas a plena carga | **`null`** → sin pérdidas aplicadas + aviso |
| `efficiency` | 0-1 | alternativa a `lossesPct` | `null` |
| `ratioLabel` | texto | rótulo informativo (no se simula) | vacío |

**Reglas**: `P_in ≤ S_max·pf` solo si `powerFactor` está declarado; `P_out = P_in·(1−lossesPct/100)`
solo si hay pérdidas declaradas. **Ambas ausencias se reportan** (`energia_no_contabilizada`),
nunca se asumen.

---

## 4. Líneas a tocar (declaradas una a una)

| # | Archivo | Acción |
|---|---|---|
| 1 | `optimization/solver/topology_schema.json` | añadir `transformer` |
| 2 | `optimization/solver/model_builder.py` | rama del trafo: `P_out = P_in·(1−p)` + límite `S_max·pf`; pérdidas al `CURT`/pérdidas declaradas (no desaparecen) |
| 3 | `optimization/solver/model_builder.py` | `device_echo` del trafo con params efectivos y **alcance declarado** |
| 4 | `Frontend/.../deviceTypes.js` | tipo `transformer` + `solverCategory` + `defaultParams` (unidades explícitas) |
| 5 | `Frontend/.../DiagramOptimizationPanel.jsx` | mapper `transformer` |
| 6 | `Frontend/.../nodes/*` | símbolo SVG del trafo + rótulo de nivel (F6.4) |
| 7 | `Frontend/.../DeviceConfigPanel.jsx` | nota de alcance visible en el panel del trafo |
| 8 | `optimization/tests/test_transformer.py` | **nuevo**: pérdidas, límite, ausencias declaradas |

---

## 5. Criterios de cierre — verificables EJECUTANDO

- [ ] **C1 · Pérdidas verificables**: trafo con `lossesPct=2` → `P_out = 0.98·P_in` (±1e-6) por hora y
  escenario, comprobado a mano; la diferencia **no desaparece** (aparece como pérdida declarada).
- [ ] **C2 · Límite respetado**: con `capacityKva=100`, `pf=0.9` → `P_in ≤ 90 kW`; forzar más demanda y
  ver que el modelo **limita** y lo reporta (no lo ignora).
- [ ] **C3 · Ausencias declaradas**: sin `powerFactor` → límite **no** aplicado + eco
  (`motivo: "powerFactor no declarado"`); sin pérdidas → sin pérdidas + eco. **Cero suposiciones.**
- [ ] **C4 · Frontera visible**: el panel del trafo y el eco declaran que **tensión/impedancia no se
  simulan**; el plan no promete nada que no calcule.
- [ ] **C5 · Balance íntegro**: con trafo en la cadena, el balance sigue cuadrando y el trafo aparece
  en `device_echo` como `modelado`.
- [ ] **C6 · Sin regresión** en la suite y en los tiempos (reportar Exp B).

---

## 6. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El usuario asuma que hay tensión/impedancia | **nota de alcance** en panel + eco (C4) |
| 2 | Pérdidas mal declaradas inflan el costo | el valor es **dato del equipo**; si falta → sin pérdidas + aviso |
| 3 | Añadir el trafo cambia los planes anteriores | `opt-in`: sin nodo trafo, el comportamiento es el actual |

---

## 7. Fuera de alcance

| tema | dónde |
|---|---|
| AC-OPF / flujo de carga / regulación de tensión | **fase futura separada** (otro solver) |
| Switches de conectividad | cambio **15** |
| Coordinación de protecciones | fuera de la tesis (declarado) |

---

## 9. `reference/`

Sin artefactos de datos nuevos (spec de arquitectura). Ver `reference/README.md` para el manifiesto
(sha256) y los documentos que esta spec cita.

> **DECISIÓN DEL AUTOR (2026-10-11) — confirmada**: la microrred arranca con la topología **actual
> (AC, sin bus DC)** y **todo lo nuevo es opt-in**: con los defaults declarados aquí, **los resultados
> anteriores no cambian**. Confirmados: `bus_dc: false` · `switch_mode: "operador"` ·
> **frontera AC-OPF aceptada** (tensión/impedancia no se simulan) · vista dual `Esquema`/`Editor` ·
> `η` del inversor **declarable** (`null` si no se declara, sin inventar). **Nada queda bloqueado.**
