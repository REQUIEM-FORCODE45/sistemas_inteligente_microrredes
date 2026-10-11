# PLAN — CAMBIO 16 · UNIFILAR VIVO (F6.6/F6.7) + MEDICIÓN DE FLUIDEZ
### flujo por potencia · badges en el conector · vista dual — sin perder un frame

> **Naturaleza**: especificación para el repositorio. Vive en `C:\Users\2D\tesis-microrred\docs\` y se
> copia como `integracion_plataforma/cambio_16_unifilar_vivo/README.md`.
> **Estado**: propuesta · **Clasificación**: 🖥️ PRODUCCIÓN · **Depende de**: cambios 12–15.
> **Origen**: petición del autor: *"quiero algo más unifilar pero sin perder la modernidad… al hacer el
> cambio visual debes mantener el funcionamiento actual que es fluido"*.

---

## 0. Objetivo

Cerrar el rediseño del lienzo convirtiéndolo en un **unifilar vivo**: que se **vea** por dónde va la
energía y **cuánta** en la hora mostrada, y que el mismo lienzo sirva para **diagnosticar** (esquema)
y para **editar** (editor) — **sin degradar la fluidez** que hoy tiene el editor.

---

## 1. Estado de partida (tras el cambio 12)

| pieza | estado |
|---|---|
| Barra AC + derivaciones ortogonales | ✅ del cambio 12 (F6.1) |
| Símbolos SVG (generador, panel, red, batería, carga) | ✅ cambio 12 (F6.2) |
| Símbolos de inversor/bus DC, trafo y switch | ✅ cambios 13, 14, 15 (F6.3–F6.5) |
| Flujo por potencia, badges en conector, vista dual | ⬜ **este cambio** |
| Línea base de FPS medida | ⬜ **obligatoria antes de tocar** (C0) |

---

## 2. Alcance (3 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **16.1** | **Flujo por potencia** | grosor de rama ∝ \|kW\| (escala declarada) + **animación direccional** por sentido (import/export, carga/descarga) sobre el `dispatch_plan` real |
| **16.2** | **Badges en el conector** | píldora con `+45 kW` / `−12 kW` **en el punto de unión** (no en la tarjeta), tomada del resultado |
| **16.3** | **Vista dual** | selector `Esquema` \| `Editor` sobre el **mismo** estado: unifilar para operar/diagnosticar, tarjetas para editar |

---

## 3. Requisito DURO: la fluidez no se degrada

El editor es fluido porque el arrastre usa **estado local** (`useNodesState`/`useEdgesState`) y Redux
solo se sincroniza al soltar. Reglas **obligatorias** (del plan maestro §F6.2):

| # | Regla | Verificación |
|---|---|---|
| 1 | **Cero escrituras a Redux durante el arrastre** | el contador de renders de Redux no sube al arrastrar |
| 2 | **`nodeTypes`/`edgeTypes` como constantes de módulo** (fuera del componente) | revisión de código + FPS estable |
| 3 | **Nodos/edges memoizados**; dependencias estables en `useCallback` | FPS |
| 4 | **Animación en CSS/SVG** (`stroke-dashoffset`), sin estado de React por frame | el contador de renders no sube durante la animación |
| 5 | **Grosor y badges calculados UNA vez** al recibir el resultado (memo por `latestResult`) | renders tras un resultado nuevo: acotados, no por frame |
| 6 | **Sin librerías de animación** con bucle propio | bundle y hilo principal |

---

## 4. Líneas a tocar (declaradas una a una)

| # | Archivo | Acción |
|---|---|---|
| 1 | `Frontend/.../diagram/*` | `EsquemaNode`/`EsquemaEdge` (presentacionales, memoizados) + constantes de tipo de módulo |
| 2 | `Frontend/.../diagram/DiagramCanvas.jsx` | selector `Esquema`\|`Editor` (misma fuente de nodos/edges) |
| 3 | CSS del lienzo | animación de flujo (`stroke-dashoffset`), clases por sentido y por umbral de kW |
| 4 | `Frontend/.../diagram/*` | badges de potencia en el conector (lectura del resultado) |
| 5 | `Frontend/.../diagram/debug/fpsMeter.js` | **nuevo**: contador de FPS (200 frames) + contador de renders, activable en modo debug |
| 6 | `integracion_plataforma/cambio_16_unifilar_vivo/VERIFICACION.md` | **línea base vs después** (los dos números) |

---

## 5. Criterios de cierre — verificables EJECUTANDO

- [ ] **C0 · Línea base ANTES**: medir y **guardar** FPS (arrastre sostenido, 200 frames) y nº de
  renders del canvas con el editor actual. **Sin este número no se puede cerrar el cambio.**
- [ ] **C1 · FPS**: después del rediseño, **FPS ≥ línea base − 5 %**. Reportar ambos valores.
- [ ] **C2 · Renders**: durante el arrastre, el contador de renders **no sube**; durante la animación
  de flujo, **tampoco**.
- [ ] **C3 · Flujo coherente**: el grosor y el sentido de cada rama coinciden con el `dispatch_plan`
  de la última corrida (comparar 3 horas al azar, a mano).
- [ ] **C4 · Badges**: el valor del conector coincide con la potencia del resultado en esa rama/hora.
- [ ] **C5 · Vista dual**: `Esquema` y `Editor` muestran el **mismo** diagrama; editar en uno se ve en
  el otro tras guardar; un diagrama viejo se abre sin pérdida de nodos ni reordenamiento.
- [ ] **C6 · Accesibilidad/legibilidad**: contraste suficiente con el tema claro y oscuro; el color no
  es el **único** indicador de estado (hay símbolo/etiqueta).
- [ ] **C7 · Sin regresión funcional**: añadir, editar, doble clic → modal, guardar, reabrir: todo
  igual que antes.

---

## 6. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El rediseño vuelve el lienzo pesado | C0/C1/C2 medidos; reglas 1–6 obligatorias |
| 2 | La animación cansa o distrae | intensidad declarada y **desactivable** en el panel |
| 3 | Dos vistas divergen | **una sola** fuente de estado; la vista es solo capa de dibujo |
| 4 | El grosor por kW inventa una escala | escala **declarada** y visible (leyenda) |

---

## 7. Fuera de alcance

| tema | dónde |
|---|---|
| 3D, mapas, animaciones decorativas | no aportan a la tesis (declarado) |
| Vista de flujo de potencia eléctrico | requiere AC-OPF (fase futura separada) |

---

## 9. `reference/`

Sin artefactos de datos nuevos (spec de arquitectura). Ver `reference/README.md` para el manifiesto
(sha256) y los documentos que esta spec cita.

> **DECISIÓN DEL AUTOR (2026-10-11) — confirmada**: la microrred arranca con la topología **actual
> (AC, sin bus DC)** y **todo lo nuevo es opt-in**: con los defaults declarados aquí, **los resultados
> anteriores no cambian**. Confirmados: `bus_dc: false` · `switch_mode: "operador"` ·
> **frontera AC-OPF aceptada** (tensión/impedancia no se simulan) · vista dual `Esquema`/`Editor` ·
> `η` del inversor **declarable** (`null` si no se declara, sin inventar). **Nada queda bloqueado.**
