# `integracion_plataforma/` — Integración de desarrollos de la tesis

Carpeta de trabajo para integrar en la plataforma los desarrollos del proyecto de
tesis (`C:\Users\2D\tesis-microrred`). Cada incremento vive en su **carpeta numerada**
y se planifica **antes** de crearse.

> **Regla de oro**: aquí solo se **AÑADEN** archivos. **No se modifica** código
> existente del repositorio. Cada cambio declara explícitamente las líneas que toca.

---

## Cambios

| # | Carpeta | Objetivo | Estado |
|---|---|---|---|
| **01** | `cambio_01_mos_forecaster/` | Integrar el **MOS** como provider de clima (PASO 1) + comparativa con el protocolo del repo (PASO 2) | 🟡 PASO 1 ✅ auditado · PASO 2 ✅ **cerrado con lo verificado** → `CIERRE_PASO2.md` |
| **02** | `cambio_02_correcciones_mos/` | Corregir los 3 defectos hallados en la revisión QA del Cambio 01 | ✅ **Cerrado y verificado** (`b92c72c`) |
| **03** | `cambio_03_mos_visible_dashboard/` | **Ver el MOS en el Dashboard**: añadirlo al selector de providers + avisos de credibilidad (N/A en la tabla, datos previos al fix) | ✅ **3.1–3.6 implementado y verificado** (`f3abca8`) · 🟢 3.7 (reproducibilidad) → `VERIFICACION.md` |
| **04** | `cambio_04_comparativa_corta/` | **Sustituir la comparativa de 12 meses por una corta (4 meses)**: la de 12 quedó pre-fix y su fila del MOS no es interpretable | ✅ **Cerrado** (`e4e10a8` + banner `8c4d9a5`): 7/7 criterios, fila del MOS **válida**, defecto del banner **resuelto** → `VERIFICACION.md` |
| **05** | `cambio_05_contexto_climatico_visual/` | **Contexto climático visual**: índices ENSO (ONI/RONI), mapa literal + superficie continua de Nariño, IA visible, almacén append-only + página `/clima` | 🟡 Plan v1.1 + `reference/` verificado (C1–C4) · MVP 05.1+05.6+05.7 en curso → `VERIFICACION_MVP.md` |
| **06** | `cambio_06_banda_conformal/` | **Banda de incertidumbre del MPC**: split disjunto + cuantiles del predictor final + banda asimétrica — la banda que alimenta los escenarios del S-MPC | ✅ **C adoptada en producción** (auditoría §7.5) · C3 con C: **87.5 %**; despacho C vs B (isla 3d): **C mejor** (−3,298 COP, ENS 0) → `VERIFICACION.md` + `AUDITORIA_06_08_09_10.md` |
| **07** | *(sin carpeta)* | **Formulación documentada ↔ código**: `informe.md` §5.1/§5.2 + anexo (escenarios 60/30/10 con factores de irradiancia) frente a `scenarios.py` (20/60/20 con cuantiles), balance `≥` vs `==`, variables no declaradas, big-M del diésel; y reportar en el dispatch la banda que el solver usó por escenario | ⏸️ **Diferido** a la redacción del capítulo (es documentación, cero riesgo de código) · **sin carpeta por regla dura 7** |
| **08** | `cambio_08_modelo_mpc_fisica/` | **Física del MPC de producción**: rampa del diésel, no-simultaneidad import/export, cargo fijo de red y contrato de exportación | ✅ **Implementado** (`bce2d03`) · auditoría por lectura ✅ · 🟠 rampa **eludible apagando/encendiendo** · 🟠 Exp B: 4.19 s medido vs 0.45 s publicado |
| **09** | `cambio_09_ciclo_calibracion/` | **Ciclo de vida de la calibración**: drift cableado (hoy código huérfano), antigüedad + `stale` del artefacto, política de refresco y proveedor declarado | ✅ **Implementado** (`bce2d03`) · auditoría: ✅ `test_drift` **8/8 verificado ejecutando** · 🟠 `rmse_antes` siempre `null` en el historial |
| **10** | `cambio_10_ui_parametros_configurables/` | **Parámetros operativos configurables desde la UI**: rampa del diésel, λ de degradación de la batería, tarifas de red (+ToU horario), política de frescura y unidades explícitas (5 de ellos hoy hardcodeados en el mapper) | ✅ **Implementado** (`bce2d03`) · auditoría por lectura ✅ (pitfall del `0` cubierto) · 🟡 `tariffMode` como texto libre |
| **11** | `cambio_11_calibracion_diesel/` | **Precio del combustible declarable por sitio** (default Pasto: 2,782 COP/L, CREG oct-2026) + curva **Willans de la tesis** (`a0/a1/a2`) + régimen **ENS/diésel declarado** en los resultados (89.29× → 5.35×) | ✅ **Implementado y verificado** (C1–C7) → `VERIFICACION.md` |
| **12** | `cambio_12_cadena_confianza/` | **Cadena de confianza del diagrama**: esquema de topología (`topology_schema.json`), **pre-flight** en el lienzo, **error atribuido al nodo**, **`device_echo`** por dispositivo (params efectivos + `modelado`/`ignorado`/`error`) e **invariantes de cobertura** (mapper↔solver) — además arregla el **desajuste UI/motor del precio** (el `100` que se veía) y añade el **unifilar base** (barra AC + símbolos SVG) con **fluidez medida** | ✅ **12.1–12.3 + migración/valor efectivo implementados** (`9fba50b`, correcciones `286c69a`) · **auditoría** (`AUDITORIA_12.md`): C1–C7 y C9 ✅ · ✅ **C8 re-medido por pares intercalados** en la misma sesión → sin degradación atribuible (⚠️ redacción a corregir: la mediana del modificado es −2.9 %, la frase "≥" es falsa) · ✅ invariante + **contrato de payload vs esquema** (3/3 PASS, corridos por la auditoría) · ✅ proxy HTTP verificado con Mongo (`2782`) · ✅ **referencia visual disponible** (variante B elegida por el autor) en `reference/figuras/` → **12.4 visual desbloqueado** · ✅ **12.4 implementado**: símbolos verbatim, bus AC decorativo, tarjetas con filete/estado, smoothstep + grosor×kW + flow CSS (pausado en drag), badges en conector, s=0 · C8 reescrito honesto (6 pares aleatorios, −2.2 %, sin degradación >10 % detectable) · **auditoría §9**: símbolos **VERBATIM 9/9** vs la referencia y grosor ∝ kW reproducido (6.00/3.48/2.43), píldora solo con datos reales, animación en CSS ✅ · 🟠 la barra es **arrastrable** (decisión de UX del autor) y **aparece en el panel de sensores sin efecto** (a filtrar) · ⚪ render del lienzo no verificado aquí · ✅ **correcciones aplicadas** (`811f9e0`): barra **anclada** con el flag genérico `draggable: !definition.decorative`, fuera del panel de sensores, ancho **880 px** · ✅ **captura en el `reference/`** (1920×1080) → **render auditado**: bus legible, grosores ∝ kW, badge `no simulable` en el inversor, el diésel ya muestra `sitio`; **falso positivo desmentido** (no hay texto tapado ni líneas bajo tarjetas) · ✅ **badge corregido** (`37f33ec`): `s=0` → **`sin modelo`** (con `s=0` reservado al seccionador del cambio 15); 3/3 tests siguen PASS y la captura del 12.4 se conserva intacta a propósito · **🏁 CAMBIO 12 CERRADO, sin ajustes abiertos** |
| **13** | `cambio_13_inversor_bus_dc/` | **Inversor modelado + bus DC**: conversión DC/AC con **eficiencia declarable** y límite, bidireccional, bus DC opcional — y **propagación de la incertidumbre** por etapas de conversión (la predicción del panel se **reutiliza**, no se re-modela) | 🟡 Spec v1 · sin implementar · depende de 12 |
| **14** | `cambio_14_transformador/` | **Transformador**: pérdidas (`P_out = P_in·(1−p)`) + límite de capacidad (`S_max·pf`), con la **frontera AC-OPF declarada** fuera de alcance (tensión/impedancia **no** se simulan; decirlo es parte del requisito) | 🟡 Spec v1 · sin implementar · depende de 12–13 |
| **15** | `cambio_15_switches_conectividad/` | **Switches de conectividad**: contrato de `connections[]`, binarias de rama (`P ≤ M·s`), y topología **elegible** por el operador *o* por el solver → el MPC deja de operar en una configuración **impuesta** (reescribe la pregunta del Exp A2) | 🟡 Spec v1 · sin implementar · depende de 12–14 |
| **16** | `cambio_16_unifilar_vivo/` | **Unifilar vivo**: flujo por potencia (grosor ∝ \|kW\| + animación direccional), badges en el conector y **vista dual** `Esquema`/`Editor` — con **medición de fluidez obligatoria** (línea base de FPS **antes** de tocar el lienzo) · ✅ **referencia visual disponible** (variante B: `reference/figuras/`) | 🟡 Spec v1 · sin implementar · depende de 12–15 |

