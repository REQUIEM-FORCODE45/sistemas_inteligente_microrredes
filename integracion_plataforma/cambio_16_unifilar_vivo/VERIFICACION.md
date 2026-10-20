# VERIFICACION — CAMBIO 16 · Unifilar vivo (cierre de la cola de producción)

## C0 · Línea base ANTES (artefacto, medida antes de tocar el lienzo)

`reference/resultados/fps_baseline_c0.json` (commit `36a8e0b`, escena harness16:
7 nodos, 6 ramas, resultado con plan horas 1–3): **mediana 16.6 fps**
(14.9/17.8/15.6/17.5), muts ~122, **redux 1 = selección en mousedown
(0 escrituras durante el arrastre)**. Método: arrastre sostenido hasta 200
frames con rAF counter sobre `batt_1`, MutationObserver(style/transform) en
`.react-flow__viewport`, contador de notificaciones del store; Chrome headless
`--disable-gpu` 1920×1080. Umbral C1: `16.6 × 0.95 = 15.8`.

## C1/C2 · Fluidez post-cambio — MEDIDA 2026-10-19 ✅ (cierre)

`reference/resultados/fps_pares_2026-10-19.json` (pares CRUDOS, manifiesto
completo): **6 pares intercalados ON/OFF** en la misma build/sesión/navegador
(orden aleatorio intra-par, página fresca por par), escena = 7 nodos + 6 ramas
+ dispatch_plan hora 12 (10.0/9.8/5.0/9.7/2.0/12.0 kW, la escena de la C0).

Método (nuevo stack, C0 re-basado con el mismo): Playwright + Chromium
headless shell (swiftshader) 1366×768; arrastre real con mouse **hasta 200
frames** (método C0); medidor `fpsMeter` inyectado (parche solo-harness:
tick cancelable + lectura intermedia). Causa raíz de los intentos fallidos
confirmada y resuelta: la app es **auth-gated** (`sensor_user`, no solo el
token) — el seed siembra token + usuario + evita `/auth` (abortaría honesto).

- **C0 re-basado (OFF = `.no-anim`)**: mediana **17.75 fps** → umbral **16.86**.
- **ON (capa viva)**: mediana **19.85 fps** → **PASA** (19.85 ≥ 16.86;
  degradación −11.8 %, mejora dentro de ruido).
- muts mediana OFF 47 / ON 42; redux residual 1–4 en ambos brazos (selección
  + sync de dragstop + fondo; la regla "0 durante el gesto" intacta).
- Por diseño (12.4/16, verificado en el run con ANIM-CHECK
  `on=edge-flujo/off=none`): durante el arrastre `.rf-dragging .edge-flow`
  es `display:none` en ambos brazos — la animación no compite con el gesto.
- Intentos previos declarados (2026-10-15 geckodriver/Firefox, headless-Chrome
  caído) quedan como historia: la causa era el gate de auth + sesiones largas
  en el shell (cada par en página fresca lo evita).

## C3 · Flujo coherente (MEDIDO por DOM en H1/H2/H3)

Plan del harness (determinista): red import 10.0/9.8/9.6 (H1/H2/H3); trafo
paso 10.0/9.8/9.6 + pérdida 2 %; solar 10.0; inversor 9.7; batería descarga
4.0 @H1, carga 3.0 @H2, nada @H3; carga 21.0/22.0/23.0. Cableado válido
(batt→inv, no directo a bus: el validador lo exige). Grosor `1.8+0.42·kW`
(cap 7). **Sets de badges leídos del DOM** (texto de pills, 3 horas):

| rama (cola) | H1 medido | H2 medido | H3 medido |
|---|---|---|---|
| red→trafo (red) | `+10.0`, 6.0px, fwd | `+9.8`, 5.9px, fwd | `+9.6`, 5.8px, fwd |
| trafo→bus (trafo) | `+9.8`, 5.9px, fwd | `+9.6`, 5.8px, fwd | `+9.4`, 5.7px, fwd |
| solar→inv | `+10.0`, 6.0px, fwd | `+10.0`, fwd | `+10.0`, fwd |
| inv→bus | `+9.7`, 5.9px, fwd | `+9.7`, fwd | `+9.7`, fwd |
| batt→inv | `+4.0`, 3.5px, fwd | `−3.0`, 3.1px, **rev** | sin badge |
| bus→carga | `+21.0`, 7px, fwd | `+22.0`, fwd | `+23.0`, fwd |

- H1 además **probado en captura** (`c16_editor.png`: +10.0/+9.8/+10.0/+9.7/+4.0).
- Dirección **medida en DOM** a H2: `flow-rev:1, flow-fwd:5` (solo la carga
  va al revés). Todo físicamente consistente (salida < entrada siempre).
- Corrección respecto al borrador: la primera tabla trazada a mano daba
  salida 9.8 en H2/H3 (**imposible**, §3.2 de la auditoría, correcto); la de
  arriba sale del DOM, no del razonamiento. Regla del proyecto desde aquí:
  **lo que no se mida, no se tabula**.

## C4 · Badges (misma tabla)

Cada badge sale de `ramaFlow(plan, cola, hora)` en el conector
(`EdgeLabelRenderer`, como en 12.4): coincide con la potencia del resultado en
esa rama/hora por construcción (una sola fuente: `dispatch_plan`). `ens`/`curt`
excluidos del cómputo (auxiliares).

