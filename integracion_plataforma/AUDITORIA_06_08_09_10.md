# AUDITORÍA INDEPENDIENTE — cambios 06, 08, 09, 10
### Verificación por ejecución del commit `bce2d03`

> **Rol** (metodología de `integracion_plataforma/`): quien **especifica** audita lo implementado
> **ejecutando**, y **no edita** los `VERIFICACION.md` del implementador. Este documento es la
> auditoría independiente.
>
> **Commit auditado**: `bce2d03` — *feat(cambios-06-08-09-10): banda conformal + fisica MPC +
> ciclo calibracion + UI parametros* (22 archivos, +1070/−63).
> **Entorno de auditoría**: `C:\Users\2D\tesis-microrred\.venv` (Python 3, sin `pyomo`/`pymongo`/
> `pytest`). Ver §5 para lo que eso impide verificar.
> **Fecha**: 2026-10-09.

---

## 1. Veredicto por criterio

| Cambio | Criterios | Veredicto de la auditoría |
|---|---|---|
| **06** | C1 · C2 · **C3** · C5 · C6 (C4 diferido) | ⚠️ **C1, C5, C6 verificados** · 🔴 **C3 NO SE CUMPLE** (ver §2) |
| **08** | C1 · C2 · C3 · C4 · C5 · C6 | ⚪ **No verificable aquí** (falta `pyomo`) — auditoría por lectura en §3.1 |
| **09** | C1 · C2 · C3 · C4 · C5 · C6 | ✅ **C1 verificado ejecutando**; resto por lectura + artefacto (§3.2) |
| **10** | C1 · C2 · C3 · C4 · C5 · C6 | ✅ **por lectura**: el pitfall quedó cubierto; 2 observaciones (§3.3) |

---

## 2. 🔴 HALLAZGO CRÍTICO — el cambio 06 empeora la cobertura y no alcanza su criterio

### 2.1 El número reportado
`cambio_06_banda_conformal/VERIFICACION.md` afirma (C3):

| método | cobertura holdout | ancho medio |
|---|---|---|
| **A** — criterio anterior (radio in-sample, banda simétrica) | **90.28 %** | 4.57 kW |
| **B** — implementado (split disjunto, cuantiles del predictor final, asimétrica) | **69.44 %** | 4.68 kW |

**El criterio de cierre de la spec era `cobertura ≥ 0.72`.** El resultado es **0.6944** →
**el criterio NO se cumple**, aunque el implementador marcó la casilla `[x]`. Lo reporta con
honestidad ("no se ajusta ningún número para pasar"), pero la casilla debe quedar **`[ ]` con el
resultado real**, porque un criterio no alcanzado no se cierra marcándolo.

### 2.2 El hallazgo que importa más: la dirección del efecto
**A (criterio anterior) ya daba 90.28 % de cobertura en datos reales** — es decir, en esta ventana
el método anterior **sobrecubría**, no subcubría. Y **B baja a 69.44 %**.

> **Corrección de la auditoría sobre sí misma**: la línea base que motivó la spec
> (50.2 % / 54.8 %, `informe.md:456-461`) procede de **experimentos sintéticos** (semillas 7 y 42),
> no de datos reales del sensor. Con el sensor real, el criterio anterior **no estaba subcubriendo**.
> La motivación estructural del cambio (fuga in-sample, radio medido sobre el modelo físico) **sigue
> siendo válida como defecto metodológico**, pero **su efecto medido sobre la cobertura es negativo**
> en los datos disponibles.

### 2.3 Causa probable (evidencia numérica)
La banda implementada queda **mal posicionada** por la asimetría de los cuantiles empíricos:

```
band_q = {q10: -0.051 … -0.087, q90: +4.746 … +4.589, n_cal: 72}
```
- `q10 ≈ 0` y `q90 ≈ +4.6` ⇒ la banda queda casi **toda por encima del P50** (`[P50, P50+4.6]`),
  mientras A era simétrica (`P50 ± 2.28`).
- Con **`n_cal = 72`** muestras (20 % de ~360 h), los cuantiles q10/q90 son **inestables**.
- El implementador **no aplicó** el 06.3b (condicional por estratos) y lo declaró con la razón
  correcta (3 estratos × 24 muestras = ruido). ✓ bien decidido.