> **Auditoría independiente (2026-10-09, commit `bce2d03`)** → `AUDITORIA_06_08_09_10.md`.
> Verificado **ejecutando** aquí: `test_conformal` 6/6, `test_calibration` 5/5, `test_drift` 8/8
> (+1 skip declarado) · script del protocolo idéntico al `reference/` (solo CRLF) · nonant de
> `U_grid` ✓ · 3 sitios del `cost_fixed` coherentes ✓.
> **Lo que depende del entorno del implementador** (corre en otra máquina: `pyomo`/`pymongo`/Mongo
> viven allí): tests del solver, re-medición del protocolo y la prueba de preexistencia de los 2
> fallos — declarado en el §5 de la auditoría, no asumido.

**PASO 2 — cerrado con una comparativa CORTA y VÁLIDA** (cambio 04; ventana 2026-05-08 → 09-06):

- ✅ **Ingeniería demostrada**: regresión cero (`max|Δmae| = 0.000e+00`), aliasing resuelto,
  Opción B correcta, panel integrado y **ejecutado**, proxy IFS aplicado (`1a0c19d`).
- ✅ **Fila del MOS VÁLIDA** — verificado con una prueba dura: su pass-through coincide
  **exacto** con el `ecmwf_crudo` (13.61) → el proxy del backtest **es** el IFS.
