# `reference/` — paquete de referencia del cambio 10

**Este cambio NO requiere artefactos opacos**: todo lo que la spec cita está en el repositorio y es
legible. Se declara aquí, con las líneas exactas, para que el implementador no dependa de otra
persona.

| la spec cita | dónde vive (verificado, HEAD `e8ea4a4`) | qué se mira |
|---|---|---|
| **El panel es genérico** | `Frontend/.../diagram/components/DeviceConfigPanel.jsx:94-96` | `Object.keys(defaultParams)` → un campo por clave, sin código por dispositivo |
| **El pitfall del vacío → 0** | `DeviceConfigPanel.jsx:21-23` | `parseFloat(e.target.value) \|\| 0` — **un campo numérico vacío se guarda como 0** |
| Etiquetas **con unidad** | `DeviceConfigPanel.jsx:98-108` (`paramLabels`) | `maxCapacity: 'Capacidad máxima (W)'` — el sitio donde declarar las nuevas |
| Los 5 parámetros hardcodeados | `.../diagram/DiagramOptimizationPanel.jsx:48-64` | `cost_fixed: 40`, `cost_variable: 60`, `degradation_cost_per_kwh: 30.0`, `max_export_kw = max_import × 0.75` |
| **Segundo sitio con la tarifa** | `DiagramOptimizationPanel.jsx:82` (`gridDefault`) | mismo `cost_fixed`/`cost_variable` duplicados → hay que cambiar **los dos** |
| Tercer sitio (backend) | `Backend/services/mpcScheduler.js:20-40` | `DEFAULT_TOPOLOGY` (solo si nunca hubo diagrama guardado) |
| **Perfil ToU ya validado** | `optimization/experiments/config.py:64-70` | valle **45** (00-05) · media **80** (06-18 y 22-23) · pico **140** (19-21) — 24 valores con `assert` de longitud |
| El modelo acepta ToU | `optimization/solver/model_builder.py:459-463` | `cost_variable` como **vector de 24 h** o escalar |
| Definiciones de dispositivo | `.../diagram/constants/deviceTypes.js:139-232` | diésel, red, batería (defaultParams) |

## Dato externo que debe confirmar el AUTOR

| dato | para qué | estado |
|---|---|---|
| **λ de degradación realista de la tesis** (se ha usado ≈200 COP/kWh en la línea de trabajo de la tesis) | valor de referencia mostrado en la UI; **el default del código se mantiene en 30** | ⏳ **confirmar la cifra exacta antes de mostrarla en la etiqueta** |
| Rampa del generador (fabricante) | activación del campo (el default es *"no declarada"*) | ⏳ pendiente (también listado en `cambio_08`) |

**Regla**: mientras no se confirmen, la UI **no muestra una cifra inventada**. El campo del λ usa el
default del código (30) y el de la rampa queda **sin declarar** (nunca `0`: ver el pitfall).

## Nota sobre verificabilidad

Los criterios C2 y C3 de la spec exigen **evidence del payload del job** (el JSON que recibe el
solver), no una captura de la UI. Es la única forma de demostrar que el valor **viajó** en vez de
quedarse en el formulario.
