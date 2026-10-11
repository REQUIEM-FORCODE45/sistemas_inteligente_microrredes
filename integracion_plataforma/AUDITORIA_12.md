# AUDITORÍA INDEPENDIENTE — CAMBIO 12 · CADENA DE CONFIANZA DEL DIAGRAMA

> Ejecutada por quien **especifica** el cambio, sobre el commit **`9fba50b`** (implementación del
> 12.1–12.3 + migración/valor efectivo de 12.4). Fecha: 2026-10-11.
> Método: **lectura del código + ejecución propia de lo ejecutable aquí**. Lo que no se pudo medir en
> este entorno se declara (§5), no se asume.
> Este documento **no edita** el `VERIFICACION.md` del implementador.

---

## 1. Veredicto

**La cadena de confianza está implementada y es correcta en su diseño.** El implementador resolvió por
su cuenta el falso positivo que más riesgo tenía (el nodo de red con id `grid_1` frente a la clave
`grid`) y respetó la regla de fluidez (el pre-flight se escribe **al lanzar**, nunca durante el
arrastre). Un criterio (**C8**, fluidez) **no cumple su umbral literal** y otro (**C7/eco**) tiene un
caso límite declarado. Nada de esto invalida el cambio; sí exige dos correcciones y una re-medición.

| Criterio | Declarado | Verificado aquí |
|---|---|---|
| C1 migración legacy | [x] | ✅ **leído**: `migrateParams` con coincidencia **exacta** de las 4 claves |
| C2 round-trip del precio | [x] | ✅ **leído**: mapper + `fuel_origen` en el eco (`nodo`/`sitio`) |
| C3 invariante de cobertura | [x] | ✅ **EJECUTADO por mí: PASS** (2/2) |
| C4 invariante del esquema | [x] | ⚪ no ejecutable aquí (requiere `pyomo`) |
| C5 pre-flight visible | [x] | ✅ **leído**: `preflightNodes` marca y **no** bloquea |
| C6 error atribuido | [x] | ✅ **leído**: badge por nodo desde el eco |
| C7 eco completo (N entradas) | [x] | ⚠️ **cubierto en el camino normal**; caso límite en §3.4 |
| **C8 fluidez** | [x] "sin degradación atribuible" | 🔴 **NO cumple el criterio literal** → §3.1 |
| C9 el editor no pierde nada | [x] | ✅ **leído** (migración idempotente, punto único en `loadDiagram`) |

---

## 2. Lo que verifiqué EJECUTANDO (independiente del implementador)

| Prueba | Comando | Resultado |
|---|---|---|
| Invariante de cobertura | `test_mapper_coverage` (2 tests) | **PASS 2/2** (corrido por mí, no por el agente) |
| El esquema y sus `req` | parseo de `topology_schema.json` | 10 tipos soportados + `inverter`/`sensor_iot` con `soportado:false` **y motivo** ✓ |
| **Coherencia `req` ↔ mapper** (mi verificación) | cruce tipo por tipo | ✅ **sin avisos espurios**: `max_kw`/`min_kw`/`capacity_kwh` del esquema **sí** los produce el mapper (solar, diesel, viento, batería, carga) |
| Falso positivo del grid | lectura `model_builder.py:56-58` | ✅ **cubierto**: `grid_1` hereda el eco de `grid` |
| C8 contra el umbral | cálculo sobre los números publicados | 🔴 **ver §3.1** |

---

## 3. Hallazgos

### 3.1 🔴 C8 (fluidez): el criterio literal NO se cumple, y la línea base no es comparable

El `VERIFICACION.md` publica: base **28.6** fps y después **26.2 / 26.1 / 27.5** (y **24.1 / 24.9** en
el árbol limpio). El criterio escrito en la spec era **FPS ≥ base − 5 % = 27.17**:

| medición | ¿cumple 27.17? |
|---|---|
| 26.2 | ❌ −8.4 % vs base |
| 26.1 | ❌ −8.7 % vs base |
| 27.5 | ✅ −3.8 % |
| 24.1 / 24.9 (árbol **limpio**) | ❌ −15.7 % / −12.9 % |

**El problema de fondo**: el árbol **limpio** (sin los cambios) rinde **24.1 / 24.9** — es decir, *por
debajo* del árbol modificado (26–27) y muy por debajo de la "línea base" de 28.6. Eso demuestra que
**28.6 no es comparable**: se midió en otra ventana/condición. Comparar contra ella es la clase de
comparación injusta que ya nos costó un −4 % artefacto una vez.

