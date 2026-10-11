# PLAN — AMPLIACIÓN DEL MODELO ELÉCTRICO + REDISEÑO VISUAL DEL DIAGRAMA
### cadena de confianza · inversor/bus DC · transformador · switches · unifilar moderno SIN perder fluidez

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Fuente: `C:\Users\2D\tesis-microrred\docs\`.
> **Estado**: propuesta. Fecha: 2026-10-11.
> **Origen**: petición del autor tras la auditoría de los cambios 06–11.

---

## 0. Principio rector

> **Lo que se puede dibujar se puede simular — o el sistema dice por qué no.**

Hoy ese principio **no se cumple**: el inversor se dibuja y se configura, y el solver **lo ignora en
silencio**; varios campos del panel **no tienen camino** al job (el mapper los descarta o los fija a
mano). El usuario acaba adivinando. Todo el plan se ordena para cerrar eso **antes** de añadir
capacidad nueva.

---

# F1 · CADENA DE CONFIANZA (va primero, sin features nuevas)

## F1.1 El eslabón frágil (verificado)

```
panel → node.data.params (Redux) → diagramToOptimization(nodes) → TOPOLOGY_MAPPERS[tipo](params) → job → solver
```

`DiagramOptimizationPanel.jsx:18-76` (mappers): traducen `camelCase → snake_case` y **aplican
defaults con `||` / `?:`**. Dos fugas reales:
1. Un param **no contemplado** en el mapper → **se pierde sin aviso**.
2. Valores **fijados a mano** en el mapper (p. ej. batería: `soc_min: 0.2, soc_max: 0.95,
   charge_efficiency: 0.95`) → aunque la UI los exponga, **serían ignorados**.

## F1.2 Los 4 mecanismos

| # | Mecanismo | Qué hace |
|---|---|---|
| **1** | **Esquema de topología declarado** (`topology_schema.json`): por tipo, qué params acepta el solver, cuáles son obligatorios y qué pasa si faltan | una sola fuente; la usan frontend (validar) y solver (validar) |
| **2** | **Pre-flight en el lienzo** (antes de enviar): marca cada nodo que el solver **no podrá** simular, con el motivo en el propio nodo | el operador ve el problema **antes** de lanzar |
| **3** | **Error atribuido**: si el solver recibe algo sin modelo → error con `device_id` + `reason`, y la UI **señala el nodo** | nunca un error genérico |
| **4** | **`device_echo` en el resultado**: por **cada** dispositivo del diagrama → modelo aplicado, parámetros **efectivos** y estado (`modelado` \| `ignorado` \| `error` + motivo) | el operador ve qué hizo el solver con **su** diagrama |

## F1.3 El invariante que da la garantía (test)

`optimization/tests/test_mapper_coverage.py`:
> Para **cada** clave de `defaultParams` de **cada** tipo de `DEVICE_DEFINITIONS`, el mapper debe
> propagarla al job **o** estar listada en `PARAMS_SOLO_UI` con su motivo. **Si no, el test falla.**

Así, un campo nuevo en la UI **no puede** quedarse a medio camino sin que la suite lo diga.
Análogo para el lado Python: `test_topology_schema.py` verifica que el solver reconoce **cada** tipo
del esquema.

## F1.4 Round-trip del `100` (criterio de cierre de F1)

1. Abrir el diagrama guardado → el panel del diésel muestra **`a1=0.24`, `a0=1.8`, precio vacío** y el
   texto *"efectivo: 2,782 COP/L — sitio Pasto, vigencia 2026-10"* (arreglo del desajuste UI↔motor).
2. Editar el precio a `3000` → lanzar → **el job lo lleva** (payload) y **el eco** dice
   `origen: "nodo", valor: 3000`.
3. Borrar el valor → lanzar → **el eco** dice `origen: "sitio", valor: 2782`.
4. Un diagrama con el inversor (sin modelo todavía) → **pre-flight lo marca** y el eco dice
   `ignorado: "tipo sin modelo en el solver"` — **en lugar de ignorarlo callando**.

---

# F2 · INVERSOR MODELADO + BUS DC

## F2.1 Modelo

```
P_ac = η_inv · P_dc          (límite: P_ac ≤ P_ac_max)
```
- **η declarable** (constante o curva η(P), si el fabricante la da) → **dato del equipo, `null` si no
  se declara** (nunca un valor inventado).
- **Bidireccional** si la batería y los paneles son DC: `P_dc = η_inv · P_ac` en el otro sentido, con
  **exclusividad** (binaria, igual que la batería).
- **Bus DC** (nuevo): los paneles DC y la batería DC se conectan al bus; el inversor es la **puerta**
  al AC. Sin bus DC, el inversor es solo una etapa en serie.

## F2.2 Predicción: reutiliza la del panel (sin modelo nuevo)

La predicción PV (banda P10/P50/P90) entra **en DC**; el inversor la convierte:
`P_ac(t) = η · P_dc(t)` para cada cuantil → **la incertidumbre se propaga, no se re-modela** ✓

## F2.3 Criterio de cierre
- Un job con inversor: `P_ac = η·P_dc` verificable a mano en el `dispatch_plan`.
- El balance cuadra con el inversor **dentro** de la cadena (no como un nodo decorativo).
- Con `η` sin declarar: el eco lo dice y el modelo aplica el comportamiento declarado (sin inventar).

---

# F3 · TRANSFORMADOR

## F3.1 Modelo — y la FRONTERA declarada

El solver es un **despacho económico (MILP de potencia activa)**, **no** un flujo de potencia AC.
Por tanto, aquí el transformador entra como:

```
P_out = P_in · (1 − pérdidas)          pérdidas declaradas (o η_trafo)
P_in  ≤ S_max · pf                     límite de capacidad (kVA × factor de potencia)
```

**Fuera de alcance de esta fase (declarado, no prometido)**: impedancias, caída de tensión,
regulación de tomas y cualquier cosa que requiera **flujo de carga / AC-OPF**. Eso es **otro modelo**
(F3-bis, fase separada) y no se puede simular con el solver actual. **Decirlo es parte del requisito**
de "no hacer adivinar al usuario".

## F3.2 Predicción
Igual que F2: el trafo **consume** la potencia de su rama y aplica pérdidas. **Sin modelo nuevo.**

## F3.3 Criterio de cierre
- `P_out < P_in` por las pérdidas declaradas, verificable a mano.
- Si `P_in` supera `S_max·pf` → el modelo lo **limita** y el eco lo reporta.
- La spec declara explícitamente que **no** hay tensión/impedancia en esta fase.

---

# F4 · SWITCHES DE CONECTIVIDAD (el salto de mayor valor)

## F4.1 Modelo

```
P_rama ≤ M · s          y        −M · s ≤ P_rama        con s ∈ {0,1}
```
- `s = 0` (abierto) → **la rama no conduce**; `s = 1` (cerrado) → libre.
- **Dos modos, ambos solicitados**:
  - **Operador**: fija los switches en el diagrama y **ve** la configuración resultante.
  - **Solver**: `s` como **variable de decisión** (con costo de maniobra declarable) → el MPC
    **elige** la configuración (isla / grid-tied / parcial).

## F4.2 Consecuencia de contrato (importante)
Hoy `diagramToOptimization(nodes)` envía **solo nodos**. La conectividad exige enviar **también las
conexiones (edges)** con su estado de switch. Es un **cambio de contrato** declarado: `connections[]`
con `{from, to, type, switch_state, switch_mode}`.

## F4.3 Valor para la tesis (por qué es el salto)
Hoy los escenarios **isla / grid10 / grid30** se **imponen** en los experimentos. Con switches, el MPC
**elige** la configuración: el Exp A2 deja de ser "cómo se comporta en isla" y pasa a ser **"qué
configuración elige y por qué"**.

## F4.4 Criterio de cierre
- Con un switch **abierto por el operador**, el plan **no** usa esa rama (verificable en el
  `dispatch_plan` y en el eco).
- Con `switch_mode: "solver"`, el resultado reporta la **topología elegida** por hora.
- La UI **dibuja** el estado del switch (abierto/cerrado) y el eco lo confirma.

---

# F5 · PROPAGACIÓN DE INCERTIDUMBRE POR LA CADENA

- La banda `P10/P50/P90` viaja por las etapas deterministas (`η_inv`, pérdidas del trafo) **sin
  modelos nuevos**: `P_ac,P10 = η·P_dc,P10`, etc.
- **Criterio**: la banda de salida del inversor/trafo mantiene el orden (`P10 ≤ P50 ≤ P90`) y su ancho
  se estrecha coherentemente con `η`; verificable sobre un caso con números a mano.
- **Excepción declarada**: si un elemento tiene estocasticidad propia (fallo, derating propio), su
  modelo de incertidumbre **se declara aparte**; no se hereda.

---

# F6 · REDISEÑO VISUAL — UNIFILAR MODERNO **SIN PERDER FLUIDEZ**

## F6.1 Qué cambia (estética se queda, topología cambia)

| Elemento nuevo | Qué aporta |
|---|---|
| **Barra AC** (línea gruesa, `AC 220 V · 60 Hz`) y **barra DC** (F2) | el "bus" del unifilar |
| **Derivaciones ortogonales** (`smoothstep`, no bezier) | lectura de esquema eléctrico |
| **Símbolos SVG propios** (generador, panel, red, batería, inversor, **trafo**, **switch**, medidor, carga) | lenguaje eléctrico, no decorativo |
| **Interruptores con estado** (abierto/cerrado, color de estado) | conecta con F4: se **ve** la configuración |
| **Flujo por potencia**: grosor ∝ \|kW\| + animación direccional | se ve **hacia dónde** va la energía en la hora mostrada |
| **Badges de kW en el conector** | el dato donde el ingeniero lo busca |
| **Vista dual**: selector `Esquema` \| `Editor` | diagnóstico vs edición, mismo estado |

**Matiz de diseño**: la **barra es visual**; la conectividad real la definen los **edges + switches**
(F4). No se inventa un "nodo bus" que el solver tenga que interpretar.

## F6.2 REQUISITO DURO: la fluidez no se degrada

El editor es fluido **por un mecanismo concreto** que hoy está bien hecho
(`AGENTS.md` / `DiagramCanvas.jsx`): el arrastre usa **estado local** de React Flow
(`useNodesState` / `useEdgesState`) y **Redux solo se sincroniza al soltar** (`onNodeDragStop`).
Un rediseño descuidado **rompe eso**. Reglas obligatorias:

| # | Regla | Por qué |
|---|---|---|
| 1 | **Cero escrituras a Redux durante el arrastre**: se mantiene el patrón `useNodesState` → Redux en `onNodeDragStop` | escribir Redux por frame es la causa nº1 de tirones |
| 2 | **`nodeTypes` y `edgeTypes` declarados FUERA del componente** (constantes de módulo) | si se crean dentro del render, React Flow **re-monta** los nodos en cada render y se pierde la fluidez |
| 3 | **Nodos y edges memoizados** (`React.memo` por tipo) y dependencias estables en los `useCallback` | evita re-render del lienzo completo |
| 4 | **La animación de flujo es CSS/SVG** (`stroke-dashoffset` animado), **no** estado de React por frame | corre en el compositor, no en el hilo de React |
| 5 | **El grosor por potencia y los badges se calculan UNA vez** al recibir `latestResult` (memo por resultado), no en cada render | el dato cambia cada 15 min, no cada frame |
| 6 | **Sin librerías de animación** que traigan su propio bucle de render | mantener el bundle y el hilo principal libres |

## F6.3 Medición de fluidez (criterio verificable, no "se siente bien")

- **Línea base ANTES** del rediseño: contador de FPS durante un arrastre sostenido (N=200 frames) con
  `requestAnimationFrame`, y nº de renders del canvas (contador en el `useEffect` de debug).
- **Criterio**: después del rediseño, **FPS ≥ línea base − 5 %** y **sin re-renderizar el canvas
  completo durante el arrastre** (el contador de renders no debe subir al arrastrar).
- Se puede reutilizar la instrumentación que **ya existe** (`Backend/services/perfMetrics.js`).

## F6.4 Alcance por incrementos (el visual **acompaña** a cada fase, no es un big-bang)

| # | Incremento | Cuándo |
|---|---|---|
| **F6.1** | Barra AC + derivaciones ortogonales + etiqueta de tensión | junto a F1 (no necesita nodos nuevos) |
| **F6.2** | Símbolos SVG de los dispositivos **existentes** | junto a F1 |
| **F6.3** | Símbolo de **inversor** y **bus DC** | con F2 |
| **F6.4** | Símbolo de **transformador** | con F3 |
| **F6.5** | Símbolos de **switch** + estado abierto/cerrado visible | con F4 |
| **F6.6** | **Flujo por potencia** (grosor + animación) sobre el `dispatch_plan` real | al final (necesita F1–F5 estables) |
| **F6.7** | **Vista dual** `Esquema` \| `Editor` | al final |

**Criterio transversal del visual**: el `Editor` conserva **todas** las funciones actuales (añadir,
editar, doble clic → modal, guardar) y un **diagrama viejo se abre sin perder nodos** ni
reordenarse.

---

## F7 · Orden recomendado y decisiones pendientes

| Fase | Contenido | Depende de |
|---|---|---|
| **F1** | Cadena de confianza + arreglo del `100` + F6.1/F6.2 (barra y símbolos) | — |
| **F2** | Inversor modelado + bus DC (+ F6.3) | F1 |
| **F3** | Transformador, con frontera declarada (+ F6.4) | F2 |
| **F4** | Switches + contrato de `connections[]` (+ F6.5) | F1, F3 |
| **F5** | Propagación de incertidumbre | F2, F3 |
| **F6.6/F6.7** | Flujo por potencia + vista dual | F1–F5 |

### Decisiones pendientes del autor

| # | Decisión | Opciones |
|---|---|---|
| 1 | **Topología del sitio** | ¿hay **bus DC** real (paneles y batería DC, un inversor) o equipos AC independientes? — define el modelo de F2 |
| 2 | **Switch: quién decide** | ¿solo el operador fija · solo el solver decide · **ambos** (con `switch_mode`)? |
| 3 | **Trafo y flujo de potencia** | ¿se acepta la frontera declarada (pérdidas + kVA) y **AC-OPF** queda como fase futura separada? |
| 4 | **Vista dual** | ¿selector `Esquema`/`Editor` (recomendado) o sustituir el lienzo? |
| 5 | **Fidelidad de η** | ¿constante declarada o curva η(P) del fabricante? (si no hay dato → `null` declarado) |

### ✅ Resolución (2026-10-11) — confirmada por el autor

| # | Decisión | Resuelto |
|---|---|---|
| 1 | Topología del sitio | **AC (sin bus DC)** por defecto; el **bus DC** queda como variante **opt-in** (`bus_dc: true`) |
| 2 | Switch: quién decide | **`switch_mode: "operador"`** por defecto; `"solver"` y `"ambos"` disponibles |
| 3 | Trafo y AC-OPF | **Frontera aceptada**: pérdidas + kVA ahora; **AC-OPF queda como fase futura separada** |
| 4 | Vista dual | **Sí**: selector `Esquema` \| `Editor` |
| 5 | Fidelidad de η | **Declarable** (constante o curva del fabricante); si no se declara → `null` + eco, **sin inventar** |

**Regla transversal confirmada**: **todo es opt-in** — con los defaults, los resultados anteriores **no
cambian** (lo verifica el cambio 15 · C6 por sha256).

