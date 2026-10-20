# PLAN DEL BLOQUE DE VALIDACIÓN (V1–V8) — arranque

> Escrito por el autor de la tesis el 2026-10-19, **con la cola de producción 06–16 cerrada**.
> La validación es lo **único** que queda: los 11 incrementos están implementados y auditados, y el
> motor ya incluye inversor (13), transformador (14), switches (15) y el unifilar vivo (16).
> Este documento decide **qué se corre, en qué orden, con qué criterio y qué artefacto sale** de cada
> cosa. Ningún objetivo de aquí cambia el código: solo mide lo que ya existe.

---

## 0. Regla de oro de este bloque

1. **Comparaciones justas**: mismo periodo, mismo decode, mismos baselines. Si algo cambia, se cambia
   **una** cosa y se declara.
2. **Ninguna cifra a mano**: toda cifra sale de un artefacto versionado (CSV/JSON con sha256 en el
   manifiesto). Lo que no se mida, se declara — no se tabula.
3. **Append-only**: cada corrida crea versión nueva; no se sobrescribe nada (incluidas las corridas
   que salgan mal: se archivan como evidencia).
4. **Dato faltante = `null`/warning declarado**, nunca un `0` inventado.
5. Si un criterio falla, **no se ajustan números para que pase**: se reporta el resultado real.

---

## 1. Por qué hay que validar (y qué puede cambiar)

Los cambios 13–15 **modificaron el modelo físico** que corre el solver:
- **13 (inversor)**: el PV efectivo en AC cae ~3 % (η = 0,97) → **los ExpA/ExpA2 publicados son
  anteriores a esto** y no son reproducibles con el job nuevo.
- **14 (transformador)**: pérdidas en el balance sobre la rama de red + tope `S_max·pf`.
- **15 (switches)**: topología **elegible**. En modo `impuesta` (default) los resultados deben ser
  **idénticos** a los anteriores — y eso es verificable por `sha256`.

**Conclusión**: antes de escribir el capítulo hay que saber **cuáles de las cifras publicadas siguen
en pie**. Eso es exactamente lo que hace la Fase 0.

---

## 2. FASE 0 — Barata, y decide si hay que reescribir cifras (≈1–1,5 h de cómputo)

Estas tres no buscan resultados nuevos: buscan saber **si lo ya publicado cambió**.

| # | Qué se corre | Qué decide | Coste |
|---|---|---|---|
| **V8a** | ExpA2 en modo `impuesta` **con el código actual** y **con el código pre-15** (worktree en `504e175`, el mismo método que ya se usó para el golden del C6) → comparar el **sha256 de la tabla de costos** | Aísla el efecto de los **switches**: con los defaults (`switch_mode: impuesta`, sin `connections`) el resultado debe ser **idéntico**. Si difiere, el 15 tocó algo que no debía | minutos |
| **V7** | **grid30 con y sin inversor** (mismas fechas, días, solver y periodo; única diferencia el inversor) + **par en isla** como contraste | Aísla el efecto del **inversor (13)**: el PV efectivo cae ~3 % por η. En isla el PV ya se vierte ~74 % → el delta debería ser ≈0: si no lo es, hay algo más que el inversor | ~30 min (2 corridas) |
| **V3** | **Sensibilidad de fuente PV** en los días con ENS (08-03, 08-05) | Si el ENS de esos días es artefacto de la fuente de PV o es real | 30–60 min |

> **Ojo con la comparación**: lo **publicado** (ExpA/ExpA2 en `results/`) es **anterior al inversor**,
> así que **no** puede ser el punto de comparación de V8a — con el job actual *no* dará el mismo sha, y
> eso es esperado. Cada fase compara **contra el código inmediatamente anterior al cambio que se prueba**
> (worktree), y el efecto del 13 se mide aparte en V7. Mezclar ambas cosas es cómo se fabrica un falso
> positivo.

**Salida de la fase**: una tabla de "cifras publicadas → ¿siguen válidas?" con el artefacto de cada
corrida. Si V8a da sha distinto, **parar y entender por qué antes de correr nada más**.

---

## 3. FASE 1 — El experimento central (el que mide el valor del S-MPC)

| # | Qué se corre | Qué responde | Coste |
|---|---|---|---|
| **V1** | **ExpA2 (14 d, isla)** con la **banda conformal C** del cambio 06 (87,5 % de cobertura / 4,26 kW) | ¿El S-MPC mejora al D-MPC con la banda correcta? (la banda B que se publicó no cubría lo que decía cubrir) | horas |
| **V2** | **Escenarios de red grid30 / grid10 / isla** con la banda C | ¿Cuánto vale el estocástico cuando hay red y cuando no? Es la pregunta que la banda corregida habilita | el más caro de los tres |