- 📊 **Resultado**: el MOS **arrasa al ML puro** (GHI 48.7 vs 93.1 de PatchTST, −48%) y
  **mejora al NWP crudo** en presión (−73%), RH (−44%) y temp (−31%); pero **empata/pierde
  en GHI** (crudo 47.0 vs MOS 48.7: gana en h=1 y pierde desde h≥6) y es **peor que la
  persistencia en viento** (skill −0.40).
- ⚠️ 1 defecto cosmético: el banner de stale da **falso positivo** (ver §Defecto del informe).
- 📌 La comparativa de 12 meses (pre-fix) queda **descartada**.

Detalle: `cambio_04_comparativa_corta/VERIFICACION.md` ·
histórico: `cambio_01_mos_forecaster/CIERRE_PASO2.md`.

> Los cambios posteriores a la Fase 1 (servicio de escenarios, nodo LLM-director,
> bucle evolutivo) **no están planeados todavía** y por eso **no existen carpetas**
> para ellos. Se crearán cuando su diseño esté cerrado.

### Revisión QA del Cambio 01

`cambio_01_mos_forecaster/REVISION_QA.md` — 3 defectos (2 bloqueantes) + PASO 2 sin
implementar, con causa raíz demostrada y arreglo exacto para cada uno.

| # | Defecto | Severidad |
|---|---|---|
| 1 | git/CRLF corrompe los 10 modelos LightGBM | 🔴 Crítica (Windows) |
| 2 | `precipitation` devuelve GHI crudo | 🔴 Crítica |
| 3 | Import circular `mos_forecaster` ↔ `forecaster` | 🟠 Media |
| 4 | PASO 2 (comparativa) sin implementar | ⚪ Pendiente |

---

## Cambio 01 — MOS forecaster

**Leer en este orden**:
1. `cambio_01_mos_forecaster/README.md` — guía de uso del paquete
2. `cambio_01_mos_forecaster/SPEC_MOS_FASE1.md` — especificación de implementación

### Contenido

```
cambio_01_mos_forecaster/
├── README.md                  ← guía del paquete (leer primero)
├── SPEC_MOS_FASE1.md          ← SPEC de implementación (PASO 1 y 2)
├── MANIFEST.json              ← hashes sha256 de cada artefacto
├── models/                    ← 10 correctores MOS LightGBM (YA ENTRENADOS)
├── itransformer/              ← iTransformer v1 YA ENTRENADO + config autocontenido
└── reference/                 ← recetas de referencia (runtime y features)
```

**No se reentrena nada**: los modelos se portan tal cual.

### Reglas duras (detalle en la SPEC)

1. `MAX_HORIZON_H = 72` → `RuntimeError` si piden más (igual que PatchTST).
2. `cloud_cover` y `precipitation` → **pass-through** del ECMWF en vivo (el MOS no
   mejora esas dos variables; para precipitación no hay señal física).
3. **Advertencia metodológica**: ERA5 (verdad) y ECMWF (entrada) son de la misma
   familia → el MAE es optimista. Reportar como *"NWP corregido con ML"*, nunca
   como *"ML puro"*.
4. Sin fuga de datos: `pers_h24` y `v1` solo usan información pasada.
5. Carga **lazy** del modelo (patrón `PatchTSTClimateForecaster`).
6. **No usar `TRANSFORMS` del config** (está corrupto: dicts serializados como
   listas). El correcto está en `reference/prediccion_en_vivo.py`.

### Impacto en el código existente

| Archivo | Cambio |
|---|---|
| `optimization/prediction/mos_forecaster.py` | **nuevo** (la clase) |
| `optimization/prediction/forecaster.py` | **2 líneas**: `import` + `_PROVIDERS["mos"]` |

Nada más. Los providers `openmeteo`, `timesfm` y `patchtst` no se tocan.

---

## Criterio de cierre del cambio

- [ ] El código nuevo corre sin alterar la lógica existente.
- [ ] Los providers y endpoints previos funcionan idéntico (sin regresión).
- [ ] Hay evidencia **ejecutada** (salida real), no descripción.
- [ ] Documentado en el README de su carpeta y en el HANDOFF de la tesis.

---

## Trazabilidad

- Proyecto origen: `C:\Users\2D\tesis-microrred`
- Evidencia del MOS: `tesis-microrred/docs/HANDOFF_TECNICO.md §19`
- Paquete comprimido original: `tesis-microrred/entregables/MOS_FASE1_paquete.zip`
- Verificación ejecutada: 10/10 LightGBM cargan y predicen `(72,8)→(72,)`;
  iTransformer carga con 0.50 M params, 33 features, `tgt_idx=[23..32]`.
