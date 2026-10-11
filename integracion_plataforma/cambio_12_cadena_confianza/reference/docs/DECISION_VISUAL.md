# Decisión visual — unifilar, VARIANTE B

> **Decidida por el autor el 2026-10-11.** Aplica al alcance **12.4 (barra AC + símbolos SVG de los dispositivos existentes)**.

## Qué se eligió

La **variante B** del mockup (`figuras/unifilar_variantes.html`, comparación A/B):
**se conserva el lenguaje visual actual del editor** (tarjetas redondeadas, iconos `lucide`,
bordes y sombras del tema) y **la topología pasa a unifilar**:

- **Barra AC** como bus horizontal con etiqueta `BUS AC · 220 V · 60 Hz` (**arriba**; la
  generación cuelga de ella).
- **Tarjetas por dispositivo** con un **filete de color de categoría** en el borde superior.
- **Símbolos propios** (`figuras/simbolos.svg`): red, panel, diésel, inversor, transformador,
  batería, carga, **seccionador cerrado y abierto**.
- **Flujo por potencia**: el trazo de cada rama es **proporcional a los kW** (red 6 px @ 10 kW,
  PV 3.5 px @ 4 kW, batería 2.5 px @ 1.5 kW) y lleva **una capa `class="flow"` animada**.
- **Badges de potencia en el conector** (no en la tarjeta), con flecha de sentido `▲`/`▼`.
- **Estado del seccionador visible**: `● conectada`, `○ apagado`, y la rama abierta dibujada
  **tenue y discontinua** con la marca `s=0` → se ve que **no conduce**.

## La animación de flujo (y por qué no rompe la fluidez)

Es **CSS puro**: `stroke-dasharray` + `@keyframes` sobre `stroke-dashoffset` (y
`@media (prefers-reduced-motion: reduce)` para desactivarla). Corre en el **compositor**, no en el
hilo de React: **no** hay estado de React por frame ni re-render del lienzo. Es la regla 4 del
plan de fluidez, ya cumplida por construcción.

## Cómo está construido el SVG (para copiarlo, no reinventarlo)

`figuras/unifilar_variante_b.svg` es **autocontenido** y **vectorial**:
- define sus **9 símbolos** en `<defs>` y los usa con `<use href="#s-...">`;
- define sus **variables con fallback claro/oscuro** (`--card/--border/--foreground` y los acentos
  `--pv/--grid/--die/--bat/--load/--trafo`), así funciona dentro de la app (tema) y fuera de ella;
- el **grosor** de cada rama y el **color** de cada acento están en el propio SVG: son la
  referencia de proporción, no un valor a inventar.

## Los 4 puntos de decisión

| # | Punto | Decidido |
|---|---|---|
| 1 | Variante | **B** (tarjetas + flujo vivo) |
| 2 | Posición de la barra | **arriba**, con la generación colgando |
| 3 | Seccionadores | **visibles** en el lienzo; **clicables** cuando llegue el cambio 15 |
| 4 | Inversor y transformador | en el dibujo; su **modelo** llega en los cambios 13 y 14 (hasta entonces el eco los reporta) |

## Lo que hay que respetar al implementarlo

Las **6 reglas de fluidez** del plan (`PLAN_AMPLIACION_MODELO_ELECTRICO.md`, §F6.2) — en especial:
`nodeTypes`/`edgeTypes` **constantes de módulo**, **cero** escrituras a Redux durante el arrastre,
y la **medición de fluidez** obligatoria con línea base (cambio 16, C0/C1/C2).

El balance de la referencia **cierra exacto**: `PV 4.00 + Red 10.00 + batería (1.55 DC × η 0.97 =
1.50 AC) = 15.50 kW` → carga 15.50 kW (el trafo aparece **sin pérdidas declaradas**,
con su aviso, según el contrato del cambio 14).
