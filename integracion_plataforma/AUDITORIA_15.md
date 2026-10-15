# AUDITORÍA INDEPENDIENTE — CAMBIO 15 · SWITCHES DE CONECTIVIDAD

> Ejecutada por quien **especifica** el cambio sobre el commit **`f9b2a37`**. Fecha: 2026-10-12.
> Método: lectura del código, **ejecución propia de lo ejecutable aquí** y **lectura de la captura**
> versionada. Lo no medible en este entorno se declara (§6).

---

## 1. Veredicto

**El incremento funciona y el `VERIFICACION` es el más honesto del proyecto**: incluye un **bug propio
encontrado y corregido** (4 tests rotos por un parámetro posicional), un **falso negativo cazado**
(*"no maniobra" ≠ "no funciona"*) y una **medición de entorno inestable declarada** con su causa (crashes
de Chrome + disco al 94 %). El modelo usa **`M` de la rama** y **no introduce un solo `1e6`**. Quedan
**dos cosas que afectan a la trazabilidad** (§3.1 y §3.2) y **tres huecos de mi spec** que el
implementador resolvió con criterio (§4).

| Criterio | Declarado | Verificado aquí |
|---|---|---|
| C1 el operador manda | ✅ | ✅ **leído**: gate sobre `P_import/P_export`, cero filas de red |
| C2 el solver elige (2 sentidos) | ✅ | ✅ **leído**: `SW_S` binaria + `switching_cost_cop` + `maneuvers` |
| C3 sin fuente → ENS declarado | ✅ | ✅ **leído**: la válvula `ENS` ya existente, el gate la deja actuar |
| C4 `M` obligatoria en solver | ✅ | ✅ **leído**: sin `M` → eco `error` con motivo + rama **forzada abierta** (fail-safe) |
| C5 visible y coincidente | ✅ | ✅ **captura**: rama de red tenue/discontinua + `s=0` |
| C6 modo impuesto reproduce | ✅ *(con reserva)* | ⚠️ **golden en test**, pero la evidencia pre-cambio **no es un artefacto** → §3.1 |
| C7 sin regresión + fluidez | ✅ | ✅ **leído**: medianas 12.5 vs 12.25 (−2 %), muts constantes |
| Invariante de cobertura | — | ✅ **PASS 3/3** (corrido por mí) |
| **Manifiestos** | — | ✅ **PASS** — el test del 14 cazó que el PNG del 15 está bien declarado |

---

## 2. Lo que verifiqué EJECUTANDO

| Prueba | Resultado |
|---|---|
| Invariante de cobertura (mapper↔esquema) | ✅ **PASS 3/3** |
| `test_manifiestos_reference` (el del 14) | ✅ **PASS** — el PNG del 15 y su sha se recalcularon **en el mismo commit** (regla cumplida a la primera) |
| **¿Introdujo `1e6`?** | ✅ **0 ocurrencias** en las líneas añadidas por el 15 |
| Modelo en el solver | ✅ `comp[idx] <= M * model.SW_S[si,t,s]` (MILP estándar) · `M` por rama · `M < límite del equipo` → warning pero se aplica (cota **declarada**, no inventada) · `switch_cost_cop` inválido/negativo → 0 + warning |
| Esquema | ✅ `switch` y `connection` con `if_missing` literal: *"en modo solver: ERROR atribuido al switch, rama forzada ABIERTA (prohibido adivinar la cota)"* |
| Captura | ✅ la rama de red sale **tenue/discontinua** con el badge **`s=0`**; badge de kW en el resto |

---

## 3. Hallazgos

### 3.1 🟠 C6: el golden vive en un test, pero la evidencia **pre-cambio no es un artefacto**

El `VERIFICACION` cita dos hashes: `ca919694…` (golden, **sí** está en `test_switches.py` ✓) y
`a76c0828…` (*"capturado en BASE_JOB **antes** de tocar el solver"*). Verificado: **`a76c0828` solo
existe en el texto del `VERIFICACION`** — no está en ningún test, JSON ni artefacto del repo.

