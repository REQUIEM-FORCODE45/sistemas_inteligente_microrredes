# AUDITORÍA INDEPENDIENTE — CAMBIO 13 · INVERSOR MODELADO + BUS DC

> Ejecutada por quien **especifica** el cambio sobre el commit **`943bf4b`**. Fecha: 2026-10-11.
> Método: lectura del código, **ejecución propia de lo ejecutable aquí**, y **lectura de la captura**
> versionada. Lo que no se pudo medir en este entorno se declara (§6), no se asume.
> Este documento **no edita** el `VERIFICACION.md` del implementador.

---

## 1. Veredicto

**El inversor dejó de ser un dibujo: ahora el solver lo simula, y la prueba es visible en pantalla.**
El incremento está bien construido y el `VERIFICACION` es de los mejores del proyecto: incluye un
**hallazgo propio** (el primer bus DC salió infactible y lo resolvió añadiendo holgura **atribuida**,
no tapándolo) y un **control experimental** para separar el efecto numérico del efecto del código
(§4.3). Quedan **dos temas abiertos que afectan a la tesis** (§3.1 y §3.2), no al software.

| Criterio | Declarado | Verificado aquí |
|---|---|---|
| Transición de `PARAMS_SOLO_UI` | ✅ | ✅ **ejecutado**: las 2 líneas eliminadas + mapper + invariante **PASS 3/3** |
| C1 conversión ±1e-6 | ✅ | ⚪ requiere `pyomo` (máquina del implementador) |
| C2 límite + recorte atribuido | ✅ | ✅ **leído**: `curtailment` con `device_id` del inversor |
| C3 η ausente → no convierte + eco + pre-flight | ✅ | ✅ **leído**: `eta_origen: "no declarada"`, `if_missing` en el esquema |
| C4 bus DC + panel AC = error atribuido | ✅ | ✅ **leído**: dos balances, `CURT_DC`, eco `error` con motivo |
| C5 propagación de la banda | ✅ | ✅ **leído**: `P_ac = eta·P_inv_dc` **por restricción** + matiz declarado |
| C6 eco + prueba visible | ✅ | ✅ **captura leída**: sin "Solo visual", `9.7 kW` en el cable |
| C7 sin regresión + ExpB | ✅ | ✅ **leído**: plan idéntico bit a bit + **control** del tiempo |
| C8 fluidez | ✅ | ✅ **leído**: 6 pares, orden aleatorio, pares crudos, +5 % dentro del ruido |

---

## 2. Lo que verifiqué EJECUTANDO

| Prueba | Comando | Resultado |
|---|---|---|
| **Transición de `PARAMS_SOLO_UI`** | lectura de `deviceTypes.js:407-417` | ✅ las 2 entradas del inversor **eliminadas**, con el comentario explícito de que dejarlas "sería declarar una mentira"; quedan solo `grid.voltage`, `battery.voltage`, `sensor_iot.*`, `ac_bus.*` |
| **Mapper del inversor** | `DiagramOptimizationPanel.jsx:106-113` | ✅ `eta: null` si no se declara (**no inventa**), `max_kw`, `bidirectional`, `bus_dc` |
| **Invariante de cobertura** | `test_mapper_coverage` + 2 | ✅ **PASS 3/3**, **corrido por mí** — confirma que el mapper cubre los 4 campos (quitar las 2 líneas sin mapper habría fallado) |
| **Esquema del inversor** | parseo de `topology_schema.json` | ✅ bloque con `params` (`eta` default `null`) + `if_missing` → *"NO se convierte + eco + pre-flight (prohibido inventar)"*; `sensor_iot` sigue `soportado: false` |
| **Modelo en el solver** | `model_builder.py:354-402, 600-716` | ✅ `eta_origen` declarada/no declarada · `bidirectional sin bus_dc` → **warning sin efecto** · `CURT_DC` **con el motivo escrito** · `U_inv` binaria **solo con bus_dc** (riesgo 1 contenido) · dos balances DC y AC acoplados por `P_ac = eta·P_inv_dc` |
| **Captura** | `reference/figuras/cambio_13_unifilar.png` | ✅ ver §2.1 |

### 2.1 La prueba visible (lo que pedí como evidencia del cambio)

| Esperado | Confirmado en la captura |
|---|---|
| Sin el aviso *"Solo visual"* | ✅ desapareció |
| Sin badge `no simulable` / `sin modelo` | ✅ desaparecieron (solo queda para ramas con extremo ignorado, que ya no es el caso) |
| El inversor con datos **reales** en la tarjeta | ✅ **Capacidad 10.0 kW · Eficiencia 97 %** |
| La conversión **en el cable** | ✅ **`10.0 kW`** entra al inversor y salen **`9.7 kW`** (= 0.97 × 10.0) |

