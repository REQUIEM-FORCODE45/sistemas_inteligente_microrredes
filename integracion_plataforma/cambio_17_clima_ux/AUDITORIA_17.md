# AUDITORÍA — CAMBIO 17 (clima como producto) + cierre de P7

> Ejecutada por quien especifica, sobre **`8b4c463`**. Fecha: 2026-10-21.
> **Nota de proceso**: el autor confirma que **encargó este cambio directamente** al implementador, igual
> que la decisión de quitar los códigos `A#` de la UI. Por eso **no hubo spec previa** y el `README.md` de
> la carpeta es **descriptivo (post-hoc)**. Se acepta, y se deja escrito: cuando el autor encarga directo,
> el auditor se queda sin spec contra la que medir, y el README pasa a ser el contrato de facto.

---

## 1. Veredicto

**Aprobado.** Y **P7 queda cerrado de verdad**: el criterio 10 (espejo Mongo) ya no es un "no hay Mongo
local" sino una medición — `reconstruirEspejo()` → **`{total: 34, ok: 34, fallo: 0}`**.

Lo que más vale del cambio no es el acabado visual: es que **reutiliza el método del cambio 16** para
medir (Playwright + sembrar `sensor_token` y `sensor_user`, la causa raíz que costó dos intentos fallidos)
y que **elimina el `catch` mudo** del mapa, sustituyéndolo por tres estados distinguibles. Eso es la
cadena de confianza del cambio 12 aplicada a la UI del clima.

---

## 2. Verificado aquí

| Prueba | Resultado |
|---|---|
| Manifiesto de las 2 capturas | ✅ **los 2 sha256 coinciden** con el blob de git (`7f852b82…`, `790fe3f1…`) |
| `test_manifiestos_reference` | ✅ PASS (las capturas nuevas están declaradas) |
| `test_validacion_json` (los dos) | ✅ PASS |
| Captura de escritorio (lectura visual) | ✅ **sin** texto de desarrollador ni códigos `A#`; hero `MODO VIGENTE DEL PACÍFICO · El Niño · RONI 1.69 · ONI 2.16`; chip *"sincronizado ahora mismo"*; toolbar por gráfico; títulos humanos (*"Oscilación del Pacífico: ONI y RONI"*, *"Cajas Niño 1+2/3/3.4/4"*, *"Índices de contexto: SOI"*) |
| `VERIFICACION_MVP.md` del cambio 05 | ✅ la **frase contradictoria corregida**: ahora dice que se midió en el 17, con los números y el enlace |
| P7 en `PENDIENTES_MPC_ESTADO.md` | ✅ **cerrado** con la medición del espejo |
| Cifras del VERIFICACION | ✅ coherentes entre sí (V1–V6 con dimensiones, V3 con contenedores constantes en 5 recargas, V6 con los 3 estados del mapa) |

---

## 3. Hallazgos (ninguno bloquea)

### 3.1 🟡 El espejo Mongo no tiene artefacto

`{total: 34, ok: 34, fallo: 0}` vive **solo en el `VERIFICACION.md`**. Es exactamente el patrón que ya nos
costó una corrección en el cambio 15 (el hash `a76c0828` que solo existía en prosa). La cifra es la que
**cierra P7**, así que merece un JSON versionado (o un `console.log` capturado a archivo) con su sha256.

### 3.2 🟡 El `build` de 2,64 s **no es comparable** con los 18,35 s anteriores

Es un build **incremental con caché de Vite**; el de 18,35 s era limpio. El `VERIFICACION` lo presenta
como *"(antes: 18.35 s auto-reportado)"*, lo que invita a leer "mejoró 7×" cuando no se midió lo mismo.
Correcto sería decir *"build incremental ✓ 2,64 s (el limpio de referencia es 18,35 s)"*.

### 3.3 🟡 El build del mapa **no se corrió** (declarado)

`GET /climate/geo/build/status` → `idle`, con la nota de que tarda **30–60 min con 429**. Es honesto y
suficiente: se validó el **endpoint + estado**, no el artefacto final. Queda como lo que es — un camino
medido a medias, declarado.

### 3.4 ⚠️ Detalle visual menor (lectura de la captura)

Las **toolbars grises de los gráficos se superponen** a la esquina superior derecha de las series, y el
eje X con 76 años (1950–2026) queda denso. Nada roto; si molesta, un `margin` superior en el layout de
Plotly y ticks cada 10 años lo resuelven. No es criterio de este cambio.

---

## 4. Relación con el resto

- **No toca** el solver, la calibración, la topología ni el unifilar → los cambios 06–16 y el bloque de
  validación quedan intactos.
- **Cierra P7**, con la salvedad del artefacto (§3.1).
- **No cubre P8** (deriva plan→realidad del Exp D), que sigue esperando un diagrama conectado en el lazo.

## 5. Lo que pido para cerrar el 17

1. Versionar el resultado del espejo Mongo como artefacto (§3.1).
2. Reescribir la línea del build para que no se lea como una mejora de 7× (§3.2).

Nada más. El cambio, tal como está, se puede usar y citar.