**Antes de lanzar V2**: presupuestar **horas**, no minutos. La sonda del 2026-10-12 mostró que
**1 día de grid30 no termina en < 280 s** con HiGHS; 3 días × 2 (S/D) ya roza los 30 min, y 14 días es
otra escala.

---

## 4. FASE 2 — Interpretación (no requiere corridas nuevas)

| # | Qué se hace |
|---|---|
| **V6** | Verificar que el **S-MPC se separa del D-MPC** con la banda real, sobre las trazas de V1/V2. Si no se separan, decirlo: una banda que no cambia la decisión no aporta valor, y eso también es un resultado |

---

## 5. FASE 3 — El programa en vivo

| # | Qué se mide | Requisito |
|---|---|---|
| **V5 (Exp D)** | Deriva **plan→realidad** entre ciclos, estabilidad entre ciclos consecutivos, y **pronóstico en vivo vs anclado** | El programa completo corriendo (sensores MQTT, Redis, Mongo, scheduler de 15 min). Es lo único que valida **el bucle**, no el experimento |

---

## 6. Lo que NO se hace (decidido, con motivo)

- **V4 — significancia estadística con ~35 días (p < 0,05)**: ~30–40 h de solver y el pareado actual en
  isla da **p = 0,206** (n insuficiente). Se **difiere** con la proyección documentada y el bootstrap
  IC95 % ya calculado **[−5.392, +1.282]** COP. No es un fallo del MPC: es falta de muestra, y se
  declara como tal.
- **Los 30 días en isla**: mismo motivo (potencia estadística), misma declaración.

---

## 7. Orden de ejecución y criterio de parada

```
FASE 0  →  V8a (sha256)  →  si difiere: PARAR y explicar
        →  V7 (grid30 ± inversor)  →  V3 (sensibilidad PV)
FASE 1  →  V1 (ExpA2 isla, banda C)  →  V2 (grid30/grid10/isla, banda C)
FASE 2  →  V6 (¿se separan S y D?)
FASE 3  →  V5 (Exp D, programa en vivo)
```

**Criterio de parada**: si V8a no da el mismo sha con el modo `impuesta`, **no se sigue**: significa
que un cambio de producción alteró los resultados y hay que encontrarlo antes de medir nada nuevo.

---

## 8. Qué se reporta en la tesis

| Sección del capítulo | Se alimenta de |
|---|---|
| Tabla de validación de correcciones (¿el modelo nuevo reproduce lo publicado?) | **Fase 0** (V8a, V7, V3) |
| Comparativa S-MPC vs D-MPC con banda real | **V1 + V6** |
| Valor del estocástico con/sin red | **V2** |
| Validación del lazo cerrado en operación | **V5** |
| Limitaciones (muestra insuficiente) | **V4 diferido** + los 30 días en isla |

---

## 9. Qué NO cambia en este bloque

Nada de código. Ni una línea del solver. Si una corrida falla, **se arregla el artefacto o se declara**,
no se toca el modelo. Los cambios 06–16 están cerrados y auditados: este bloque solo **mide**.

---

## 10. Plan de cómputo con HiGHS (decisión del autor: no se tramita licencia)

Gurobi no admite el modelo de 24 h (licencia size-limited: 2.094 columnas) → **todo corre en HiGHS**.
Ritmo medido: **~110 s/solve**. Presupuesto por corrida:

| Corrida | Solves | Tiempo |
|---|---|---|
| Un ExpA2 de 3 d × 2 estrategias | 144 | **4–6 h** |
| **V7** (3 d × 2 brazos × 2 estr) | 288 | **8–12 h** |
| **V3 era5** (3 d isla × 2 estr) | 144 | **4–6 h** |
| **V1** (14 d isla × 2 estr) | ~672 | **~20 h** |
| **V2** (grid30 + grid10 + isla, 3 d × 2 estr) | ~432 | **~13 h** |

### 10.1 Qué se puede paralelizar (y qué NO)

- ✅ **Entre combinaciones independientes**: `--modes` y `--strategies` son listas separadas
  (`nargs="+"`), y el bucle del experimento es `for mode … for strat …` → **cada par modo×estrategia es
  independiente**. Se puede lanzar un proceso por par, con **`--tag` distinto** para que no se pisen las
  salidas (`expA2_hourly_{tag}{mode}_{strat}.csv`).
