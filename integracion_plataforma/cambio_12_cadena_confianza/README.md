# PLAN — CAMBIO 12 · CADENA DE CONFIANZA DEL DIAGRAMA (F1) + unifilar base (F6.1/F6.2)
### lo que se dibuja se simula, o se dice por qué no · arreglo del `100` · barra AC y símbolos · fluidez intacta

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Vive en `C:\Users\2D\tesis-microrred\docs\` y
> se copia como `integracion_plataforma/cambio_12_cadena_confianza/README.md`.
>
> **Estado**: propuesta · **Clasificación**: 🖥️ PRODUCCIÓN · **Prerrequisito de**: cambios 13–16.
> **Origen**: petición del autor (2026-10-11): *"si falla, que traiga la falla al diagrama; de lo
> contrario tendríamos al usuario adivinando"*.

---

## 0. Objetivo

Cerrar las fugas por las que **lo que el operador ve no es lo que el solver simula**, y hacerlo
**sin añadir ni una sola función nueva**. Hoy:

1. El panel muestra **valores guardados** del nodo que el motor ya no usa (el caso del `100`).
2. Un parámetro que la UI ofrece **puede no tener camino** al job (el mapper lo descarta con `||`/`?:`).
3. Hay dispositivos dibujables que el solver **ignora en silencio** (el inversor).
4. Un fallo del solver llega como **error genérico**, sin decir **qué elemento del diagrama** lo causó.

Tras este cambio, esas cuatro cosas son **imposibles sin que el sistema lo diga**.

---

## 1. Lo que YA existe (verificado)

| pieza | ruta:línea | hoy |
|---|---|---|
| Panel que pinta params | `DeviceConfigPanel.jsx:69` (`setParams({...selectedNode.data.params})`) | ⚠️ muestra lo guardado |
| Mappers dispositivo→solver | `DiagramOptimizationPanel.jsx:18-76` | ⚠️ descarta o **fija** valores |
| Persistencia de params | `diagramSlice.js:108-111` (`updateNodeParams`) | ✅ correcto |
| Normalización legacy del diésel | `model_builder.py:223-246` | ✅ funciona (el motor usa Willian + sitio) |
| `fuel_price_applied` (eco del precio) | `model_builder.py:135` | ✅ precedente a generalizar |
| Arrastre fluido del lienzo | `useNodesState`/`useEdgesState` + `onNodeDragStop` (AGENTS.md) | ✅ **no tocar el patrón** |
| Instrumentación de rendimiento | `Backend/services/perfMetrics.js` | ✅ reutilizable |
| Precedente de invariante | `test_protocolo_version.py` (v1 congelada / v2 idéntica) | ✅ patrón a seguir |

---

## 2. Alcance (4 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **12.1** | **Esquema de topología** | `optimization/solver/topology_schema.json`: por tipo → params aceptados, obligatorios, y qué hace el solver si falta. Fuente única para validar en las dos capas |
| **12.2** | **Cobertura del mapper + pre-flight** | test invariante (todo param de `defaultParams` tiene camino al job o está en `PARAMS_SOLO_UI` con motivo) + validación **en el lienzo** antes de enviar (marca el nodo y el motivo) |
| **12.3** | **Error atribuido + `device_echo`** | el solver valida contra el esquema; el resultado trae `device_echo` por dispositivo (`modelado`/`ignorado`/`error` + motivo + **parámetros efectivos**) y la UI **señala el nodo** |
| **12.4** | **Arreglo del `100` + unifilar base** | migración de params guardados (legacy→Willans/sitio) + valor **efectivo** visible + **barra AC** + **símbolos SVG** (F6.1/F6.2) con la fluidez medida |

---

## 3. Contrato

### 3.1 `topology_schema.json` (nuevo)

```json
{
  "diesel": {
    "params": {"max_kw": {"req": true}, "min_kw": {"req": true},
               "cost_a": {"req": false, "default": null},
               "cost_b": {"req": false, "default": null},
               "cost_c": {"req": false, "default": null},
               "fuel_cost": {"req": false, "default": "site"},
               "ramp_kw_per_h": {"req": false, "default": null},
               "start_cost_cop": {"req": false, "default": null},
               "stop_cost_cop": {"req": false, "default": null}},
    "if_missing": {"fuel_cost": "usar sitio + eco", "ramp_kw_per_h": "sin rampa + warning"}
  },
  "inverter": {"soportado": false, "motivo": "F2 (cambio 13)"}
}
```

### 3.2 `device_echo` (en el resultado)

```json
"device_echo": [
  {"device_id": "diesel_1", "tipo": "diesel", "estado": "modelado",
   "params_efectivos": {"cost_a": 0.0012, "cost_b": 0.24, "cost_c": 1.8,
                        "fuel_cost": 2782.0, "fuel_origen": "sitio"}},
  {"device_id": "inv_1", "tipo": "inverter", "estado": "ignorado",
   "motivo": "tipo sin modelo en el solver (ver cambio 13)"}
]
```
**Regla**: `device_echo` cubre **todos** los dispositivos del diagrama. Ninguno ausente.
`estado ∈ {modelado, ignorado, error}`; si no es `modelado`, `motivo` es obligatorio.

### 3.3 `PARAMS_SOLO_UI` (frontend, declarado)

Lista explícita de claves de `defaultParams` que **no** van al solver, **cada una con su motivo**
(p. ej. `metric`, `interval` del nodo sensor; `voltage` del grid si no entra al modelo). Sin esta
lista, el test de cobertura falla.

---

## 4. Líneas a tocar (declaradas una a una)

| # | Archivo | Acción |
|---|---|---|
| 1 | `optimization/solver/topology_schema.json` | **nuevo** |
| 2 | `optimization/solver/model_builder.py` | validar contra el esquema + construir `device_echo` + `warnings` por dispositivo |
| 3 | `Frontend/.../diagram/DiagramOptimizationPanel.jsx` | **pre-flight** (marca nodos) + enviar `sensor_mappings` y (F4) `connections` sin cambios de forma |
| 4 | `Frontend/.../diagram/constants/deviceTypes.js` | `PARAMS_SOLO_UI` + `migrateParams()` (legacy→Willans, `fuelCost:null`) |
| 5 | `Frontend/.../diagram/components/DeviceConfigPanel.jsx` | valor **efectivo** visible + origen + aviso de migración; **sin tocar** el patrón de estado local |
| 6 | `Frontend/.../diagram/nodes/*` | símbolos SVG + barra AC (F6.1/F6.2) — **presentacional**, `nodeTypes` fuera del componente |
| 7 | `optimization/tests/test_mapper_coverage.py` | **nuevo** (invariante frontend↔solver) |
| 8 | `optimization/tests/test_topology_schema.py` | **nuevo** (cada tipo del esquema ↔ reconocido por el solver) |
| 9 | `integracion_plataforma/README.md` | fila del cambio 12 |

**No se toca**: el motor de despacho (F2–F4 lo amplían), la banda (06), la calibración (09), el
precio del sitio (11), ni el patrón de arrastre del lienzo.

---

## 5. Criterios de cierre — verificables EJECUTANDO

- [ ] **C1 · El `100` desaparece**: abrir el diagrama guardado → diésel con `a1=0.24`, `a0=1.8`, precio
  **vacío** y texto *"efectivo: 2,782 COP/L — sitio Pasto, vigencia 2026-10"*; guardar, reabrir y que
  **no vuelva** a `100`.
- [ ] **C2 · Round-trip del valor (la garantía)**: editar el precio a `3000` → el **job** lo lleva y el
  **eco** dice `fuel_origen: "nodo", fuel_cost: 3000`; borrarlo → `fuel_origen: "sitio", 2782`.
- [ ] **C3 · Invariante de cobertura**: `pytest tests/test_mapper_coverage.py` → PASA. **Prueba de
  fuego**: añadir temporalmente una clave nueva a un `defaultParams` sin mapearla → el test **FALLA**
  (se demuestra y se revierte).
- [ ] **C4 · Invariante del esquema**: `pytest tests/test_topology_schema.py` → PASA (todo tipo del
  esquema es reconocido por el solver).
- [ ] **C5 · Pre-flight visible**: un diagrama con un **inversor** (aún sin modelo) → el lienzo marca
  ese nodo con el motivo **antes** de lanzar; el job se envía igual y el eco lo reporta `ignorado`.
- [ ] **C6 · Error atribuido**: forzar un job con un dispositivo sin modelo → el resultado trae el
  `device_id` y el motivo, y la UI **señala ese nodo** (no un error genérico).
- [ ] **C7 · `device_echo` completo**: en un diagrama con N dispositivos, el eco tiene **N entradas**
  (comparar `len(device_echo) == nº de dispositivos enviados`).
- [ ] **C8 · FLUIDEZ (requisito duro)**: FPS durante arrastre sostenido (200 frames) **≥ línea base
  − 5 %** y **el contador de renders del canvas NO sube al arrastrar**. Reportar los dos números.
- [ ] **C9 · El editor no pierde nada**: añadir, editar, doble clic → modal, guardar y reabrir un
  diagrama viejo → sin pérdida de nodos ni reordenamiento.

---

## 6. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El pre-flight **bloquee** el envío por un falso positivo | el pre-flight **avisa y marca**, no bloquea; el solver decide y lo reporta |
| 2 | El `device_echo` infle el payload | solo ids, estados y params **efectivos** (no series) |
| 3 | La migración de params **pise** un valor puesto a propósito | migrar **solo** con coincidencia **exacta** con la tupla legacy conocida |
| 4 | El rediseño degrade la fluidez | las 6 reglas del plan (§F6.2) + C8 medido, no opinado |
| 5 | `nodeTypes` dentro del componente (error clásico de React Flow) | regla explícita: **constantes de módulo** |

---

## 7. Fuera de alcance (declarado)

| tema | dónde va |
|---|---|
| Modelo del inversor, transformador, switches | cambios **13, 14, 15** |
| Flujo por potencia y vista dual | cambio **16** |
| AC-OPF / flujo de carga | fase futura separada (no simulable con el solver actual) |
| Re-validación de experimentos | bloque final de validación (diferido) |

---

## 8. Fila para la tabla de `integracion_plataforma/README.md`

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **12** | `cambio_12_cadena_confianza/` | Cadena de confianza del diagrama (esquema + pre-flight + error atribuido + `device_echo` + invariantes) + arreglo del `100` + unifilar base (barra AC y símbolos) | 🟡 Spec v1 · sin implementar · **prerrequisito de 13–16** |

---

## 9. `reference/`

Sin artefactos de datos nuevos (spec de arquitectura). Ver `reference/README.md` para el manifiesto
(sha256) y los documentos que esta spec cita.

> **DECISIÓN DEL AUTOR (2026-10-11) — confirmada**: la microrred arranca con la topología **actual
> (AC, sin bus DC)** y **todo lo nuevo es opt-in**: con los defaults declarados aquí, **los resultados
> anteriores no cambian**. Confirmados: `bus_dc: false` · `switch_mode: "operador"` ·
> **frontera AC-OPF aceptada** (tensión/impedancia no se simulan) · vista dual `Esquema`/`Editor` ·
> `η` del inversor **declarable** (`null` si no se declara, sin inventar). **Nada queda bloqueado.**