**Lo que sí es válido** (y el implementador ya lo hizo a medias): la comparación **intercalada** en la
misma sesión — modificado **25.1** vs limpio **24.9** → **el árbol modificado rinde ≥ el limpio** ⇒
**no hay degradación atribuible**. La conclusión es probablemente correcta; **la medición está mal
planteada**.

**Corrección exigida** (no opcional, es el requisito duro del autor):
1. Re-medir con el método **intercalado** (limpio ↔ modificado, alternando, misma ventana y mismo
   número de pasos), y reportar la **mediana de ≥3 pares**.
2. **Reformular el criterio**: variación **entre corridas del mismo árbol** (ruido ambiental del
   entorno headless sin GPU, que aquí es de ±15 %) en lugar de comparar contra una base de otra
   ventana. La condición de aceptación real es: **modificado ≥ limpio** en la mediana de los pares.
3. Mantener la segunda mitad del criterio, que sí es limpia: **el contador de renders no sube al
   arrastrar** → `nodeMutations 50 = 50` ✓ **cumplido**.

### 3.2 🟠 Límite del invariante: verifica presencia textual, no el camino completo

`test_mapper_coverage` comprueba `f"params.{clave}" in cuerpo_del_mapper` sobre el texto del JSX. Es un
invariante **estático útil** (falla ruidosamente si alguien añade un `defaultParams` sin mapper), pero
**un mapper que lea `params.x` y luego no lo incluya en el objeto de salida pasaría el test**. El
round-trip real solo está verificado para el diésel (C2).
**Recomendación**: declararlo así en el `VERIFICACION` (es una limitación conocida, no un defecto) y,
si se quiere cerrar, un test de contrato que compare las claves del payload con las del esquema.

### 3.3 🟡 El valor efectivo depende de un endpoint no probado

`DieselEffectiveLine` toma el precio del **eco** o de `GET /front/topology/fuel`. El implementador
declara que **el proxy HTTP no se probó** (sin Mongo levantado). Verificado por lectura:
- **cache de módulo** (`let fuelCache`) → **una sola** petición, no una por nodo ✓ (bien para fluidez);
- `.catch(() => null)` → si falla, muestra *"efectivo: pendiente (ejecuta la optimización)"* → **no
  inventa** ✓.
**Riesgo declarado**: sin endpoint y sin corrida previa, el operador no ve el precio. Mitigado por el
eco tras la primera optimización.

### 3.4 🟡 El eco depende de que el job traiga `devices` (caso límite declarado)

`build_device_echo` inventaría lo que recibe en `devices`. El camino de la UI lo envía ✓ y el bucle lo
hereda ✓ (`Front.js:51 setLastTopology(topology)` → Redis → `mpcScheduler.js:267
devices: topology.devices || []`). Pero si el bucle corre con **`DEFAULT_TOPOLOGY`** (sin `devices`), el
eco cae al **modo compatibilidad** y reporta **solo los grupos recibidos**: no puede avisar de un
inversor, porque nadie se lo dijo. **No miente** (no lo marca como modelado), pero **omite**.
**Recomendación**: declararlo en el `VERIFICACION` y, si se quiere cerrar del todo, que el `DEFAULT_TOPOLOGY`
incluya `devices` derivados de sus grupos.

---

## 4. Riesgos de fluidez: revisión de las 6 reglas

| # | Regla | Estado |
|---|---|---|
| 1 | Cero escrituras a Redux durante el arrastre | ✅ `setNodePreflight` se escribe **al lanzar** (comentario explícito en el slice) y `nodeMutations 50=50` |
| 2 | `nodeTypes`/`edgeTypes` constantes de módulo | ✅ sin cambios (declarado y coherente con el diff) |
| 3 | Nodos/edges memoizados | ✅ el badge es presentacional y **lee** Redux (no escribe) |
| 4 | Animación CSS/SVG, sin estado por frame | ✅ n/a en este incremento (no hay animación aún) |
| 5 | Grosor/badges calculados una vez | ✅ el badge deriva del eco del último resultado |
| 6 | Sin librerías de animación nuevas | ✅ |

---

## 5. NO verificado aquí (declarado, no asumido)

- `test_topology_schema.py` y `test_device_echo.py`: **requieren `pyomo`** (no está en el entorno del
  autor; corre en la máquina del implementador). El `VERIFICACION` reporta 29 passed y 1 fallo
  preexistente documentado.
- El proxy HTTP `/front/topology/fuel` con Mongo levantado.
- La medición de FPS (depende de Puppeteer/headless en la máquina del implementador).

---

## 6. Acciones pedidas al implementador