- ❌ **Nunca por días.** El backtest propaga el **SOC real** de un día al siguiente
  (`run_day(..., initial_soc=)`). Trocear con `--start-date` **reinicia el SOC a 0,65** y **invalida el
  resultado** — es física de la batería, no un detalle de implementación. Una corrida de 14 días es
  **secuencial por diseño**.

### 10.2 La salida se escribe **al final** (riesgo real)

`expA2_daily.csv` / `expA2_hourly_*.csv` se escriben **al terminar** el proceso: si una corrida de 20 h
se corta en la hora 19, **no queda nada**. Para corridas > ~6 h hay que **añadir un checkpoint por día**
(volcar el `soc_carry` y las filas del día a medida que se completan). Eso **no toca el modelo**: es
robustez de ejecución, no física.

### 10.3 Orden recomendado (y por qué)

1. **Sonda de paralelismo** (5 min): un solve con 1 proceso/4 threads vs 2 procesos/2 threads. HiGHS no
   escala bien con threads en MIP; si 2×2 gana, el resto del plan baja de tiempo sin cambiar nada.
2. **V7 completo** (8–12 h, en paralelo 2 brazos): es **el que decide** si hay que rehacer cifras.
   Con **el mismo código** con y sin `converters` (no worktree pre-13), reportando costo **y** ENS **y**
   litros, más el par en isla como contraste.
3. **V3 brazo era5** (4–6 h, en paralelo con V7 si caben): comando ya escrito.
4. **Checkpoint** (si hace falta) y luego **V1**, después **V2**.

**En dos noches se puede tener todo.** El cuello no es el solver: es no perder el trabajo si se corta.

---

## 11. Alcance mínimo defendible (decisión del autor: esto es para la tesis, no para producción)

Las validaciones **no se corren para operar el programa**: son evidencia para el capítulo. Por lo tanto,
**cada corrida tiene que responder una pregunta que vaya al texto**, y se elige **la ventana más corta
que todavía responda**. Regla: si una corrida no cambia una frase del capítulo, no se corre.

| Pregunta del capítulo | Corrida mínima que la responde | Solves | Tiempo |
|---|---|---|---|
| ¿El **inversor (13)** movió las cifras publicadas? | **V7**: 1 día grid30, **mismo código** con/sin `converters`, 2 estrategias | 96 | **~3 h** |
| ¿Y en **isla** el delta es ≈0 (control)? | 1 día isla, 2 brazos, `smpc` | 48 | **~1,5 h** |
| ¿El ENS del **08-05** es artefacto de la fuente PV? (**V3**) | 1 día (08-05) isla, `era5` vs `mongo`, 2 estrategias | 48 | **~1,5 h** |
| ¿El **S-MPC se separa del D-MPC** con la banda C? (**V1 + V6**) | **3 días de estrés** (08-03/04/05) isla, banda C, 2 estrategias | 144 | **~4,5 h** |
| ¿Cuánto vale el estocástico **con red**? (**V2**) | 1 día `grid10` + 1 día `grid30`, banda C, 2 estrategias | 96 | **~3 h** |
| ¿Funciona el **lazo en vivo**? (**V5**) | operación real, sin corridas extra | — | reloj, no cómputo |

**Total ≈ 12–14 h de cómputo → ~5–6 h de reloj en paralelo (2–3 procesos). Una noche.**

### 11.1 Lo que este alcance permite afirmar (y lo que no)

- ✅ *"En la **ventana de estrés** (3 días con mayor déficit), con la banda corregida, el S-MPC reduce el
  ENS frente al D-MPC."*
- ✅ *"El efecto del inversor sobre el costo es **X %** en un día representativo de grid30, y ≈0 en isla."*
- ❌ *"En los 14 días del periodo completo…"* → **no se puede afirmar**, y hay que decirlo.
- ❌ Significancia estadística con p < 0,05 → sigue fuera (V4), ya declarado.

**Declararlo es lo que lo hace defendible.** Un jurado acepta "medí la ventana de estrés y aquí está la
tabla"; no acepta un "*se comporta mejor*" sin ventana ni número.

### 11.2 Lo que se gana al recortar

- Se elimina el riesgo de una corrida de 20 h que se corta en la hora 19 y no deja nada.
- El **checkpoint** deja de ser obligatorio (las corridas bajan de ~6 h).
- Todo entra en **una sesión de trabajo**, y si hay que repetir algo por un error de método, se puede.

### 11.3 Si algún día hay Gurobi académico

Con licencia completa, el periodo de 14 días deja de ser caro y el capítulo puede pasar de "ventana de
estrés" a "periodo completo". Mientras tanto, el alcance reducido **no invalida nada**: acota lo que se
afirma.