Dos consecuencias:
1. **Regla dura 2** (*"ninguna cifra a mano: toda cifra sale de un artefacto versionado"*): esa cifra
   **no es reproducible** ni auditable.
2. **La prueba de no-regresión queda floja**: el golden del test pudo capturarse **después** del
   cambio, en cuyo caso solo demuestra que no cambia *de ahí en adelante*. No hay forma de saberlo.

**Qué pedir**: versionar el plan pre-cambio como **artefacto** (`reference/resultados/golden_impuesto.json`
con plan + objetivo + sha + el commit donde se capturó) y que el test lo **cargue desde ahí**. Así el
C6 pasa de "confiar en el texto" a reproducible.
**Y registrar el pendiente real**: el ExpA2 en modo `impuesta` (el sha256 de la tabla de costos que
pedía el C6) **no se pudo correr** (sin Mongo) → va como **V-item** del bloque de validación.

### 3.2 🟠 `AGENTS.md` volvió a quedar desactualizado — y esto ya pasó en el 13

Verificado con `git log -- AGENTS.md`: su última actualización es `96bf5b0` (el cierre del **13**). No
se tocó en el **14** ni en el **15**, así que hoy:

| Dice | Realidad |
|---|---|
| *"**Nodes (9)** … + AcBus"* | el diagrama ya tiene **transformador** (14); y el seccionador no es un nodo (es atributo del edge, decisión del 15) |
| (nada sobre el **trafo**) | existe desde el 14: pérdidas + tope en la rama de red, con frontera declarada |
| (nada sobre **switches**) | existe desde el 15: `connections[]`, `switch_mode`, topología elegible |

Es **el mismo hallazgo del 13 otro vez**, y la causa es clara: **no hay nada que lo obligue**. Con los
manifiestos pasó lo mismo y se resolvió con un **test**; aquí la solución es la misma idea aplicada al
proceso: **`AGENTS.md` entra como criterio de cierre de cada incremento**. Ya lo he añadido como
criterio en la spec del cambio 16 (§7 de esa spec) para que no vuelva a depender de la memoria.

### 3.3 🟡 Pre-existentes anotados (no son del 15)

- `PW_DIESEL_BIGM = 1e6` (línea 15): big-M de la binaria del diésel. **No es incorrecto** (las cotas
  reales las pone `max_kw·U`), pero es más holgada de lo necesario y contradice el espíritu de *"M de
  los límites reales"*. Anotado, no urgente.
- `_ub_imp = max_import if max_import >= 0 else 1e6` (línea 859): es el **fix del ENS fantasma** ✅.
  Con `max_import = 0` (isla) da `0` ✅ correcto; solo cae a `1e6` si el tope llega **negativo** (red que
  solo exporta), caso extremo que no se da hoy. Anotado.
- `CURT.setub(1e6)`: correcto — el vertido es una **válvula**, no una decisión acotada.

### 3.4 🟡 Observaciones de la captura (para el 16, no defectos)

- **Los glifos del seccionador no se distinguen a simple vista** en la captura (el implementador los
  verificó en el DOM: 4 `use`). Lo que comunica el estado hoy es el **trazo tenue/discontinuo + el badge
  `s=0`** — suficiente, pero si el glifo está para verse, en el 16 conviene comprobar su **tamaño real**
  frente al zoom del lienzo.
- **La escena de prueba del 15 no incluye el trafo ni el inversor** (Red, PV, Diésel, BESS, Carga, bus).
  Es válido para ilustrar los switches, pero **no muestra el sistema completo** de los cambios 13–14;
  conviene que la captura del 16 sí los tenga todos.

---

## 4. Huecos de MI spec, resueltos con criterio (registrar como contrato)

El implementador **asumió y declaró** cuatro decisiones que la spec no fijaba. Las reviso y **son
correctas**; las registro aquí para que sean contrato y no elección libre:

| # | Hueco de la spec | Decisión del implementador | Veredicto |
|---|---|---|---|
| 1 | ¿El switch gatea por **dispositivo** o por **rama**? | **Por dispositivo `from`** (fallback `to` si es barra): red, diésel, batería gateables; pasivos con factor; extremos no gateables (load/bus/inverter/trafo/sensor) → warning + sin efecto | ✅ correcto y **declarado**; los no gateables se avisan en vez de ignorarse en silencio |
| 2 | ¿Seccionador como **nodo** o **atributo del edge**? | **Atributo del edge** (clic en la rama; símbolo sobre la rama) | ✅ sensato: el MILP solo necesita la rama y se evita re-cablear |
| 3 | `switch_mode: "ambos"` | **Fuera de alcance** (la spec §3 no define la tabla) → se avisa y se trata como operador | ✅ **era un hueco mío**: prometí el modo sin definir su semántica; declararlo es lo correcto |
| 4 | Switch en modo `solver` sobre un **pasivo** | Se **degrada a operador** + warning (evita la bilineal `factor·s`) | ✅ correcto: convertir un pasivo en conmutable sí sería bilineal; degradar y avisar es honesto |

**Acción**: copiarlas a la spec del 15 como **§8 Decisiones registradas** (igual que se hizo con la
rama del trafo en el 14).

---

## 5. Lo que este incremento hizo bien (para que se repita)

1. **Encontró y corrigió su propio bug**: 4 tests rotos porque `strategy_oracle` pasaba
   `topology_mode` posicional y `strategy_mpc_pi` se quedó sin el parámetro → **re-verificado 4/4**.
   Declararlo en el `VERIFICACION` en vez de dejarlo fuera del rango es lo correcto.
2. **Cazó un falso negativo del test**: con batería llena + solar la isla es casi gratis, así que el
   solver **racionalmente no maniobra** → *"declarado para no confundir 'no maniobra' con 'no
   funciona'"*, y el test fija un escenario donde el incentivo existe. Es la diferencia entre medir y
   entender.
3. **El fail-safe de `M` ausente**: rama **forzada abierta** + eco en `error` + warning. No adivina la
   cota y **no rompe el job**.
4. **`M` desde el equipo real, `1e6` prohibido** — cumplido (0 ocurrencias nuevas).
5. **Prioridad visual declarada**: `sin modelo` gana sobre `s=0` (mi propuesta, adoptada y documentada).
6. **La medición de fluidez con entorno inestable**: declara los crashes de Chrome y el disco al 94 %,
   y sostiene la conclusión donde es válida (comparación misma-sesión/escena, `muts` constante) en vez
   de inventar un número limpio.

---

## 6. NO verificado aquí (declarado, no asumido)

- `test_switches.py` y todo lo que importa `pyomo`: corre en la máquina del implementador.
- **ExpA2 en modo `impuesta`** (sha256 de la tabla de costos) y **ExpA2 en modo `solver`** end-to-end:
  sin Mongo en su entorno → equivalencia por construcción + golden unitario. **Pendiente → V-item.**
- La suite completa (134 passed + 9 failed, 4 corregidos y re-verificados por el implementador).
- El preflight visual del aviso "solver sin M" en el lienzo (solo panel + eco, declarado).

---

## 7. Fila de estado sugerida

| # | Estado |
|---|---|
| **15** | ✅ **Implementado y auditado** (`f9b2a37`): gate por dispositivo con `M` de la rama (**0 `1e6` nuevos**), fail-safe de `M` ausente, `sin modelo` > `s=0`, invariante **3/3** y **manifiestos PASS** (corridos por la auditoría) · 🟠 **C6 no cerrado**: la evidencia pre-cambio (`a76c0828`) **solo está en el texto** → versionarla como artefacto y añadir el ExpA2 impuesto a **V-items** · 🟠 **`AGENTS.md` desactualizado otra vez** (trafo + switches) → ahora es **criterio de cierre** en la spec del 16 · ✅ **4 huecos de la spec resueltos** por el implementador, registrados como contrato (§4) |