| # | Acción | Prioridad |
|---|---|---|
| 1 | **Re-medir C8 con el método intercalado** (limpio↔modificado, ≥3 pares, mediana) y **reformular el criterio**; reportar los pares crudos, no solo la conclusión | 🔴 alta (es el requisito duro del autor) |
| 2 | Declarar la **limitación del invariante** (§3.2) en el `VERIFICACION` | 🟠 media |
| 3 | Declarar el **caso límite del eco sin `devices`** (§3.4) | 🟡 baja |
| 4 | Probar el **proxy HTTP** con Mongo cuando el entorno lo permita | 🟡 baja |
| 5 | Símbolos SVG + barra AC: **en espera de la referencia visual** (acordado) | ⏸️ bloqueado hasta el mockup |

---

## 7. Fila de estado sugerida para `integracion_plataforma/README.md`

| # | Estado |
|---|---|
| **12** | ✅ 12.1–12.3 + migración/valor efectivo de 12.4 implementado (`9fba50b`) · auditoría: C1–C7 y C9 ✅ · 🔴 **C8 reformular/re-medir** · 🟠 limitación del invariante declarada · ⏸️ símbolos SVG y barra AC en espera de la referencia visual |

---

# 8. CIERRE DE LAS CORRECCIONES (`286c69a`)

## 8.1 Las 4 correcciones: hechas

| # | Pedido | Resultado |
|---|---|---|
| 1 | Re-medir C8 intercalado + reformular | ✅ **3 pares en la misma sesión**, pares crudos publicados, medianas y dispersión; **la base 28.6 queda declarada NO COMPARABLE** en `fps_baseline.json` |
| 2 | Declarar el límite del invariante | ✅ declarado **y además cerrado**: `test_mapper_output_contra_schema` compara las **claves del payload** con el esquema (mejor que lo pedido) |
| 3 | El eco sin `devices` | ✅ declarado **y además resuelto**: `DEFAULT_TOPOLOGY.devices` derivado de sus grupos **incluidos los `converters`** → el inversor sale como `ignorado` con motivo, también en el bucle |
| 4 | Probar el proxy HTTP | ✅ **verificado end-to-end con Mongo**: `GET /api/front/topology/fuel` → `200` con `price_cop_per_l: 2782`; el endpoint Python igual |

**Verificado por esta auditoría, ejecutando**: `test_mapper_coverage` + `test_mapper_output_contra_schema`
+ `test_solo_ui_contra_schema` → **PASS 3/3** (corridos aquí, no reportados por el implementador).

## 8.2 🟠 La conclusión de C8 se sostiene, pero **la frase que la justifica es falsa**

El `VERIFICACION` afirma: *"PASA: mediana(mod) ≥ mediana(limpio) dentro del ruido"*. La aritmética dice:

| | mediana |
|---|---|
| modificado | **30.0** |
| limpio | **30.9** |

**30.0 < 30.9 → la desigualdad escrita es FALSA** (el modificado rinde **−2.9 %**). El criterio que la
auditoría anterior redactó ("mediana(mod) ≥ mediana(limpio)") **no se cumple literalmente**.

**Lo que sí es correcto**: −2.9 % cae dentro del ruido declarado del entorno headless sin GPU
(±10–15 %) y con **3 pares no hay potencia** para detectar diferencias <10 %. Por tanto
**"sin degradación atribuible" es defendible** — pero hay que redactarlo por el **ruido**, no por una
desigualdad que los números contradicen. Es el mismo patrón de las casillas marcadas `[x]` con una
afirmación que no se sostiene (cambio 06): la conclusión acierta, la justificación no.

**Detalle metodológico que refuerza la cautela**: los pares muestran **tendencia opuesta** —
modificado `30.7 → 30.0 → 29.2` (baja) y limpio `28.7 → 30.9 → 31.4` (sube). Eso apunta a **deriva por
orden de medición** (arranque en frío / calentamiento de la máquina), y con deriva la mediana de 3
pares es frágil.
**Recomendación (no bloqueante)**: **aleatorizar el orden** de los pares y subir a **5–6 pares**;
o aceptar y declarar el resultado como *"no se detecta degradación > 10 %"* (que es lo que los datos
permiten afirmar).

## 8.3 Veredicto del cambio 12

**El incremento queda cerrado en su alcance ejecutado** (12.1–12.3 + migración/valor efectivo de 12.4).
La cadena de confianza funciona y **está verificada por ambas partes**. Pendiente único: la parte
visual (símbolos SVG + barra AC), **bloqueada a propósito** hasta que exista la referencia visual.
Sugerencia de redacción para la fila: *(C8: sin degradación atribuible, redacción a corregir)*.

---

# 9. AUDITORÍA DEL 12.4 VISUAL (`770ac55`) — variante B implementada

## 9.1 Verificado por esta auditoría, ejecutando

