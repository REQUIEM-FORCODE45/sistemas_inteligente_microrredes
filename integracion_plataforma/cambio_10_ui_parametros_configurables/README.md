# PLAN — CAMBIO 10 · PARÁMETROS OPERATIVOS CONFIGURABLES DESDE LA UI
### rampa del diésel · λ de degradación · tarifas de red (+ToU) · política de frescura · unidades

> **Naturaleza**: **especificación para el repositorio `sistemas_inteligente_microrredes`**. El autor
> **NO toca el repositorio**: solo lo lee y especifica. Este archivo vive en
> `C:\Users\2D\tesis-microrred\docs\` y se copia como
> `integracion_plataforma/cambio_10_ui_parametros_configurables/README.md`.
>
> **Estado**: **propuesta**. Nada implementado.
> **Clasificación**: 🖥️ **PRODUCCIÓN** — es el canal por el que el dueño de la microrred fija la
> física y la economía de su sistema.
> **Depende de**: **cambio 08** (introduce `ramp_kw_per_h` y `cost_fixed_month` en el contrato). Si
> este cambio se implementa **antes** del 08, la UI escribiría campos que el solver **ignora**.
> **Origen**: decisión del autor (parámetros operativos con default, no valores fijados por el
> especificador) + auditoría §A.1 + hallazgos de esta spec (§2.4, §2.5).

---

## 0. Qué resuelve

Hoy el operador **no puede fijar los parámetros que gobiernan su propio despacho**. Cinco de ellos
están **hardcodeados en el mapper del frontend** y no tienen ningún campo en la interfaz:

| parámetro | hoy | consecuencia |
|---|---|---|
| **λ de degradación** de la batería | `30.0` fijo (`DiagramOptimizationPanel.jsx:62`) | gobierna **cuánto cicla la batería**; el valor realista de la tesis es ~200 COP/kWh → la batería cicla de más y el operador no puede corregirlo |
| **tarifa variable** de red | `60` escalar (`:52`, `:82`) | el modelo **soporta ToU horario** (valle 45 / media 80 / pico 140 ya validado en `experiments/config.py:64-70`) pero desde la UI solo se puede mandar un escalar |
| **cargo fijo** de red | `40` (`:52`, `:82`) | no editable; y su semántica (¿hora o mes?) está sin declarar (ver cambio 08) |
| **rampa del diésel** | **no existe** (grep `ramp` → 0 en todo el repo) | el plan puede ser físicamente inejecutable y el operador no puede acotarlo |
| **límite de exportación** | `max_import × 0.75` (`:50-51`) | regla heurística no evidente; y el solver la ignora (defecto del cambio 08) |

Además, la política de frescura del modelo calibrado (cambio 09) no tiene forma de configurarse sin
tocar código.

**Principio de este cambio**: *todo parámetro que cambia el plan debe ser fijable por el dueño del
sistema, con un default declarado y visible.*

---

## 1. Lo que YA existe en el repo (verificado leyéndolo, HEAD `e8ea4a4`)

| pieza | ruta:línea | estado |
|---|---|---|
| **Panel de propiedades genérico** | `Frontend/.../diagram/components/DeviceConfigPanel.jsx:94-96` | ✅ **itera `Object.keys(defaultParams)`** → un campo por clave, sin código por dispositivo |
| Tipo de campo automático | `DeviceConfigPanel.jsx:217` | ✅ numérico si el default es `number` |
| Etiquetas con **unidad** | `DeviceConfigPanel.jsx:98-108` (`paramLabels`) | ✅ aquí se declaran las etiquetas nuevas |
| Definiciones por dispositivo | `.../diagram/constants/deviceTypes.js:139-232` | ✅ diésel, red, batería, carga |
| Mapper dispositivo → solver | `.../diagram/DiagramOptimizationPanel.jsx:18-76` (`TOPOLOGY_MAPPERS`) | ⚠️ **aquí están hardcodeados los 5 parámetros** |
| Segundo sitio con la tarifa fija | `DiagramOptimizationPanel.jsx:82` (`gridDefault`) | ⚠️ **duplicado**: hay que cambiarlo en los dos sitios o el valor de la UI no se aplica |
| Tercer sitio (backend) | `Backend/services/mpcScheduler.js:20-40` (`DEFAULT_TOPOLOGY`) | ⚠️ solo aplica si **nunca** hubo diagrama guardado |
| Perfil ToU **ya validado** | `optimization/experiments/config.py:64-70` | ✅ valle **45** (00-05 h) · media **80** (06-18 y 22-23) · pico **140** (19-21) |
| El modelo acepta ToU | `optimization/solver/model_builder.py:459-463` | ✅ `cost_variable` como vector de 24 h o escalar |

---

## 2. Los defectos

### 2.1 — Parámetros que cambian el plan, no configurables
Los cinco de la tabla del §0. El operador ve el resultado del despacho pero no puede ajustar la
física ni la economía que lo producen.

### 2.2 — El mismo dato vive en 3 sitios (riesgo de desincronización)
`cost_fixed`/`cost_variable` aparecen en `TOPOLOGY_MAPPERS` (`:52`), en `gridDefault` (`:82`) y en
`DEFAULT_TOPOLOGY` del backend. **Si la UI los expone y solo se actualiza uno, el valor de la UI se
pierde silenciosamente.**

### 2.3 — Unidades mezcladas (vatios en la UI, kW en el solver)
El panel declara `Capacidad máxima (W)` con `maxCapacity: 300000` y el mapper divide por 1000. La
conversión es correcta, pero **un campo nuevo con unidad equivocada produce un error de 1000×** sin
que nada avise. Cada campo nuevo debe declarar su unidad en la etiqueta y en la spec.

### 2.4 — ⚠️ **Un campo numérico vacío se convierte en `0`** (pitfall crítico)

`DeviceConfigPanel.jsx:21-23`:
```js
onChange={(e) => {
  const val = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
  onChange(val);
}}
```
**`parseFloat('') || 0` → `0`.** Si la rampa se declara como campo numérico y el operador lo deja
vacío, se guarda **`ramp_kw_per_h = 0`** → el generador no podría cambiar de potencia entre horas →
plan absurdo o infactible.

**Por eso este cambio exige** que "sin declarar" sea un estado **distinto de 0** (y que el mapper
**no envíe la clave** en ese caso, para que el solver aplique su comportamiento declarado + warning).

### 2.5 — Rampa: el default **no puede ser un número**
Un valor de rampa inventado **cambia el plan**. El default honesto es *"no declarada"* con el aviso
visible, y el operador lo activa con el dato del fabricante. (Contraste: sí admiten default
`max_age_days` = 30 d y `cost_fixed` = 40 COP/h, porque **no** alteran el óptimo.)

---

## 3. Alcance (5 incrementos)

| # | Incremento | Qué |
|---|---|---|
| **10.1** | **Rampa del diésel** | clave `rampKwPerH` en `defaultParams` del diésel + propagación en el mapper + **estado "no declarada"** (no 0) + aviso en el panel |
| **10.2** | **λ de degradación de la batería** | clave `degradationCost` (COP/kWh) con default **30** (valor actual) y nota del valor de la tesis (~200) |
| **10.3** | **Tarifas de red** | claves `costFixed`, `costVariable`, `tariffMode` (`hora`\|`mes`) y **ToU opcional** (`touValley`, `touMedia`, `touPeak`) → el mapper envía **vector de 24 h** cuando está activo. **Actualizar los 3 sitios** del §2.2 |
| **10.4** | **Política de frescura** | `CALIBRATION_MAX_AGE_DAYS` (env, default **30**) + exponerla en el endpoint de estado del cambio 09. **No va en el diagrama**: no es un dispositivo |
| **10.5** | **Unidades y estados vacíos** | etiquetas nuevas con unidad explícita en `paramLabels`; soporte de campo **opcional** (vacío ≠ 0) en `ParamField` |

**Decisión declarada**: el incremento 10.5 toca un componente **compartido** por todos los
dispositivos. La regla es: **el comportamiento actual no cambia** para las claves existentes (todas
numéricas obligatorias); la opcionalidad se activa **solo** para claves declaradas en una lista
(`OPTIONAL_PARAMS = ['rampKwPerH']`).

---

## 4. Contrato de datos

**Claves nuevas en `defaultParams`** (nombres en el estilo camelCase del panel):

| dispositivo | clave | unidad | default | va al solver como |
|---|---|---|---|---|
| diésel | `rampKwPerH` | **kW/h** | *(ninguno → no declarada)* | `ramp_kw_per_h` **solo si está declarada** |
| batería | `degradationCost` | **COP/kWh** | `30` | `degradation_cost_per_kwh` |
| red | `costFixed` | **COP** | `40` | `cost_fixed` |
| red | `costVariable` | **COP/kWh** | `60` | `cost_variable` |
| red | `tariffMode` | `'hora'`\|`'mes'` | `'hora'` | `cost_fixed` (hora) o `cost_fixed_month` (mes) |
| red | `touValley`/`touMedia`/`touPeak` | **COP/kWh** | *(sin declarar)* | `cost_variable` como **vector 24 h**; si no → escalar `costVariable` |

**Regla de compatibilidad**: si una clave nueva no existe en el nodo (diagrama guardado antes de este
cambio), el mapper usa el **valor de hoy** → **el job resultante es idéntico al actual**.

**Perfil ToU propuesto** (el ya validado, `experiments/config.py:64-70`), declarado en la UI:
```
00:00–05:59 valle    · 06:00–18:59 media · 19:00–21:59 pico · 22:00–23:59 media
```
Las franjas horarias **no** son editables en este cambio (solo las 3 tarifas); declararlo así evita
un editor de franjas que nadie pidió.

---

## 5. Líneas a tocar (declaradas una a una)

| # | Archivo | Líneas | Acción |
|---|---|---|---|
| 1 | `.../diagram/constants/deviceTypes.js` | `:146-153` (diésel) | añadir `rampKwPerH: null` |
| 2 | `.../diagram/constants/deviceTypes.js` | `:220-224` (batería) | añadir `degradationCost: 30` |
| 3 | `.../diagram/constants/deviceTypes.js` | `:186-189` (red) | añadir `costFixed: 40`, `costVariable: 60`, `tariffMode: 'hora'`, y los 3 ToU (sin declarar) |
| 4 | `.../diagram/DiagramOptimizationPanel.jsx` | `:31-40` (mapper diésel) | propagar `ramp_kw_per_h` **solo si** `rampKwPerH` está declarada |
| 5 | `.../diagram/DiagramOptimizationPanel.jsx` | `:48-53` (mapper red) | usar las claves nuevas; `cost_variable` vector si hay ToU; `cost_fixed_month` si `tariffMode === 'mes'`; `max_export_kw` desde su propia clave |
| 6 | `.../diagram/DiagramOptimizationPanel.jsx` | `:54-64` (mapper batería) | `degradation_cost_per_kwh` desde `degradationCost` (default 30) |
| 7 | `.../diagram/DiagramOptimizationPanel.jsx` | `:82` (`gridDefault`) | **mismo** cambio que el #5 (evita el §2.2) |
| 8 | `.../diagram/components/DeviceConfigPanel.jsx` | `:98-108` (`paramLabels`) | etiquetas nuevas **con unidad** |
| 9 | `.../diagram/components/DeviceConfigPanel.jsx` | `:12-25` (`ParamField`) | soportar **opcional** (vacío ≠ 0) para las claves de `OPTIONAL_PARAMS` |
| 10 | `.../diagram/components/DeviceConfigPanel.jsx` | **añadir** | definir `OPTIONAL_PARAMS = ['rampKwPerH']` |
| 11 | `Backend/services/mpcScheduler.js` | `:20-40` (`DEFAULT_TOPOLOGY`) | reflejar las claves nuevas para el caso "sin diagrama guardado" |
| 12 | `optimization/prediction/main.py` | endpoint de estado (cambio 09) | exponer `max_age_days` efectivo |

**No se toca**: `optimization/solver/**` (el 08 ya introduce las claves en el modelo),
`calibration/**`, `deviceTypes` de otros dispositivos.

---

## 6. Criterios de cierre — verificables EJECUTANDO (sin validación)

- [ ] **C1 · Los campos aparecen**
  → captura del panel del **diésel**, de la **batería** y de la **red** con los campos nuevos y su
  unidad en la etiqueta.

- [ ] **C2 · El valor viaja al solver (no se queda en la UI)**
  → editar `degradationCost = 200` en el nodo batería → disparar optimización → el payload del job
  contiene `degradation_cost_per_kwh: 200`. **Evidencia: el JSON del job** (Redis o log), no una
  descripción.

- [ ] **C3 · Sin declarar ≠ 0 (el pitfall del §2.4)**
  → dejar `rampKwPerH` **vacío** → el job **NO** contiene `ramp_kw_per_h` (o lo lleva `null`), y el
  resultado trae el `warning`. **Criterio: nunca `0`.**
  → con `rampKwPerH = 25` → el job lleva `25`.

- [ ] **C4 · ToU horario**
  → declarar valle/media/pico → el job lleva `cost_variable` como **vector de 24 valores** que
  respeta el perfil del §4; sin ToU declarado → escalar (comportamiento de hoy).

- [ ] **C5 · Sin regresión (comparabilidad)**
  → un diagrama **sin** las claves nuevas produce un job **idéntico al actual** (comparar contra una
  corrida guardada). Si difiere, se declara la diferencia y por qué.

- [ ] **C6 · Los 3 sitios coherentes**
  → `grep -rn "cost_fixed"` en `Frontend/GestionFront/src` y `Backend/services/mpcScheduler.js`:
  ningún valor hardcodeado duplicado del §2.2.

- [ ] **C7 · `max_age_days`**
  → el endpoint de estado (cambio 09) devuelve el valor efectivo; con la variable sin definir → **30**
  (default declarado).

---

## 7. Riesgos declarados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | El pitfall `parseFloat('') || 0` puede escribir 0 en la rampa | C3 lo verifica explícitamente; 10.5 lo corrige solo para claves opcionales |
| 2 | Exponer λ puede **congelar la batería** si el operador pone 200 (es el valor correcto, pero cambia el comportamiento) | mostrar el valor de referencia de la tesis en la etiqueta/ayuda; **no** cambiar el default (30) |
| 3 | ToU mal configurado → planes con otra economía | el vector se construye con el perfil validado; las franjas no son editables aquí |
| 4 | Un diagrama viejo sin las claves nuevas | el mapper aplica los valores de hoy → job idéntico (C5) |
| 5 | Cambiar el mapper puede afectar a otros dispositivos | los cambios se limitan a diésel, red y batería; los demás mappers no se tocan |

---

## 8. Fuera de alcance (declarado)

| tema | dónde va |
|---|---|
| Rampa y no-simultaneidad **en el modelo** | `cambio_08` |
| `stale`/antigüedad del artefacto (el cálculo) | `cambio_09` |
| Editor de **franjas horarias** ToU | decisión posterior (hoy solo 3 tarifas) |
| Editor visual de curvas de coste del diésel (`costA/B/C`) | ya existe como campos; sin cambios |
| Re-validar con los parámetros nuevos (Exp A/A2) | bloque de **validación**, al final |

---

## 9. Fila para la tabla de `integracion_plataforma/README.md`

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **10** | `cambio_10_ui_parametros_configurables/` | Parámetros operativos configurables desde la UI: rampa del diésel, λ de degradación, tarifas de red (+ToU), política de frescura y unidades explícitas | 🟡 Spec v1 · sin implementar · **depende del 08** |