### 2.4 Recomendación concreta
Probar **una tercera variante** (C) antes de cerrar, midiendo con el mismo protocolo:

| variante | banda | por qué |
|---|---|---|
| A (anterior) | radio conformal **in-sample** del modelo físico, simétrica | tenía la fuga, pero la **forma** funcionaba (90 %) |
| B (implementado) | cuantiles empíricos del predictor final, **asimétrica** | sin fuga, pero n=72 y asimetría → subcubre |
| **C (propuesta)** | **radio conformal del predictor final en calibración, banda SIMÉTRICA** | conserva la forma que daba 90 % **sin** la fuga: es el método correcto según conformal |

Complementaria: **rebalancear el split** (p. ej. 50 % ajuste / 30 % calibración / 20 % holdout) para
que `n_cal` deje de ser ruidoso — el holdout queda igual y la comparación sigue siendo justa.

**Criterio honesto para cerrar**: si C tampoco alcanza 0.72, se **declara el número real** y se
documenta como hallazgo (el método conformal clásico no alcanza la cobertura nominal con esta
longitud de serie), sin inventar banda.

---

## 3. Hallazgos por cambio

### 3.1 Cambio 08 — física del MPC (auditoría por lectura)

✅ **Correcto**:
- Rampa **solo si `ramp_kw_per_h` está declarada**; si no, `warning` explícito y sin límite
  (`model_builder.py:277-281`) → cumple la regla "nunca un 0 silencioso" ✓
- Big-M de rampa **exige ambos períodos encendidos** (`:288-302`): activo solo con
  `U[t-1]=U[t]=1`; el arranque `0 → mínimo` queda permitido, como declaró la spec ✓
- No-simultaneidad **condicional a `export_tariff > 0`** (`:307-323`) → el modelo no paga binarias
  cuando no aportan ✓
- `U_grid` **incluido en el nonant de `t=0`** (`:517-518`) → coherente ✓
- Salida con `warnings`, `grid_limits` (con `source`) y `cost_fixed_applied` (`:120-122`, `:598-601`) ✓
- Precedencia de export + `warning` si `max_export_kw` no se declara (`:239`) ✓

🟠 **Hallazgo 08-A — la rampa se puede eludir apagando y encendiendo.**
El big-M libera la restricción cuando cualquiera de los dos períodos está apagado. Un plan puede
bajar de 300 kW a 0 en una hora (apagado) y volver a 50 kW la siguiente, **sin violar la rampa**
(el "salto" ocurre con el generador parado). Físicamente es un ciclo de parada/arranque, que no está
penalizado más allá de `cost_c · fuel · U`. **No es un bug de implementación** (la convención estaba
declarada), pero **debe declararse como limitación del modelo** o penalizarse el transitorio.

🟠 **Hallazgo 08-B — C5 se verificó estructuralmente, no con el plan real.**
La spec pedía tomar el `dispatch_plan` de producción y medir el **máximo salto** de `P_diesel` entre
horas. Se demostró que "0→50 en una hora está permitido + warning" (estructural). Falta el número
del plan real: **si el plan de hoy ya tiene saltos > rampa del equipo, el defecto queda probado con
el artefacto**, que es más fuerte.

