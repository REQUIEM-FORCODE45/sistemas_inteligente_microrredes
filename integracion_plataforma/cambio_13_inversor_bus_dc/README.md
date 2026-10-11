# PLAN — CAMBIO 13 · INVERSOR MODELADO + BUS DC (F2) + propagación de incertidumbre (F5)
### el paso DC/AC que hoy no existe · η real · reutiliza la predicción del panel

> **Naturaleza**: especificación para el repositorio. Vive en `C:\Users\2D\tesis-microrred\docs\` y se
> copia como `integracion_plataforma/cambio_13_inversor_bus_dc/README.md`.
> **Estado**: propuesta · **Clasificación**: 🖥️ PRODUCCIÓN · **Depende de**: cambio 12 (F1).
> **Origen**: petición del autor: *"el inversor sí es importante porque puede que queramos hacer
> modelos más detallados… no puede dar ese paso más realista"*.

---

## 0. Objetivo

Hoy el inversor es **decorativo**: se dibuja, se configura y **el solver no lo conoce**. Este cambio le
da **modelo real** (conversión DC↔AC con eficiencia y límite) y, con él, la capacidad de representar
una microrred con **bus DC**.

**Principio de economía de modelos** (del autor): la conversión **no requiere predicción nueva** — el
inversor **consume** la predicción del panel (DC) y entrega AC. La incertidumbre se **propaga**.

---

## 1. Lo que YA existe (verificado)

| pieza | ruta | hoy |
|---|---|---|
| Nodo inversor dibujable | `deviceTypes.js` (`DEVICE_TYPE.INVERTER`, `maxCapacity`, `efficiency`) | ⚠️ `defaultParams` sin `solverCategory` → no entra |
| Ausencia en el solver | `grep inverter model_builder.py` → 0 | ⚠️ ignorado |
| Solar "AC con inversor" | `deviceTypes.js` (`solar_panel_ac`, `Eff. (con inv.)`) | ✅ pragmático: la eficiencia ya incluye el inversor |
| Banda calibrada del PV | cambio 06 (`predictions_pv_band`, P10/P50/P90) | ✅ insumo del inversor |
| Batería DC-capaz | `model_builder.py` (SOC, complementariedad, η_c/η_d) | ✅ base para el bus DC |

---

## 2. Alcance (3 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **13.1** | **Inversor con modelo** | `P_ac = η_inv·P_dc` con `P_ac ≤ P_ac_max`; **η declarable** (constante o curva η(P)); `null` si no se declara → comportamiento declarado + eco |
| **13.2** | **Bus DC** (variante declarada) | nodo **bus DC**: paneles DC y batería DC conectan ahí; el inversor es la **puerta** al AC. Con `bus_dc: false` (default) el inversor es una **etapa en serie** sobre el sistema AC actual |
| **13.3** | **Propagación de incertidumbre (F5)** | la banda viaja por la cadena: `P_ac,Pxx = η·P_dc,Pxx`; se conserva `P10 ≤ P50 ≤ P90` y el ancho se estrecha coherentemente |

---

## 3. Contrato de datos

| clave (nodo inversor) | unidad | semántica | default |
|---|---|---|---|
| `maxCapacity` | W | `P_ac_max` | del nodo (ya existe) |
| `efficiency` | 0-1 | `η_inv` constante | **`null` declarado** → aviso + `η=1` **no** se asume en silencio |
| `etaCurve` | lista `[P%, η]` | curva del fabricante (opcional) | `null` |
| `bidirectional` | bool | permite flujo AC→DC (batería cargando desde red) | `false` |
| `bus_dc` | bool | el inversor es puerta de un bus DC | **`false`** (comportamiento actual) |

**Reglas**:
- Con `η = null` → el modelo **no convierte** (`P_ac = P_dc`), lo **reporta** en el eco
  (`eta_origen: "no declarada"`) y lo marca en el pre-flight. **Nunca inventar eficiencia.**
- Con `bus_dc: true`, `solar_panel` y `battery` pasan a ser **DC** y deben declararlo; un panel AC en
  un bus DC → **error atribuido** (no se adivina la topología).

---

## 4. Líneas a tocar (declaradas una a una)

| # | Archivo | Acción |
|---|---|---|
| 1 | `optimization/solver/topology_schema.json` | añadir `inverter` (params + `if_missing`) |
| 2 | `optimization/solver/model_builder.py` | dispositivo `inverter`: variables DC/AC, `P_ac = f(P_dc)`, límite, exclusividad si es bidireccional; si `bus_dc` → balance **DC** + balance **AC** acoplados por el inversor |
| 3 | `optimization/solver/model_builder.py` | en el balance, la rama del inversor sustituye el paso directo PV→AC cuando está presente |
| 4 | `optimization/solver/model_builder.py` | propagar cuantiles en la conversión y reportarlos por escenario |
| 5 | `Frontend/.../deviceTypes.js` | `solverCategory/solverType` del inversor + `PARAMS_SOLO_UI` ajustado |
| 6 | `Frontend/.../DiagramOptimizationPanel.jsx` | mapper `inverter` (hoy ausente) + `bus_dc` |
| 7 | `Frontend/.../nodes/*` | símbolo SVG del inversor + nodo **bus DC** (F6.3) |
| 8 | `optimization/experiments/config.py` | microred de los experimentos con inversor declarado (para que las validaciones lo incluyan) |
| 9 | `optimization/tests/test_inverter.py` | **nuevo**: conversión, límite, bidireccionalidad, η nula, bus DC |

---

## 5. Criterios de cierre — verificables EJECUTANDO

- [ ] **C1 · Conversión verificable**: job con inversor y `η=0.97` → en el `dispatch_plan`,
  `P_ac = 0.97·P_dc` (±1e-6) para cada hora y escenario; reportar la comprobación a mano.
- [ ] **C2 · Límite respetado**: con `P_dc` tal que `η·P_dc > P_ac_max`, el plan **limita** a
  `P_ac_max` y el excedente aparece como no aprovechado (curtailment) — no desaparece.
- [ ] **C3 · η sin declarar**: sin `η` → el plan no convierte, el **eco** dice
  `eta_origen: "no declarada"` y el pre-flight marca el nodo. **Cero invención.**
- [ ] **C4 · Bus DC**: con `bus_dc: true`, el balance **DC** y el **AC** cuadran por separado y el
  inversor es el único acople; con un panel AC en bus DC → **error atribuido** al nodo.
- [ ] **C5 · Propagación (F5)**: la banda AC mantiene `P10 ≤ P50 ≤ P90`, y su ancho es
  `η·(ancho DC)` (±1e-6). Reportar un caso con números.
- [ ] **C6 · Eco completo**: el inversor aparece en `device_echo` como `modelado` con sus params
  efectivos (η y su origen, límite, `bus_dc`).
- [ ] **C7 · Sin regresión**: suite completa igual que antes (salvo los 2 fallos preexistentes
  documentados); tiempos del Exp B reportados (el inversor añade variables e binarias: **medir**).
- [ ] **C8 · Fluidez**: símbolo nuevo sin degradar FPS (criterio del cambio 12 · C8).

---

## 6. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El inversor añade binarias (bidireccional) → solve más lento | activar la exclusividad **solo** si `bidirectional: true`; reportar tiempos |
| 2 | `bus_dc` duplica los balances y puede quedar inconsistente | C4 lo verifica por separado (DC y AC) |
| 3 | Declarar todo DC cuando el sitio es AC (o al revés) cambia los resultados | `bus_dc: false` por defecto = comportamiento actual; el cambio es **opt-in** |
| 4 | η inventada | prohibido por contrato (§3): `null` + eco |

---

## 7. Fuera de alcance

| tema | dónde |
|---|---|
| MPPT, seguimiento de curva I-V, armónicos | no es despacho económico (fase futura, declarada) |
| Transformador | cambio **14** |
| Switches de conectividad | cambio **15** |

---

## 9. `reference/`

Sin artefactos de datos nuevos (spec de arquitectura). Ver `reference/README.md` para el manifiesto
(sha256) y los documentos que esta spec cita.
