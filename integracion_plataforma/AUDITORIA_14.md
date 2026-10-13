# AUDITORÍA INDEPENDIENTE — CAMBIO 14 · TRANSFORMADOR

> Ejecutada por quien **especifica** el cambio sobre el commit **`3c3f511`** (el incremento viaja
> limpio en su propio commit: 14 archivos). Fecha: 2026-10-12.
> Método: lectura del código, **ejecución propia de lo ejecutable aquí** y **lectura de la captura**
> versionada. Lo no medible en este entorno se declara (§5).

---

## 1. Veredicto

**El incremento está bien construido y tiene la frontera visible donde debe estar.** El implementador
resolvió con criterio **un hueco de la spec** (§3.1), aplicó las tres lecciones que le pasé (el pitfall
del `0`, "un aviso no es una rama abierta", válvula física en vez de cota bajada) y **no tocó
`MICROGRID`** como se le ordenó. Queda **un defecto de precisión en el badge** (§3.2) cuyo sitio
natural de arreglo es el cambio 16.

| Criterio | Declarado | Verificado aquí |
|---|---|---|
| C1 pérdidas exactas + fila propia | ✅ | ✅ **leído**: `grid_net = (1−p)·P_import` aplicado **en el balance**; fila `transformer_loss` **atribuida al trafo** (no CURT) |
| C2 tope con válvula física | ✅ | ✅ **leído**: `_ub_imp = min(_ub_imp, cap_kw)` y el resto cae a **ENS declarado** |
| C3 ausencias + regla del `0` | ✅ | ✅ **leído**: `limite_aplicado`, `energia_no_contabilizada`, motivos por campo; esquema con los 5 campos en `default: None` |
| C4 frontera visible | ✅ | ✅ **captura**: pie `Despacho: pérdidas + capacidad · tensión/impedancia NO incluidas` + `alcance` en el eco |
| C5 balance íntegro + eco | ✅ | ✅ **leído**: el trafo viaja al eco con `params_efectivos` y motivo por ausencia |
| C6 sin regresión | ✅ | ✅ **leído**: el trafo añade **cero variables** (escala + cotas); `MICROGRID` intacto |
| C7 fluidez | ✅ | ✅ **leído**: pares crudos, orden aleatorio, +4 % dentro del ruido |
| Invariante de cobertura | — | ✅ **PASS 3/3**, **corrido por mí** |

---

## 2. Lo que verifiqué EJECUTANDO

| Prueba | Resultado |
|---|---|
| **Invariante de cobertura** (`test_mapper_coverage` + 2) | ✅ **PASS 3/3** corrido aquí, con `ratioLabel` en `PARAMS_SOLO_UI` y los otros 4 campos por el mapper |
| **Esquema del trafo** | ✅ 5 params, **todos con `default: None`**; `if_missing` literal: *"limite NO aplicado + eco + pre-flight (prohibido asumir pf típico)"* / *"sin perdidas + eco + pre-flight (prohibido asumir perdidas tipicas)"* |
| **Modelo** | ✅ tope como **cota mínima con la de la red**; pérdidas aplicadas **en el balance**; `limite_aplicado`; `energia_no_contabilizada`; el trafo sale en el eco con **el alcance declarado** |
| **Captura** | ✅ tarjeta con `13.2/0.22 kV`, píldora `transformando`, `100 kVA`, `2.0 %` y **el pie de alcance**; **símbolo `s-trafo` copiado** de la referencia 12.4 |

---

## 3. Hallazgos

### 3.1 ✅ Hueco de MI spec, resuelto con criterio: la **rama** del trafo

La spec del 14 **no decía a qué rama aplica** el trafo (y el payload del solver no trae aristas, solo
grupos). El implementador eligió la **rama de RED** (subestación de conexión) y lo **declaró** con su
razonamiento: la spec §1 cita la red como patrón del trafo (*"elemento de paso con coste/límite"*) y
C2 (*"forzar más demanda"*) **solo cuadra ahí**; además dejó el camino **aislado y reversible** (un
bloque de parse + `grid_net` + cotas + filas) para poder moverlo o añadir un parámetro `branch`.