🟠 **Hallazgo 08-C — discrepancia con la línea base publicada del Exp B.**
Medido ahora: **p50 4.19 s / p95 4.69 s**; el informe publica **0.45 s p50**. El implementador lo
declara honestamente ("la línea base 0.59 s no reproduce en el modelo de producción de esta máquina
ni sin el cambio"), y **el margen vs el ciclo de 15 min sigue siendo 185×** (conclusión intacta).
Pero queda una pregunta abierta sobre el número del informe: **¿el Exp B publicado midió otro job o
otro tamaño de modelo?** Debe aclararse antes de citar cualquiera de los dos.

### 3.2 Cambio 09 — ciclo de la calibración

✅ **Verificado ejecutando (auditoría independiente)**: `tests/test_drift.py` → **8/8 PASS**
(incluidos `test_stale_por_edad`, `test_max_age_default_30`, `test_should_recalibrate_missing`).
1 test **SKIP declarado** (exige fixtures `tmp_path`/`monkeypatch` que mi runner no provee).

✅ **Artefacto versionado correcto**: `history/pasto_solar_pv.jsonl` con **2 líneas**, motivos
`manual` y `age`, `artifact_sha256` distintos, nada sobrescrito ✓ (append-only real).

🟠 **Hallazgo 09-A — `rmse_antes` queda siempre en `null`.**
La spec (§4) lo definía como parte del registro. Con `null` en las dos entradas, el historial **no
permite saber si la recalibración mejoró el modelo** — que es la razón de ser del registro. Además
los dos eventos tienen **el mismo `rmse_despues` (1.4104)** con artefactos distintos (el segundo
difiere en metadatos), lo que refuerza la necesidad de comparar antes/después.

🟡 **Observación**: el evento con `motivo: "age"` sugiere que algo etiquetó una recalibración por
edad, aunque el disparo automático está declarado como **no activo**. Conviene aclarar de dónde
salió ese motivo (¿prueba manual etiquetada?).

### 3.3 Cambio 10 — parámetros configurables

✅ **El pitfall crítico quedó cubierto** (lo más importante): `OPTIONAL_PARAMS=['rampKwPerH']`,
`OPTIONAL_NUMERIC=[...]` y **vacío → `null`, nunca `0`** (`DeviceConfigPanel.jsx:13-18`, `:236`) ✓

✅ **Los 3 sitios coherentes**: `cost_fixed` en mapper (`DiagramOptimizationPanel.jsx:64`),
`gridDefault` (`:108`) y backend (`mpcScheduler.js:38`), con `cost_fixed_month` en mapper (`:68`),
backend (`:42`) y solver ✓

✅ **λ de degradación ya es configurable** (`DiagramOptimizationPanel.jsx:87` con default 30) ✓

🟡 **Observación 10-A**: `tariffMode` es un **campo de texto** (`'hora'`/`'mes'`): cualquier valor
distinto de `'mes'` cae a hora. Funciona, pero un `<select>` evitaría errores de tecleo. Declarado
por el implementador.

---

## 4. Regla dura 2 — ninguna cifra a mano

🔴 **Hallazgo transversal (severidad media-alta)**: **el resultado del protocolo de medición no se
versionó como artefacto.** El `VERIFICACION.md` del 06 reporta `A 90.28 % / B 69.44 %` como texto;
no existe `cobertura_06_*.json` en el repo (búsqueda: 0 resultados salvo el `reference/`).

La spec (§6, C3) y la regla dura 2 exigen que **toda cifra salga de un artefacto versionado**.
Corrección: correr el protocolo con `--out cobertura_06_<fecha>.json` y versionar ese JSON junto al
`VERIFICACION.md`, de modo que la cifra sea reproducible y auditable.

**Nota positiva**: el script portado a `optimization/tests/medir_cobertura_banda.py` es
**idéntico en contenido** al `reference/` (verificado con `diff --strip-trailing-cr`; solo difiere
el fin de línea CRLF del checkout). El protocolo único **se respetó** ✓

---

## 5. Lo que esta auditoría NO pudo verificar (declarado, no supuesto)

> **Reparto de entornos (dato del autor)**: **el agente implementador corre en OTRA máquina**, donde
> sí están `pyomo`, `highspy`, `pymongo` y `pytest`, y donde está el Mongo con las mediciones.
> Esta auditoría se ejecuta en la máquina de la tesis, que **no** tiene ese entorno ni acceso a esas
> mediciones. Por lo tanto:
> - lo **verificable aquí** (conformal, calibración, drift, lectura del modelo y de los mappers) se
>   verificó **ejecutando** (§1 y §3);
> - lo que depende del entorno del implementador queda **a su cargo**, y esta auditoría lo deja
>   **explícito en lugar de asumirlo**.

| no verificado aquí | causa | quién lo cierra |
|---|---|---|
| `tests/test_solver.py` y `test_complementarity_scenarios.py` (los "19 passed" del 08 y sus **2 fallos declarados preexistentes**) | `pyomo`/`highspy` no están en la máquina de auditoría | el **implementador** (misma ejecución que ya corrio) o instalar el stack aquí |
| Re-medición independiente del protocolo A/B en datos reales | `pymongo` ausente **y** las mediciones viven en el Mongo del entorno del implementador | el **implementador** corre el protocolo con `--out` y versiona el JSON |
| La afirmación "los 2 fallos son preexistentes" | idem (se verificó con `git stash` en su entorno) | el implementador adjunta la salida del `git worktree` del commit anterior |

**Ejecutado y confirmado por la auditoría**: `test_conformal.py` (**6/6**), `test_calibration.py`
(**5/5**), `test_drift.py` (**8/8** + 1 skip) → **18/19 PASS**, 1 SKIP declarado. Esto **confirma
por vía independiente** el C1 de los cambios 06 y 09.

---

## 6. Acciones recomendadas (en orden)

| # | Acción | Severidad |
|---|---|---|
| 1 | **Reabrir el C3 del 06**: medir la variante **C** (radio conformal del predictor final, banda simétrica) y/o rebalancear el split a 50/30/20 | 🔴 |
| 2 | **Versionar el JSON del protocolo** (`--out`) y enlazarlo desde el `VERIFICACION.md` (regla dura 2) | 🔴 |
| 3 | Marcar C3 como **no alcanzado** en el `VERIFICACION.md` del 06 (la casilla `[x]` no corresponde) | 🟠 |
| 4 | Poblar **`rmse_antes`** en el historial de recalibraciones | 🟠 |
| 5 | **Declarar la limitación de la rampa** (eludible vía apagado/encendido) o penalizar el transitorio | 🟠 |
| 6 | Aclarar la **discrepancia del Exp B** (0.45 s publicado vs 4.19 s medido) | 🟠 |
| 7 | `tariffMode` como selector, no texto libre | 🟡 |
| 8 | Instalar `pyomo`/`pymongo`/`pytest` para cerrar la auditoría del solver | 🟡 |

**Ninguna de estas acciones invalida el trabajo**: el código de los cuatro cambios está bien
construido y respeta las reglas duras (compatibilidad hacia atrás, null declarado, append-only,
3 sitios coherentes, protocolo único idéntico). La corrección es de **criterio y trazabilidad**.

---

# 7. SEGUNDA RONDA — verificación de las correcciones (`8e7c03a`)

El implementador respondió punto por punto (`RESPUESTA_AUDITORIA_06_08_09_10.md`) y **todas las
acciones se ejecutaron**. Verificación:

| # | Acción de la 1ª ronda | Resultado | Veredicto |
|---|---|---|---|
| 1 | Medir la variante **C** | medida en **2 splits**, JSON versionados (`cobertura_06_2026-10-09_w30_s602020.json`, `..._s503020.json`) | ✅ **confirma la hipótesis** (§7.1) |
| 2 | Versionar el JSON del protocolo | 2 JSON junto al `VERIFICACION.md`, enlazados | ✅ regla dura 2 cumplida |
| 3 | C3 marcado como no alcanzado | `[ ]` con el número real (69.44 %) | ✅ |
| 4 | Poblar `rmse_antes` | **3er evento** con `rmse_antes: 1.4104` + `rmse_antes_causa` para distinguir las 2 causas de `null` | ✅ verificado en el `.jsonl` |
| 5 | Rampa eludible (08-A) | **08.4 con continuas** (`S`,`D`), sin binarias nuevas, `c_start/c_stop` dato del equipo, warning si falta | ✅ mi propuesta, implementada |
| 6 | Aclarar la discrepancia del Exp B | **causa raíz medida**: 2094 vars / 2036 constr > **límite 2000 de la licencia size-limited** → HiGHS; `solver_usado` ahora se reporta | ✅ explicación cerrada |
| 7 | Probar la preexistencia de los 2 fallos | `evidencia_fallos_preexistentes.txt` con **`git worktree` de `8e8e2d3`**: mismos 2 fallos, 13 passed | ✅ aceptado |
| 8 | `tariffMode` como selector | `<select>` + captura + build/lint | ✅ |

## 7.1 La variante C confirma el diagnóstico

| split | A (criterio anterior, con fuga) | B (implementado) | **C (propuesta)** |
|---|---|---|---|
| 60/20/20 (n_cal=72) | 90.28 % · **4.57 kW** | 69.44 % · 4.62 kW | **87.50 % · 4.26 kW** |
| 50/30/20 (n_cal=108) | 90.28 % · 4.57 kW | 69.44 % · 4.62 kW | **88.89 % · 4.63 kW** |

**Conclusiones**:
1. **C domina a B en ambas configuraciones**: +18 pp de cobertura con ancho igual o **menor**
   (en 60/20/20 C es más estrecha: 4.26 vs 4.62 kW). El problema **no era el split disjunto** — era
   la **forma asimétrica** con cuantiles empíricos ruidosos (q10≈0, q90≈+4.6). ✓ hipótesis validada.
2. **C ≈ A en cobertura** (87.5–88.9 % vs 90.3 %), pero **sin la fuga in-sample**: es el método
   correcto según conformal, y en 60/20/20 es **más eficiente** que A.

## 7.2 🔎 Hallazgo nuevo (2ª ronda) — hay **sobrecobertura sistemática**: 87–90 % con nominal 80 %

**Ninguno** de los tres métodos se acerca a la nominal: todos **sobrecubren 7–10 pp**. Como el ancho
es lo que le cuesta dinero al MPC (banda ancha → más reserva preventiva → más diésel), esto significa
que **la banda es más ancha de lo necesario para el 80 %** que se declara.

**Hipótesis a probar** (no asumida): el ancho está calibrado con un **cuantil global** sobre un error
que es **heterocedástico** (crece con la irradiancia), lo que fuerza un ancho único que en las horas
de poco sol es excesivo. La vía natural son los **cuantiles condicionales por estrato** (descartados
en el 06.3b por `n_cal=72`; con el split **50/30/20** ya son `n_cal=108` → 3 estratos de 36, todavía
ruidoso, pero medible en **más ventanas**).

**Criterio correcto para decidir** (no "cobertura máxima"): **cobertura ≈ nominal (80 %) al menor
ancho**, más el **efecto en el despacho**. Una banda con 90 % de cobertura puede ser peor que una con
80 % si cuesta más diésel.

## 7.3 Corrección de esta auditoría a sí misma

En el §2.4 de la 1ª ronda afirmé que la penalización de arranque con variables continuas tendría
**"coste computacional nulo"**. Medido: **falso en la práctica**.

| escenario | p50 |
|---|---|
| estructura sola (sin `c_start` declarado) | 4.43 s (≈ línea base 4.19 s) |
| **penalización activa** | **9.63 s** (×2.2) |

Sin binarias nuevas ✓ (correcto), pero la penalización **activa** sí encarece el solve: cambia el
paisaje del MILP y HiGHS explora más. **Margen restante vs el ciclo de 15 min: 90×** → sigue siendo
aceptable, pero la afirmación "coste nulo" era incorrecta y queda corregida aquí.

## 7.4 Verificación ejecutada por esta auditoría (2ª ronda)

| verificación | resultado |
|---|---|
| `test_conformal` + `test_calibration` + `test_drift` | **18/21 PASS**, 3 SKIP declarados (exigen fixtures `tmp_path`/`monkeypatch`) |
| `optimization/tests/medir_cobertura_banda.py` vs `reference/` | difiere **solo** en `--split` y el bloque C, **declarado en la `nota` del JSON** ✓ |
| `reference/` congelado | ✅ sin cambios desde `d8983af` (el implementador **no** tocó el paquete de referencia) |
| `solvers.py` | `solver_usado` reporta `gurobi` / `appsi_highs` ✓ |

**Sigue fuera de alcance de esta máquina**: `test_solver.py` y `test_complementarity_scenarios.py`
(sin `pyomo`). La preexistencia de sus 2 fallos queda cubierta por la evidencia del worktree del
implementador, que **acepto como válida** (metodológicamente correcta: mismo commit, misma ejecución).

## 7.5 Decisión pendiente del autor

**¿Se adopta la variante C como banda de producción del MPC?**

- **A favor**: B (lo que hoy consume el MPC, tras la recalibración `force=true`) **subcubre**
  (69.44 % → el MPC ve menos incertidumbre de la que existe); C es metodológicamente correcta,
  supera el criterio y **domina a B con ancho igual o menor**.
- **En contra de hacerlo automático**: el cambio altera la banda que usa el MPC; conviene medir
  antes el **efecto en el despacho** (costo y ENS con C vs B en un caso de lazo cerrado).

**Recomendación**: adoptar **C**, en un paso propio con re-verificación de C2/C3/C5/C6 y medición del
efecto en el despacho — y **no** cerrar el capítulo de la banda hasta probar la vía del §7.2
(sobrecobertura).