Que el `9.7 kW` esté pintado en la rama de salida es exactamente la prueba de que el modelo corre: el
número del cable es el resultado de la restricción, no de una etiqueta.

---

## 3. Hallazgos

### 3.1 🟠 El `η = 0.97` de los experimentos es un valor **elegido**, no un dato del fabricante

`config.py` declara `MICROGRID["inverter"] = {eta: 0.97, max_kw: 50, ...}` y `strategies._build_job` lo
inyecta en **todos** los jobs de ExpA, y `experiment_b_solver_time.JOB` en los de ExpB.

La metodología del proyecto exige que **toda cifra salga de un artefacto versionado con su fuente**
(regla dura 2). Un 0.97 es un valor *típico* de inversor, pero **no es un dato de placa de ningún
equipo del sitio**. Dos consecuencias:

1. **Trazabilidad**: hay que declarar el origen — "valor de referencia típico de inversor comercial,
   **pendiente de sustituir por el dato del fabricante**". Sin eso, el capítulo estaría citando un
   número sin fuente.
2. **Decisión del autor**: si el inversor real del sitio tiene η distinto (0.95/0.98, o curva), el
   `MICROGRID` debe llevar **ese** valor.

**DECISIÓN DEL AUTOR (2026-10-12)**: se mantiene **`η = 0.97`**, declarado como **referencia típica
de inversor comercial**, con el pendiente del **dato de placa** explícito en la config. La acción de
trazabilidad (campo de origen/nota) se mantiene: el valor se queda, pero deja de ser un número sin
fuente.

**Acción**: `MICROGRID["inverter"]["eta"]` con un campo `fuente`/`nota` que diga de dónde sale (valor
de referencia típico, pendiente del dato de placa).

### 3.2 🟠 Los resultados publicados de **ExpA/ExpB quedan superados** (afecta al capítulo)

Al entrar el inversor en serie sobre el PV, el balance recibe `P_ac = 0.97 · P_dc`: **el PV efectivo
baja un 3 %** respecto de todas las corridas anteriores. El implementador lo **declara** (bien), pero
la consecuencia hay que gestionarla:

- Cualquier cifra de ExpA/ExpB ya publicada (costos, ENS, CVaR, litros de diésel) **no es reproducible**
  con el job nuevo.
- No es un error: es el resultado de **modelar bien**. Pero obliga a **re-correr** antes de cerrar el
  capítulo, y a decidir en qué régimen económico (cambio 11: Pasto 2 782 COP/L).
- Matiz físico: en **isla** el PV ya se vertía al 74 % (hallazgo previo), así que un −3 % puede **no
  cambiar** el despacho; donde sí puede morder es en **grid30/grid10**, con el PV útil.

**Acción**: entra en el **bloque de validación diferido** como un punto explícito — *"re-correr ExpA/A2
con el job que ya incluye el inversor"* — y anotar en el informe que los números anteriores son
pre-inversor.

### 3.3 🟡 Divergencia diagrama ↔ experimentos → **DECISIÓN DEL AUTOR (2026-10-12)**

El **diagrama** solo convierte si el usuario **declara** `efficiency` en el nodo del inversor (si está
vacío → `eta: null` → **no convierte**, por contrato). Los **experimentos** sí llevan 0.97 por config.
Es decir: **hoy el diagrama y los experimentos no simulan lo mismo**.

**Resuelto**: `defaultParams.efficiency = 0.97` **declarado en el nodo**, con su **origen visible** en
el panel (reutilizando la línea de "valor efectivo" del 12.4) y con tres condiciones:
1. el valor no puede quedar como un número opaco: su origen se ve **en el panel**;
2. el campo sigue siendo **borrable** → vaciarlo devuelve `eta: null` → no convierte + eco + pre-flight
   (C3 intacto);
3. **opt-in respetado**: los diagramas ya guardados no cambian (manda su param); solo los nodos nuevos
   nacen con 0.97.

Razonamiento que lo sostiene: el contrato prohíbe **inventar** una eficiencia, no **declarar** una
referencia con su fuente. Un default declarado y documentado es trazable; uno silencioso no.

### 3.4 🟡 Acabado de layout en la captura (no es un defecto del cambio)

Los badges se apiñan sobre codos y cruces de líneas, y el bus de 880 px queda por debajo de la vertical
que sube a `load_1` (la línea parece entrar en la caja del bus). Es **layout del diagrama del autor**
(posiciones de las tarjetas), no un fallo de la implementación. Se anota para cuando se ordene el
diagrama definitivo del capítulo.

