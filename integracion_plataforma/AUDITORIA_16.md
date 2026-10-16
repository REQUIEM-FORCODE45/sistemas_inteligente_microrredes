# AUDITORÍA INDEPENDIENTE — CAMBIO 16 · UNIFILAR VIVO

> Ejecutada por quien **especifica** el cambio sobre el commit **`179eb99`**. Fecha: 2026-10-12.
> Método: lectura del código, **ejecución propia de lo ejecutable aquí** y **lectura de la captura**
> versionada. Lo no medible en este entorno o en el del implementador se declara (§5).

---

## 1. Veredicto

**El cambio está implementado y su parte medida es correcta** — el C8 (el badge refleja su rama)
**funciona** y se ve en la captura: `Red→Trafo +10.0` / `Trafo→BUS +9.8`. El C0 (línea base) es un
artefacto ejemplar y el C9 (`AGENTS.md`) quedó impecable. **Pero el cambio NO puede cerrarse todavía**:
su criterio obligatorio de fluidez (**C1/C2**) no llegó a medirse porque el entorno del implementador
se cayó a mitad de sesión. Y ese hueco **se cobró dos errores más** (§3.2 y §3.3), los dos en lo
*"trazado a mano"*: es exactamente lo que pasa cuando se sustituye la medición por el razonamiento.

| Criterio | Declarado | Verificado aquí |
|---|---|---|
| C0 línea base ANTES | ✅ | ✅ **artefacto** con pares crudos, muts y umbral derivado |
| **C1/C2 fluidez post-cambio** | ⚠️ **NO medido** | 🔴 **cambio no cerrable** hasta re-medir → §3.1 |
| C3 flujo coherente | ✅ *(H1 medido, H2/H3 a mano)* | ⚠️ **H2/H3 físicamente imposibles** → §3.2 |
| C4 badges | ✅ | ✅ una sola fuente (`dispatch_plan`), `ens`/`curt` excluidos |
| C5 vista dual | ✅ (DOM) | ✅ **leído**: drag no mueve el nodo, paleta fuera, handles ocultos, label en ambas vistas |
| C6 accesibilidad | ✅ | ✅ estado no solo por color + leyenda de escala |
| C7 sin regresión | ✅ | ✅ sin cambios `.py` en el diff |
| **C8 el badge refleja su rama** | ✅ | ✅ **código correcto y captura**: `+10.0 → +9.8` · ⚠️ **no cubre la carga** → §3.3 |
| C9 `AGENTS.md` al día | ✅ | ✅ **impecable**: Nodes (10) + seccionador como atributo del edge + 4 secciones con enlace a cada VERIFICACION |
| Invariante + manifiestos | — | ✅ **PASS** (mapper 3/3 y manifiestos, corridos por mí) |

---

## 2. Lo que verifiqué EJECUTANDO

| Prueba | Resultado |
|---|---|
| `test_manifiestos_reference` + `test_mapper_coverage` (3) | ✅ **PASS 4/4** |
| `fps_baseline_c0.json` | ✅ commit, escena, mediana **16.6**, **4 pares crudos**, muts, `redux 1` (y **0 durante el arrastre**), umbral `= 15.8` |
| `ramaFlow` en el código | ✅ **el C8 bien implementado**: `transformer` → `paso − pérdida`; `inverter` → `inverter − inverter_rev`; `battery` → descarga − carga; `grid` → import − export (con el detalle del `device_id === 'grid'` documentado) |
| Captura (H1) | ✅ `+10.0 / +9.8 / +10.0 / +9.7 / +4.0`, pestañas **Esquema\|Editor**, selector **H 1**, **leyenda 2/4/10 kW**, grosores distintos |
| `AGENTS.md` (C9) | ✅ Nodes **(10)** con `Transformer`, seccionador **no** es nodo, y las secciones de inversor (13), trafo (14), switches (15) y unifilar vivo (16) con enlace a cada `VERIFICACION` |

---

## 3. Hallazgos

### 3.1 🔴 C1/C2 NO medidos: el cambio **no puede cerrarse** (el criterio era medido, no argumentado)

El `VERIFICACION` lo declara con una honestidad ejemplar: *"El entorno dejó de ejecutar
headless-Chrome a mitad de sesión… la comparación de medianas queda pendiente de re-ejecutar… no se
afirma número post-cambio"*, y aporta el diagnóstico (descartó IPv6, proxy, shm, zombies y GPU uno por
uno; disco al 91–98 %).