**Es la decisión correcta y la forma correcta de tomarla** (aislada, justificada y declarada). Queda
**registrada como contrato** en la spec (§8) para que no vuelva a ser una elección libre.

### 3.2 🟠 DEFECTO: el badge del lado de **salida** del trafo muestra la **entrada** (la pérdida no se ve en el cable)

La captura muestra `▲ 10.0 kW` **en la entrada y en la salida** del trafo. Con `losses_pct: 2`, la
salida debería marcar **9.8 kW**. Causa raíz, leída en el código:

1. El plan emite **dos filas** para el trafo: `transformer` (el paso = **10.0**) y `transformer_loss`
   (**0.2**, la pérdida atribuida).
2. `PowerEdge.powerFor()` toma **`Math.max(...)` de todas las filas del `device_id`** → `max(10.0, 0.2)
   = 10.0`.

⇒ **Cualquier** rama del trafo pinta 10.0. La pérdida existe en el modelo (el balance la aplica ✓) pero
**no se ve en el cable**.

**Por qué importa**: en el cambio 13 celebramos justamente que `10.0 → 9.7 kW` **sí** se veía en el
inversor. Allí funciona **de casualidad**: en modo serie el inversor emite **una sola** fila (`inverter`);
en cuanto hay más de una (bus DC, trafo, y mañana los switches), el `Math.max` **borra la diferencia**.
No es un error de este cambio: es una **limitación latente** del badge que el trafo destapó.

**Dónde arreglarlo**: el sitio natural es el **cambio 16** (unifilar vivo), donde el badge y el flujo se
rediseñan sobre el `dispatch_plan`. Ahí el criterio debe ser: **el badge de una rama refleja el valor
que circula por ESA rama** (entrada vs salida del dispositivo), no el máximo de sus filas.
**Alternativa barata si se quiere ya**: que `powerFor` **ignore** las filas que representan pérdidas /
vertido (`transformer_loss`, `curtailment`, `curtailment_dc`…) — resuelve el caso del trafo sin tocar
el resto. **Mínimo exigible ahora**: declararlo como limitación conocida.

### 3.3 🟡 El test de contrato del mapper pide la clave **literal** `eta:`

`test_mapper_output_contra_schema` no reconoce el shorthand JSX (`eta,`) y exige `eta:` explícito. El
implementador lo **declaró** para el próximo que toque el mapper. Es una limitación del test (regex),
no un defecto del código; se anota para que no sorprenda.

### 3.4 🟡 Ruido en el rango: trabajo de **otro eje** y un commit `fix`

El rango `72ae8eb..3c3f511` trae 34 archivos, pero solo **14 son del cambio 14**. Lo demás viene de
`cd439a0` (*"chore: quita anuncios tipo Full-loop + retira **TimesFM 2.5** (no viable por ahora)"*) —
**otro eje de trabajo, NO auditado aquí** (no es de mis specs): reescribe `prediction/forecaster.py`
(−130 líneas), `test_forecaster.py` (−67), toca `informe.md`, locales, `pasto_narino.yaml` y
`DESPLIEGUE_RASPBERRY.md`.
- **El cambio 14 viaja limpio en su propio commit** ✅ (bien).
- Pero hay un commit con mensaje **`fix`** a secas (`a39698b`, 2 jsonl del historial de calibración):
  sin trazabilidad. La regla del proyecto es que el mensaje diga **qué** y **por qué**.

### 3.5 🟠 Los hashes de las capturas eran **inválidos** (manifiesto no verificable) — ARREGLADO

Los manifiestos del `reference/` existen para probar que la evidencia **no cambió**. Verificado aquí:
**no cumplían su función** en las capturas:

| Captura | Declarado | Realidad |
|---|---|---|
| `cambio_12_4_unifilar.png` | `42d0a1a4…` (**40 hex**) | no coincide con su SHA1 (`513cf682…`), ni MD5, ni SHA256 (`a3f6b2a1…`) |
| `cambio_13_unifilar.png` | `c762b38f…` (**40 hex**) | no coincide con su SHA256 (`59e9341d…`) |
| `cambio_14_unifilar.png` | `2c79ebd9…` (**32 hex**) | no coincide con su SHA256 (`38571844…`) ni MD5 |

Y además el sha declarado de la **spec del 13** estaba **desincronizado** (su `README.md` se editó
después de escribirse el manifiesto). Los SVG del 12 sí eran correctos (los generó esta auditoría con
`hashlib.sha256`).

**Lo que NO era el problema** (descartado, no asumido): los PNG **no están corruptos**. Verificado que
`blob == disco` y que los tamaños coinciden en los tres → **no** hubo normalización CRLF.

**Arreglado por esta auditoría**: los **22 manifiestos** de todos los `reference/` verifican ahora
**22 OK / 0 MAL**, con SHA256 completos (64 hex) y tamaño real.

**Propuesta sistémica** (para que no dependa de la disciplina de nadie): un test de ~15 líneas que
recorra los `reference/README.md` y verifique que **cada hash declarado coincide con el `sha256` del
archivo** — fallando si no. Se propone como `optimization/tests/test_manifiestos_reference.py`.
Regla operativa asociada: **el SHA del `README.md` se recalcula en el mismo commit que lo modifica**.

---

## 4. Lo que este incremento hizo bien (para que se repita)

1. **Resolvió el hueco de la spec con criterio y lo declaró** (§3.1) en lugar de improvisar en silencio.
2. **El pitfall del `0`, cubierto de entrada** (`test_c3_cero_es_no_declarado`: `s_max/pf/losses = 0`
   → `limite_aplicado: False`, `losses_p: None`, 2 motivos) y con la regla unificada en mapper,
   preflight, tarjeta y solver.
3. **Válvula física, no cota bajada**: el tope del trafo manda el excedente a **ENS declarado**.
4. **Cero variables añadidas**: el trafo es escala + cotas (como la etapa en serie del inversor) → no
   encarece el MILP. Lo reporta con números (6.29/6.25/5.53 s sobre el JOB del ExpB).
5. **Aplicó la lección de la barra**: el trafo queda **fuera de `mappableNodes`** (sus params son de
   placa, no de sensor) — sin repetirle el hallazgo del 12.4.
6. **La frontera está en tres sitios**: eco (`alcance`), tarjeta (pie) y panel (`TrafoEffectiveLine`).

---

## 5. NO verificado aquí (declarado, no asumido)

- `test_transformer.py` (y todo lo que importa `pyomo`): corre en la máquina del implementador.
- Marcas de preflight del trafo y `TrafoEffectiveLine` con **placa incompleta** (la captura evidencia
  el camino con placa completa).
- La suite completa (130 passed + 5 fallos pre-existentes del 13).
- El eje de `cd439a0` (retiro de TimesFM y reescritura del forecaster) — **fuera del alcance de esta
  auditoría**.

---

## 6. Fila de estado sugerida

| # | Estado |
|---|---|
| **14** | ✅ **Implementado y auditado** (`3c3f511`): pérdidas en el balance con **fila atribuida**, tope con **ENS declarado** (válvula física), regla del `0` cubierta, **frontera visible en eco + tarjeta + panel**, símbolo copiado, `MICROGRID` intacto, invariante **3/3** corrido por la auditoría · 🟠 **defecto**: el badge de salida del trafo muestra la **entrada** (`Math.max` de las filas del dispositivo) → arreglar en el **cambio 16** (o ignorar filas de pérdidas ya) · 🟡 test del mapper exige `eta:` literal · 🟡 commit `a39698b "fix"` sin trazabilidad |