### 3.5 🟠 `AGENTS.md` quedó contradiciendo el cambio 13 — y ese archivo lo leen los agentes

Verificado: **`AGENTS.md` no se tocó** en `943bf4b`, y contiene dos afirmaciones que ahora son **falsas**:

| Línea | Dice | Realidad tras el cambio 13 |
|---|---|---|
| `AGENTS.md:192` | *"El bloque **Inversor es solo visual** (no tiene mapper, no entra al solver)"* | **Falso**: tiene mapper, entra al solver, convierte con `η` y propaga la banda |
| `AGENTS.md:153` | *"**Nodes (7)**: SolarPanel, DieselGenerator, Grid, Inverter, Battery, Load, Sensor"* | Desactualizado: falta la **Barra AC** (`ac_bus`, cambio 12); el conteo ya no es 7 |

Por qué importa más de lo que parece: `AGENTS.md` es **la referencia que consume cualquier agente**
que trabaje en este repositorio. Un archivo que dice que el inversor "es solo visual" puede hacer que
el **próximo agente revierta** el trabajo de este cambio creyendo que corrige un error — el mismo fallo
de confianza que el cambio 12 combate en la UI, pero en la documentación.
**Acción**: actualizar esas dos líneas (y la sección de tipos de dispositivo si procede) al estado real
tras los cambios 12 y 13.

---

## 4. Lo que este incremento hizo bien (para que se repita)

### 4.1 El bus DC infactible: encontrado, explicado y resuelto con holgura **atribuida**
El primer bus DC daba **infactible** porque el balance DC no tenía holgura de recurso (con `P_inv_dc` y
la batería atados en `t=0` por el nonant y el PV distinto por escenario). La solución fue añadir
`CURT_DC` **como recurso, con fila de `curtailment` atribuida al inversor** — el mismo razonamiento por
el que `CURT`/`ENS` son recursos en AC. Y lo **documentó** en vez de esconderlo.
**Esto es exactamente lo que se pide**: un modelo que no cierra no se "arregla" bajando una cota en
silencio; se le da una válvula física y se declara.

### 4.2 El matiz de C5 sobre lo que **sí** se propaga
Declara que en bus DC el **orden** de la banda del despacho puede no ser monótono (el optimizador
puede verter más en el escenario bueno por economía) y que lo que se propaga **exacto** es el **mapa
η** (una restricción), no la decisión económica. Distinguir "restricción" de "resultado" es fino y
correcto.

### 4.3 El control del ExpB
Para no atribuir al inversor el aumento de 4.91 s → 5.68 s, corrió **el mismo job sin inversor pero con
la banda pre-escalada ×0.97** (mismos coeficientes, sin su código): **5.62 s** ≈ 5.68 s ⇒ el costo es
**numérico del solver**, no del modelo añadido. Es la forma correcta de medir un tiempo.

### 4.4 La lección del `s=0` aplicada sola
En C3, un η ausente marca el nodo como **`aviso`** (no `ignorado`) y `PowerEdge.openEnd` **solo abre
con `ignorado`/`error`** — de modo que las ramas siguen mostrando sus kW. Deducir que *"un aviso no es
una rama abierta"* es haber interiorizado el hallazgo del 12.4.

---

## 5. Fila de estado sugerida

| # | Estado |
|---|---|
| **13** | ✅ **Implementado y auditado** (`943bf4b`): transición de `PARAMS_SOLO_UI` verificada (invariante 3/3), captura con la prueba visible (`10.0 → 9.7 kW`), bus DC con `CURT_DC` atribuido, C7 con control del ExpB · 🟠 **`η = 0.97` de los experimentos sin fuente declarada** (decisión del autor) · 🟠 **ExpA/ExpB publicados quedan superados** → re-correr en el bloque de validación · 🟡 divergencia diagrama ↔ experimentos (declarar η en el nodo) |

---

## 6. NO verificado aquí (declarado, no asumido)

- `test_inverter.py` (9 tests) y todo lo que importa `pyomo`: **corren en la máquina del implementador**.
  Aquí solo se ejecutaron los 3 tests estáticos del invariante.
- El ExpA completo de 14 días con inversor (no recorrido por cómputo, declarado por el implementador).
- Las marcas de pre-flight de C3/C4 en el navegador (verificadas por código + lado solver en test;
  declarado por el implementador).
- Efecto numérico del −3 % de PV sobre los resultados del capítulo: **hay que medirlo** (§3.2).