| Prueba | Resultado |
|---|---|
| **Invariante de cobertura** (ahora con el tipo nuevo `ac_bus` en la paleta) | ✅ **PASS 3/3** (corrido aquí) |
| **Los 9 símbolos vs la referencia**, path por path | ✅ **VERBATIM 9/9** — no inventó iconografía (los atributos están correctamente convertidos a JSX: `strokeWidth`, `strokeLinecap`) |
| **Proporción del grosor** `flowWidthFor` | ✅ reproduce la referencia: 10 kW → **6.00** (ref 6), 4 kW → **3.48** (ref 3.5), 1.5 kW → **2.43** (ref 2.5) |
| `AcBusNode` fuera del solver | ✅ `ac_bus.voltage` **declarado** en `PARAMS_SOLO_UI` con motivo; comentario "decorativo: no va al job ni al eco" |
| Píldora de estado sin datos inventados | ✅ `useCardStatus` devuelve **`null`** si no hay `dispatch_plan` o no hay entradas del nodo |
| Animación sin JS | ✅ `.rf-dragging .edge-flow{display:none}` + `pointer-events:none` en CSS, con `prefers-reduced-motion` |
| **C9**: ¿se tocaron las posiciones? | ✅ **no** (condición puesta en la ronda anterior); dimensiones y posiciones intactas, la barra **solo aparece si el usuario la agrega** |

## 9.2 ✅ El C8 quedó bien — y con un hallazgo propio

El implementador **aceptó el error de redacción** (la desigualdad era falsa), pasó a **6 mediciones en
orden aleatorio** y publicó los pares crudos. Resultado: **vis 22.1 vs pre 22.6 (−2.2 %)** →
conclusión redactada como corresponde: **"NO se detecta degradación >10 %"** (lo que los datos
permiten afirmar con ruido ±10-15 %), con `nodeMutations` constante en 50.

**Y encontró por su cuenta lo que la advertencia anticipaba**: la capa `flow` animada **en reposo**
costaba **~40 % en software** (13.5 vs 23.5 fps). Lo resolvió **sin JS**: ocultarla **solo durante el
gesto** (`.rf-dragging`, clase que pone React Flow) y devolverla al soltar. Es la decisión correcta:
mantiene el flujo vivo y no cobra el peaje donde duele.

## 9.3 Hallazgos abiertos

### a) 🔧 `AcBusNode` es **arrastrable** → **DECISIÓN DEL AUTOR (2026-10-11): va ANCLADA**
El comentario del archivo dice *"Arrastrable y seleccionable como los demás"*. El autor resolvió el
hallazgo: la barra es **estructura del esquema**, así que va con **`draggable: false`** (seleccionable
sí, para configurarla). Motivo: si el operador la descoloca arrastrando, el esquema queda torcido y el
gesto se pierde sin aviso — la barra **no** es un dispositivo que se mueve, es el bus del unifilar.
**Acción pedida**: `draggable: false` en el nodo `ac_bus` + anotarlo en el `VERIFICACION`.

### b) 🟠 La barra aparece en el **panel de sensores** y mapearla no tiene efecto
Está declarado así: *"`Barra AC` figura en el panel de sensores … mapearla no tiene efecto: el
sanitizador la filtra"*. **Este es exactamente el patrón que este cambio combate**: la UI ofrece una
acción que el backend descarta **en silencio**. Coherente con el propio principio del cambio 12, la
barra debería estar **excluida visiblemente** del panel (o marcada como no mapeable), igual que se
excluyen los nodos de tipo sensor.
**Fix**: filtrar `ac_bus` en la lista del panel de mapeo (una línea, mismo lugar donde ya se filtran
los sensores).

### c) 🟡 Ancho fijo de la barra: 360 px (la referencia usaba ~880 px)
Con los nodos repartidos en el lienzo, una barra corta hace que las derivaciones de los extremos
viajen lejos, lo que resta lectura de unifilar. **A verificar visualmente por el autor** en la app:
si el esquema se ve desbalanceado, subir el ancho (o hacerlo depender de la extensión ocupada).

### d) ⚪ No verificable aquí: **el render final del lienzo**
No hay ninguna captura en el repo (la del implementador, `v124_final.png`, vive en su sesión). Lo que
verifiqué es el **código** (verbatim, proporción, estados, CSS) y el **render de los SVG de
referencia**, no el lienzo real de React Flow.

## 9.4 Estado del cambio 12

**Alcance completo** (12.1–12.4): cadena de confianza + arreglo del `100` + unifilar variante B.
Verificado por ambas partes. Quedan **dos ajustes opcionales** (§9.3 a y b) y **una comprobación
visual del autor** (§9.3 c).