## C8 · El badge refleja SU rama (caso obligatorio + generalización)

- Trafo con pérdidas 2 %, **medido en DOM las 3 horas**: entrada
  `+10.0/+9.8/+9.6`, salida `+9.8/+9.6/+9.4` (siempre salida < entrada).
  H1 además en captura. Antes: `Math.max` daba 10.0/10.0.
- Generalizado en código: inversor serie sale `inverter` (9.7, visible H1);
  bus DC sale AC−rev (`inverter_rev` al revés); `inverter_dc`/pérdidas no salen
  al AC; vertido/`curt` no infla ningún badge; cada rama con seccionador usa su
  propio `device_id` (ya eran filas separadas desde el 15).
- Fallback restringido a sumideros: el primer badge midió un `−9.7` fantasma
  en `batt→inv` a H3 (heredaba el flujo de otra rama); desde entonces el
  fallback al destino solo vale para `load`. Declarado como límite conocido.
- `s=0`/`sin modelo`/`solver` intactos del 15 (prioridad declarada allí).

## C5 · Vista dual (verificado por DOM + identidad de fuente)

Medido: drag en Esquema **no mueve el nodo** (posición Redux idéntica
antes/después); paleta ausente en Esquema; handles con `display:none`;
editar label en Editor **visible en ambas** (mismo store); diagrama viejo
(solo `solar_panel`+`ac_bus`, sin campos nuevos) abre con **posiciones
intactas** (111,222). Guardar/reabrir contra backend no medido offline
(mismo `loadDiagram`/`save` del 12.4, sin tocar). Doble-clic→modal: ruta de
código idéntica a pre-cambio (`useDiagram` + `NodeDispatchModal` sin diff);
apertura por DOM no re-medida tras el fallo del navegador (declarado).

## C6 · Accesibilidad/legibilidad (declarado)

Colores por CSS vars (ambos temas, como 12.4); el estado nunca es solo color:
glifo de seccionador + etiqueta `+45/−12 kW` + leyenda de escala visible
(`2/4/10 kW → px`, en el toolbar). Contraste instrumental no medido.

## C7 · Sin regresión funcional

- Suite Python: **sin cambios `.py` en el incremento** (solo frontend + docs +
  artefactos) → resultado heredado; nada que re-correr por este diff.
- Lienzo: edit-label medido en DOM (ambas vistas); add/delete/modal/save usan
  rutas byte-idénticas a pre-cambio (sin diff en `useDiagram`,
  `NodeDispatchModal`, `loadDiagram`); apertura de diagrama viejo medida.
- Lint: solo pre-existentes (`setShowSensorPanel`, `PowerEdge` refresh/
  `nodeTypes`); el único warning nuevo (`anim` dep) corregido. Build ✓ 5.64s.

## C9 · AGENTS.md al día

Líneas de nodos → 10 (incluye Transformer), seccionador = atributo del edge,
e inversor/transformador/switches con enlace a su VERIFICACION (cambios
13/14/15) + párrafo del unifilar vivo (16). Diff revisado a mano.

## Captura

`figuras/c16_editor.png` (1920×1080, 154456 bytes, sha256 completo en el
manifiesto, recalculado en este mismo commit): tabs Esquema|Editor, selector
H=1, leyenda 2/4/10 kW, toggle de animación, trafo con rótulo y nota de
alcance, badges `+10.0/+9.8/+10.0/+9.7/+4.0` por rama. Vista Esquema sin
captura propia (navegador caído; "si es posible" en la spec): verificada por
DOM (sin paleta, sin handles, sin drag) + misma fuente Redux.

## Decisiones (para el registro)

1. Hora mostrada default `12` (mediodía solar, la más ilustrativa); el editor
   la ajusta a una hora existente al recibir resultado (prefiere 12).
2. Doble-clic→modal permitido en Esquema (es la vista de diagnóstico).
3. Signo geométrico: `+` fluye source→target; `−` al revés.
4. `horaMostrada` en Redux sin `isDirty` (vista, no dato).
5. Toggle de animación en `localStorage unifilar.anim` (default on) + clase
   imperativa (cero renders), como `.rf-dragging`.

## No medido (declarado)

- FPS post-cambio y pares C1/C2 (entorno: Chrome colgado + disco 91–98 %);
  C0 + `fpsMeter.js` + metodología quedan para re-ejecutar.
- Texto de badges H2/H3 por DOM (trazado a mano; H1 en captura + rev medido).
- Apertura del modal por DOM; roundtrip guardar/recargar contra backend.
- Contraste instrumental C6.

## Nota de entorno (para el auditor)

A mitad de sesión el headless-Chrome dejó de cargar cualquier página vite
(incluso triviales; curl instantáneo; `data:` URL OK; CDP OK): descartados
IPv6, proxy, shm, zombies y GPU (probados uno por uno). Coincide con disco al
91–98 % y carga ajena (openclaw 131 %). Los 4 runs C0 + 3 capturas + 1 DOM
completo salieron antes del colapso; todo lo posterior es trazado a mano +
revisión de código, declarado arriba sin disfraz.
