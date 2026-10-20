# AUDITORÍA — VALIDACIÓN FASE 1 (alcance mínimo)

> Ejecutada por quien especifica, sobre **`4b4eb57`**. Fecha: 2026-10-20.
> Método: **recálculo propio** de todos los deltas desde los CSV versionados (independiente de los
> `resultado.json`) + lectura del código. Este clon es solo de revisión: no se corre el solver.

---

## 1. Veredicto

**La Fase 1 es el mejor trabajo de medición de todo el proyecto, y no por los números que trae sino por
los que se niega a publicar.** Tres cosas que un implementador con prisa habría reportado como hallazgos
están declaradas como **no atribuibles**:

1. **El inversor no se puede medir en el lazo cerrado**: con inversor el costo sale **4,8 % menor** pese
   a tener 3 % menos PV. La tentación era decir "el inversor ahorra"; en cambio se identifica el
   mecanismo (**re-optimización discreta con feedback de SOC**, divergencia desde la hora 8) y se acota
   el efecto físico real a **≤ ~1 %**, por debajo del ruido.
2. **V3 no tiene dos fuentes que comparar**: `era5` y `mongo` colapsan a la misma planta calibrada
   (sha idénticos). Declarado como límite, no como resultado.
3. **V5 no puede validar el despacho de la planta** porque el lazo corre sobre `DEFAULT_TOPOLOGY` sin
   diagrama conectado → declara que valida **estabilidad**, no corrección. El Exp D sigue diferido.

Y todo lo verificable **cuadra** con mi recálculo. Un JSON roto (§3.1) es lo único que hay que arreglar.

---

## 2. Verificado recalculando desde los CSV

| Pregunta | Declarado | Mi recálculo | |
|---|---|---|---|
| **V1+V6** ENS S-MPC vs D-MPC (3 d estrés, banda C) | −5,13 kWh (−26 %) | **14,384 − 19,514 = −5,130 kWh (−26,3 %)** | ✅ |
| **V1+V6** costo | −0,6 % | −18.744,2 = **−0,68 %** (total) / −0,62 % (norm) | ✅ |
| **V2** grid10 | −1,8 % costo · −5,3 ENS | **−1,82 %** · **−5,326 kWh (−76,1 %)** | ✅ |
| **V2** grid30 | +1,6 % costo · −4,8 ENS | **+1,62 % (norm)\*** · **−4,796 kWh (−68,5 %)** | ✅ |
| **V3** era5 vs mongo | byte-idénticos | **idénticos en las 6 cifras** (ens/costo/norm, ambos brazos) | ✅ |
| **V3** orden S<D se mantiene | 8,45 < 12,93 | **−4,482 kWh (−34,7 %)** | ✅ |
| **V7** norm smpc / dmpc | −4,84 % / −2,83 % | **285.334,6 vs 299.843,0 = −4,84 %** · **280.789,2 vs 288.963,8 = −2,83 %** | ✅ |
| **V7c** isla | costo −0,3 % · ENS +1,3 kWh | **−0,30 %** · **+1,321 kWh** | ✅ |
| **Sonda de hilos** | 1,34× con 2 procesos | 8 solves en 410,1 s vs 548,2 s serial = **1,34×** | ✅ |
| Reproducibilidad V2 vs V7a | byte-idénticos | mismas cifras al decimal (grid30 smpc 2,205 / dmpc 7,001) | ✅ |

\* Ojo con la métrica: sobre `costo_total` el delta de grid30 es **+2,38 %**, y sobre `costo_norm`
**+1,62 %**. El README cita el normalizado. Conviene decir **cuál** en cada tabla del capítulo, porque la
diferencia (+2,4 vs +1,6) no es despreciable.

---

## 3. Hallazgos

### 3.1 🔴 `v1_bandc/resultado.json` **no es JSON válido** → ✅ **RESUELTO** (`6b422a4`)

Doble coma en la posición 472: `... "diesel_L": 311.6}],, "dmpc": [...]`.

Es un typo trivial, pero estaba en el **artefacto del resultado central de la tesis** (V1/V6) y hacía que
cualquier lectura automática reventara (me reventó a mí). Los **CSV eran válidos**, así que el número
estaba bien y lo verifiqué desde ellos.

**Verificado por esta auditoría tras el arreglo**:

| Prueba | Resultado |
|---|---|
| Los **16** JSON de `integracion_plataforma/validacion/` parsean | ✅ (comprobación propia, 0 malos) |
| `test_validacion_json.py` (nuevo, runner nativo) | ✅ **PASS 2/2** |
| **Prueba de fuego** (en copia fuera del repo, para no tocar el original): metí un JSON con doble coma | ✅ **FALLA y nombra el archivo**: `...malo.json: Expecting property name enclosed in double quotes: line 1 column 11` |
| Sin el JSON roto | ✅ PASS |

Y el test trae dos cosas que valen: **protección anti-falso-verde** (`test_hay_json_de_validacion`: si el
glob deja de encontrar archivos, falla en vez de pasar en verde) y **el precedente escrito en el propio
código** (*"llegó con una coma doble… lo detectó una auditoría a mano; este test lo detecta en CI"*). El
aprendizaje queda donde se ejecuta, no en un documento que se olvida.

### 3.1.bis 🟡 La métrica, declarada → ✅ **RESUELTO** (`2495969`)

Cada tabla de la Fase 1 declara ahora **las dos**: `costo_norm` y, entre paréntesis, `costo_total` (en
grid30: +1,62 % norm / **+2,38 % total**). También en las frases de *"lo afirmable"*. Verificado en el
README y en los 4 `resultado.json`; el manifiesto se recalculó.

### 3.2 🟠 Hallazgo metodológico (el importante): el lazo tiene **±5 % de ruido de re-optimización**

V7 lo deja medido y es extrapolable a **todas** las comparaciones S vs D:

- Un **solve aislado** con menos PV cuesta **+0,63 %** (dirección física correcta).
- El **mismo par en lazo cerrado de 24 h** da **−4,84 %** (al revés), porque las trayectorias de SOC
  divergen desde la hora 8 por decisiones discretas.
- Es decir: **el ruido del lazo (≈±5 %) es mayor que el efecto que se quiere medir (≤1 %)**.

**Consecuencia directa para el capítulo** (y coincide con lo que el README concluye):

- ✅ **El ENS es señal**: −26 % en la ventana de estrés está muy por encima del ruido.
- ❌ **El costo no lo es**: −0,68 % en V1 y +1,6 % en V2 caen **dentro** del ruido de re-optimización.
  Publicar "el S-MPC ahorra 0,7 % de costo" sería afirmar algo que el diseño no puede sostener.

Esto no debilita la tesis: **la fortalece**, porque convierte "el estocástico cuesta parecido y reduce el
ENS" en una afirmación con mecanismo conocido y límite declarado.

### 3.3 🟡 Lo que el alcance reducido deja fuera (y hay que decirlo en el texto)

- **V3** sigue sin responder por diseño: no hay fuente PV real alternativa (Mongo vacío → ambas caen en
  la planta calibrada). Requiere historial real de Mongo.
- **V7**: no se publica delta de costo "por el inversor"; el efecto atribuible es ≤ ~1 %.
- **V5**: valida que el lazo **opera estable**, no que el despacho de la planta sea correcto
  (`DEFAULT_TOPOLOGY` sin diagrama). El Exp D sigue siendo el que lo mediría.
- Nada sobre 14 días ni p<0,05 (V4 fuera).

### 3.4 🟡 Observación de diseño de V3 (a favor del implementador)

Cazó algo que yo no había previsto: el **publicado** del 08-05 (2,33 / 6,19 kWh) viene de un **lazo
continuo con SOC arrastrado**, y estas corridas usan **SOC inicial 0,65**. No son comparables, y lo
declara en vez de mezclarlas. Bien.

---

## 4. Estado del bloque de validación

| Fase | Estado |
|---|---|
| **0** | ✅ cerrada (V8a idéntico; V7/V3 reducidos y declarados) |
| **1** | ✅ **medida** — V1/V6 ✅, V2 ✅, V7 ✅ (no atribuible), V7c ✅, V3 ⬜ por diseño, V5 ✅ (estabilidad) |
| **V4** | ❌ fuera (p<0,05, ~35 días) — declarado |

**Lo único que pido**: arreglar el JSON de `v1_bandc`, declarar la métrica en cada tabla
(`costo_total` vs `costo_norm`) y **no publicar deltas de costo** dentro del ruido. Con eso, la Fase 1 se
puede citar en el capítulo tal cual.