**Pero** el criterio C1/C2 de la spec es **"medido"**, y el argumento que lo sustituye (*"cero costo por
frame añadido, regla por regla"*) es **correcto en el razonamiento y no es la prueba**. Si aceptáramos
el argumento, estaríamos incumpliendo la regla que este proyecto aplica desde el cambio 12: **el C8 de
la fluidez no se cerró con un razonamiento, se cerró con 6 mediciones**.

**Condición de cierre**: re-ejecutar **C1/C2 con el mismo harness** (pares intercalados, misma sesión,
orden aleatorio, medianas, pares crudos) cuando el entorno lo permita. El `fpsMeter.js` nuevo y el
método del C0 ya están versionados, así que es repetible.
**El cambio 16 queda: implementado + auditado, cierre pendiente de C1/C2.** No es un defecto: es un
criterio no satisfecho, y se declara como tal.

### 3.2 🟠 La tabla C3 de H2/H3 es **físicamente imposible** — trazado a mano, no medido

La tabla del `VERIFICACION` da para el trafo (pérdidas 2 %):

| | entrada (red→trafo) | salida (trafo→bus) que declara | salida que **debería** dar |
|---|---|---|---|
| H1 | 10.0 | **9.8** | 9.80 ✅ |
| H2 | 9.8 | **9.8** | 9.60 ❌ |
| H3 | 9.6 | **9.8** | 9.41 ❌ |

**En H3 la salida declarada (9.8) es MAYOR que la entrada (9.6)** — imposible con pérdidas positivas.
Y el propio `VERIFICACION` advierte que *"H2/H3 en texto: derivados a mano del código + plan"*: el
error está en **el trazado**, no en `ramaFlow` (que hace `paso − pérdida` correctamente). H1 —el único
**medido** (captura)— es el único correcto.

### 3.3 🟠 El badge **no cubre la rama que alimenta la carga** — y la tabla dice que sí

En la captura, `BUS AC → Carga` **no lleva badge**, pero la tabla C3 declara `bus→carga +21.0`. Causa
raíz, leída en el código: **`ramaFlow` se calcula con el extremo de ORIGEN de la rama**; en
`bus→carga` el origen es el **bus**, que **no tiene filas** en el `dispatch_plan` → `kw = 0` → sin
badge. (`ramaFlow` **sí** tiene un `case 'load'` correcto, y el solver **sí** emite filas `load`: el
problema no es el tipo, es **de qué extremo se toma el dato**.)

**Por qué importa**: el consumo es **el dato que el operador más mira**, y es la única rama principal
del diagrama sin cifra. Es una **laguna del criterio C8**, que pedía que el badge refleje *"el valor que
circula por ESA rama"* — no "el valor del origen de esa rama".
**Fix**: si el extremo de origen no tiene filas, tomar el **destino** (la carga sí las tiene). Es un
cambio pequeño y localizado.

### 3.4 🟡 Lección transversal (la que explica §3.2 y §3.3)

Los dos errores están **en lo trazado a mano**, y ninguno en el código. Cuando no se puede medir, la
regla de este proyecto es **declarar el hueco — no rellenarlo con razonamiento**: es el mismo principio
que *"ninguna cifra a mano"*. A partir de aquí: **lo que no se mida, no se tabula**; si hace falta el
dato para el capítulo, se marca explícitamente como *no verificado*.

---

## 4. Lo que este incremento hizo bien (para que se repita)

1. **El C0, como artefacto**: commit, escena, método, **4 pares crudos**, `muts`, `redux`, **umbral
   derivado** (`16.6 × 0.95 = 15.8`) y la nota de que durante el arrastre hay **0 escrituras** a Redux.
   Es la línea base que se le pedía desde el 12 y que nadie había versionado así.
2. **El C8 en el código, bien resuelto**: `transformer` → `paso − pérdida` (10.0 → 9.8), `inverter` →
   `inverter − inverter_rev`, y el detalle del `grid` con su `device_id === 'grid'` **documentado**
   (el eco usa el id del nodo, el plan emite `grid` — una trampa que él resolvió y explicó).
3. **El C9 impecable**: no se limitó a la lista de nodos — añadió las cuatro secciones (inversor,
   trafo, switches, unifilar vivo) **con enlace a su VERIFICACION** en cada una. Eso convierte
   `AGENTS.md` en una puerta de entrada real para quien llegue al repo.
4. **La vista dual verificada por DOM** y no por inspección visual: drag en Esquema **no mueve el
   nodo** (posición Redux idéntica), paleta ausente, handles ocultos, editar en Editor **visible en
   ambas**, y un diagrama viejo abre con **posiciones intactas** (111,222).
5. **El toggle de animación** por clase imperativa + `localStorage` (cero renders) — la lección del
   `.rf-dragging` del 12.4, aplicada otra vez.
6. **La honestidad del bloque "No medido"**: 4 puntos declarados y una nota de entorno con el
   diagnóstico completo, *"sin disfraz"*.

---

## 4.bis CIERRE (`f84b878`) — los puntos 2 y 3 resueltos; el 1 sigue abierto

### La tabla C3 (§3.2): **resuelta y bien**

Pasó de *"trazo a mano"* a **MEDIDA por DOM en H1/H2/H3**. El trafo ahora da
`9.8 / 9.6 / 9.4` — **siempre salida < entrada** (10.0→9.8, 9.8→9.6, 9.6→9.4, exactamente ×0.98). El error
físicamente imposible desapareció, y el `VERIFICACION` deja constancia del borrador incorrecto y de la
regla adoptada (*"lo que no se mida, no se tabula"*).

### El badge de la carga (§3.3): **resuelto en el código**

`ramaFlow` se dividió en `rowsFor(...)` + la elección de cola, y ahora la **cola es el extremo que
tiene filas** (origen primero, **destino solo si es sumidero**). Verificado leyendo el código y el
solver: el `dispatch_plan` emite la carga con **su `device_id` real** (`l_id` ∈ `load_ids`) y
`device_type: "load"`, así que el fallback la encuentra.

**Y encontró por su cuenta un bug que introdujo el propio fix**: el primer badge midió un `−9.7`
**fantasma** en `batt→inv` a H3 (*"heredaba el flujo de otra rama"*) → restringió el fallback a
sumideros (`load`) y **lo declaró como límite conocido**. Eso es exactamente lo que quiero: el fix no
solo arregla, **no rompe en silencio**.

### Dos observaciones menores (ninguna bloquea)

1. **La captura no cubre el caso corregido.** Verifiqué con **dos zooms por región** (método que ya me
   evitó un falso positivo en el 12.4): en `BUS AC→Carga` **no hay pill**. Pero **no es un defecto**: en
   esa escena el consumo es **0 kW** y el solver **no emite fila `load` si `ld ≤ 0.001`** → sin fila,
   sin badge, correcto. El `+21.0` de la tabla sale del DOM del **harness** (plan determinista), que es
   otra escena. **Petición**: versionar también la captura del harness con carga, para que la evidencia
   visual cubra el caso que se acaba de corregir (hoy solo lo cubre la medición DOM).
2. `SINK_TYPES = useMemo(() => new Set(['load']), [])` dentro del componente: es una constante, y
   `AUX_TYPES` ya vive a nivel de módulo. Sacarla al módulo quita un hook por rama y respeta la regla 2
   del plan (*constantes de módulo*). Cosmético.

### Lo que sigue abierto: **C1/C2 (§3.1)**

Sigue **sin medir** y el commit no lo toca: el cambio **no puede cerrarse** hasta re-ejecutar la
fluidez. Es el único pendiente real.

## 5. NO verificado aquí (declarado, no asumido)

- **C1/C2** (fluidez post-cambio): no medidos por el implementador (entorno caído) → **condición de
  cierre abierta** (§3.1).
- Texto de los badges de H2/H3 por DOM (trazado a mano, y con error demostrado en §3.2) — **y el de la
  carga, que falta** (§3.3).
- Apertura del modal por DOM y el roundtrip guardar/recargar contra backend (offline).
- Contraste instrumental del C6.
- La suite Python no cambió (el diff es frontend + docs + artefactos) → resultado heredado del 15.

---

## 6. Fila de estado sugerida

| # | Estado |
|---|---|
| **16** | ✅ **Implementado y auditado** (`179eb99`) · **C8 funciona** (`+10.0 → +9.8` en captura; `ramaFlow` por tipo, `ens`/`curt` fuera), **C9 impecable** (`AGENTS.md`: Nodes 10 + 4 secciones con enlace), **C0 en artefacto** (4 pares crudos, umbral 15.8), C5 por DOM, invariante+manifiestos **PASS** · 🔴 **CIERRE PENDIENTE de C1/C2** (fluidez no medida: entorno caído) · 🟠 la tabla C3 de **H2/H3 es imposible** (salida 9.8 > entrada 9.6: trazado a mano) · 🟠 **la rama `bus→carga` no lleva badge** (se toma el extremo origen y el bus no tiene filas) · 🟡 **lo que no se mida no se tabula** |
