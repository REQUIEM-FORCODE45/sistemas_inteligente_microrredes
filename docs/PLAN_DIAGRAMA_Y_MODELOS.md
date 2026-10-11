# PLAN — DIAGRAMA UNIFILAR MODERNO, MODELOS DE OPTIMIZACIÓN Y LIMPIEZA DE NODOS
### el `100` del panel · qué modelo usa cada dispositivo · unifilar sin parecer viejo · sacar "Sensor IoT"

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Este archivo vive en
> `C:\Users\2D\tesis-microrred\docs\` y se copia a `integracion_plataforma/cambio_12_.../` cuando se
> cierre (un incremento = una carpeta).
> **Estado**: propuesta. Fecha: 2026-10-11.

---

# §1 · Por qué el panel sigue mostrando `100` (y `0.5`) — AUDITORÍA

## 1.1 El motor está BIEN; la UI muestra el valor guardado del nodo

**Verificado**:
- `deviceTypes.js:146-154` (defaults del diésel) **ya son los correctos**:
  `costA: 0.0012, costB: 0.24, costC: 1.8, fuelCost: null` ✓
- `DeviceConfigPanel.jsx:69` → `setParams({ ...selectedNode.data.params })`:
  **el panel pinta los params GUARDADOS del nodo**, no los defaults del tipo.
- `diagramSlice.js:108-111` (`updateNodeParams`) persiste ese objeto en el nodo.

**Conclusión**: el diagrama guardado (navegador/Redis) conserva los valores **legacy** del nodo
(`costB: 0.5`, `costC: 0.5`, `fuelCost: 100`). El solver los **normaliza** correctamente
(`model_builder.py:235-246`) y usa Willans + 2,782 COP/L — pero **el operador ve 100**, y no tiene
forma de saber qué precio se está aplicando. Es un **desajuste UI ↔ motor**, no un error de cálculo.

## 1.2 Arreglo (incremento 11.6 — va en la carpeta del cambio 11)

| # | Qué | Dónde |
|---|---|---|
| 1 | **Migrar los params guardados** al cargar el diagrama: si la tupla coincide **exactamente** con la legacy (`0.001/0.5/0.5/100`), sustituirla por Willans (`0.0012/0.24/1.8`) y `fuelCost: null` | `diagramSlice.js` (al hidratar) o un `migrateParams()` en `deviceTypes.js` |
| 2 | **Mostrar el valor EFECTIVO** del sitio junto al campo: *"efectivo: 2.782 COP/L — sitio Pasto, vigencia 2026-10"* (texto informativo, no un valor del nodo) | `DeviceConfigPanel.jsx` |
| 3 | **Indicar el origen** cuando el valor viene del nodo: *"valor declarado en este nodo (anula el del sitio)"* | `DeviceConfigPanel.jsx` |
| 4 | **Aviso de normalización**: si al migrar se cambió un valor, decirlo una vez (*"valores actualizados al estándar Willans/sitio"*) | UI, no silencioso |

**Criterio de cierre**: abrir el diagrama guardado y ver en el panel del diésel `a1=0.24`, `a0=1.8`,
precio **vacío** con el texto del efectivo (2.782 COP/L, Pasto, 2026-10); guardar, reabrir y que
**no vuelva** a `100`.

---

# §2 · Qué MODELO usa cada dispositivo en la optimización (verificado)

> Tabla leída del código del solver (`model_builder.py`). Sirve como respuesta a *"¿qué modelo usamos
> para cada activo?"* y como inventario de lo que **hoy no se puede usar**.

| Dispositivo | Modelo en el solver | Fórmula (código) | Estado |
|---|---|---|---|
| **Panel solar** | **Pasivo** con 3 caminos: banda calibrada P10/P50/P90 del sensor → `predictions_pv_kw` → fórmula simple | `pv_kw = Σ max_kw·efficiency·irrad × factor_escenario` (`:456-464`) | ✅ usable. Con sensor enlazado usa el **modelo calibrado** (k + pvlib + GBR + banda); sin sensor cae a la fórmula con `efficiency = 0.20` ("eff. con inv.") |
| **Aerogenerador** | **Pasivo**, `wind_kw` = banda → `predictions_wind_kw` → **`0.0`** | `:468-477` | ⚠️ **sin sensor eólico enlazado NO genera** (y en Pasto la calibración da modelo nulo honesto por falta de señal) |
| **Generador diésel** | **Dispatchable** (variable Pyomo) con binaria de encendido | `P ∈ [min·U, max·U]`; costo `(c + b·P + a·P²)·fuel` linealizado en 10 tramos; **rampa**; **arranque/parada**; **cargo fijo** | ✅ completo y auditado (cambios 08 + 11) |
| **Batería** | Variable de decisión con binaria de complementariedad | `SOC[t] = SOC[t−1] + η_c·P_carg − P_desc/η_d`; `P_c ≤ max_c·Z`, `P_desc ≤ max_d·(1−Z)`; degradación `λ·(P_c+P_desc)`; valor terminal | ✅ completo (λ configurable desde el cambio 10) |
| **Red** | Variable de intercambio (import/export separadas) | `P_import ≤ max_import`; `P_export ≤ min(PV, max_export)`; ToU horario; cargo fijo hora/mes; exclusión mutua si hay tarifa de inyección | ✅ completo (cambios 08 + 10) |
| **Carga / Edificio** | **Dato, no variable** (entra por el balance) | Restricción de igualdad `Σ generación + ENS − CURT == load_total` | ✅ correcto: la demanda no se "optimiza", se sirve |

## 2.1 Los dos que **no se pueden usar** hoy (con opciones)

### a) **Inversor** — no existe en el solver
`DeviceConfigPanel` lo dibuja y se configura, pero **no tiene `solverCategory` ni mapper** y
`model_builder.py` no lo menciona: **es puramente visual**.

| Opción | Qué implica | Cuándo elegirla |
|---|---|---|
| **A · Quitarlo del canvas** | igual que el sensor (§4): fuera de la paleta y del lienzo | si la conversión ya está implícita (el nodo solar actual es **"Panel Solar AC"** y su eficiencia dice *"Eff. (con inv.) = 20 %"*) |
| **B · Darle modelo real** | límite de potencia AC (`P_ac ≤ P_rated`), pérdidas `η_inv`, y acople DC/AC (que la batería DC y los paneles DC pasen por él) | si se quiere representar un sistema con bus DC y contabilizar pérdidas y el límite del inversor |

**Recomendación**: **A** ahora (coherente con que el solar ya es "AC con eficiencia que incluye el inversor") y **B** como línea futura si la microrred pasa a bus DC.

### b) **Aerogenerador** — solo funciona con sensor enlazado
Decisión de producto: o **se quita** (Pasto no tiene recurso eólico: la calibración da modelo nulo) o
**se queda** mostrando honestamente `0 kW` hasta que haya sensor. **No** conviene ponerle un perfil
inventado: violaría la regla de "ningún valor inventado".

**Recomendación**: dejarlo, pero que el nodo muestre **"sin señal eólica — 0 kW (modelo nulo)"** para
que no parezca un fallo del solver. Y si el jurado pregunta: el modelo eólico está implementado y
calibrado; en Pasto no hay señal, y eso es un resultado, no una carencia.

---

# §3 · Rediseño del canvas hacia un **unifilar moderno**

## 3.1 El problema (lo que se ve hoy)

El lienzo actual son **tarjetas flotantes con arcos bezier** que convergen a un punto (imagen 2):
- se lee como *"diagrama de bloques decorativo"*, no como esquema eléctrico;
- **el color y el grosor no significan nada eléctrico** (nodos amarillos/azules por categoría);
- **no hay barras, ni tensiones, ni flujo** dirigido;
- los "arcos" dan un aire genérico/dashboard y no de ingeniería → *"parece viejo"* sin serlo.

## 3.2 Propuesta: conservar el lenguaje visual, cambiar la topología

**Regla de diseño**: *el aspecto se queda (tipografía, tarjetas, sombras, radios, paleta del tema),
la estructura cambia a unifilar.* Así se ve moderno **por construcción**, no por decoración.

| Elemento nuevo | Cómo se ve | Para qué |
|---|---|---|
| **Barra AC principal** | línea horizontal **gruesa** (4-6 px) con extremos redondeados, etiqueta `AC 220 V · 60 Hz` | es el "bus" del unifilar |
| **Barra DC** (opcional, si se aprueba la opción B del inversor) | segunda línea, `DC 48 V` | separar DC/AC |
| **Derivaciones a 90°** | `smoothstep` ortogonal (no bezier curvo) | lectura de unifilar |
| **Símbolos SVG propios** | generador = círculo con `G`; PV = panel simplificado; red = dos barras; batería = placas; **interruptor/seccionador** = línea con cuadro; **medidor** = círculo con `M`; carga = flecha | lenguaje eléctrico reconocible |
| **Interruptores con estado** | cuadro **cerrado/abierto** con color de estado | el operador ve qué está conectado |
| **Flujo por potencia** | grosor de línea ∝ \|kW\| y **animación direccional** (dash offset) sentido import/export/carga/descarga | se ve *hacia dónde va la energía* en cada hora |
| **Badges en el conector** (no en la tarjeta) | píldora con `+45 kW` / `−12 kW` en el punto de unión | el dato donde el ingeniero lo busca |
| **Panel de tensión/seccionamiento** | etiquetas de nivel a la izquierda de la barra | contexto de unifilar |

**Lo que se conserva de hoy**: tarjetas con max/min y parámetros, doble clic → modal de despacho,
badges de estado, colores de categoría **usados con semántica** (generación / almacenamiento / carga).

## 3.3 Vista dual (sin perder lo que ya funciona)

- **Selector en el lienzo**: `Esquema` (unifilar, lectura/diagnóstico) · `Editor` (tarjetas, para
  añadir/editar/parametrizar). Mismo estado Redux y mismos nodos: **solo cambia la capa de dibujo**.
- Riesgo controlado: se construye **encima** del editor actual (React Flow) con un `nodeType`
  alternativo por dispositivo; nada de reescribir el motor de diagramas.

## 3.4 Alcance del rediseño

| # | Incremento | Qué |
|---|---|---|
| **12.1** | Barra AC + layout jerárquico | derivaciones ortogonales, snap a la barra, etiqueta de tensión |
| **12.2** | Símbolos SVG | set propio por tipo (generador, PV, red, batería, carga, interruptor, medidor) |
| **12.3** | Flujo por potencia | grosor ∝ kW + animación direccional con el `dispatch_plan` real |
| **12.4** | Vista dual | selector `Esquema` / `Editor` |
| **12.5** | Limpieza (§4) | quitar el nodo **Sensor IoT** y el **Inversor** (según decisión) de la paleta y del lienzo |

**Verificable ejecutando**: captura del `Esquema` con el dispatch de la última corrida (grosor y
dirección coherentes con el `dispatch_plan`); el `Editor` conserva **todas** las funciones actuales
(añadir, editar, doble clic, guardar); un diagrama viejo se abre sin perder nodos.

---

# §4 · Quitar el bloque **"Sensor IoT"** (verificado: es seguro)

**Lo que se comprobó**:
- `deviceTypes.js:269-281`: el nodo `SENSOR` no tiene `solverCategory` ni `solverType` →
  **no entra al solver**; sus params (`metric`, `interval`) son decorativos.
- ⚠️ **Crítico — NO tocar esto**: el enlace real de sensores es el **`SensorMappingPanel`**
  (`sensor_mappings: {nodeId_dispositivo → sensor_id}`), que **sí alimenta el bucle
  calibrar → predecir → optimizar** (`mpcScheduler.js:191`, `Front.js:30,51`). **Ese panel y sus
  mappings se quedan intactos**: es funcionalidad viva de la tesis.

**Qué se quita exactamente**: el **nodo suelto** del lienzo y su entrada en la paleta.
- `DiagramCanvas.jsx:22` → quitar `[DEVICE_TYPE.SENSOR]: SensorNode`
- `SensorNode.jsx` → deja de usarse (se puede archivar)
- `deviceTypes.js` → quitar la entrada de `DEVICE_DEFINITIONS` y de `CATEGORY_META[SENSORS]`
  (dejar solo los sensores **enlazables** en el panel de mapeo)

**Criterio de cierre**: la paleta ya no ofrece "Sensor IoT"; el `SensorMappingPanel` sigue listando
**dispositivos** para enlazarles un sensor real; un diagrama guardado que tuviera nodos Sensor
**no rompe** (se ignoran o se avisa, no crash).

---

# §5 · Decisiones pendientes del autor

| # | Decisión | Opciones |
|---|---|---|
| 1 | **Inversor** | (A) quitarlo del canvas · (B) darle modelo real (límite AC + pérdidas + bus DC) |
| 2 | **Aerogenerador** | dejarlo con "sin señal — modelo nulo" · quitarlo |
| 3 | **Vista dual** | ¿selector `Esquema`/`Editor`, o sustituir el lienzo por el unifilar? |
| 4 | **Alcance del rediseño** | solo 12.1+12.2 (barra + símbolos) · completo (12.1–12.4) |

### ✅ Resolución (2026-10-11)

| # | Decisión | Resuelto |
|---|---|---|
| 1 | **Inversor** | Se le da **modelo real** (opción B) → **cambio 13** (conversión DC/AC, η, límite, bus DC opt-in) |
| 3 | **Sensor IoT** | Se **quita el nodo** del lienzo → **cambio 12** (§4), sin tocar `SensorMappingPanel` ni `sensor_mappings` |
| 4 | **Alcance del rediseño** | **Completo**, pero **repartido por fases**: cambio 12 (barra + símbolos) y cambio 16 (flujo + vista dual) |

**Pendiente**: el **aerogenerador** (dejarlo con "sin señal — modelo nulo" o quitarlo).


**Orden recomendado**: §1 (arreglo del `100`, es un defecto visible y barato) → §4 (quitar el sensor)
→ 12.1/12.2 (barra + símbolos) → 12.3/12.4 (flujo + vista dual).
