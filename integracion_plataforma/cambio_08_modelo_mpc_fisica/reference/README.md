# `reference/` — paquete de referencia del cambio 08

**Este cambio NO requiere artefactos opacos.** Todo lo que la spec cita vive en el propio
repositorio y el implementador puede abrirlo. Se declara aquí para que no haya dudas de que
"no hay `reference/`" es una decisión, no un olvido.

| la spec cita | dónde vive (verificado, HEAD `d8983af`) | qué se mira |
|---|---|---|
| El modelo **ignora** `grid.max_export_kw` | `optimization/solver/model_builder.py:216-222` | `max_export = -grid_min` si `grid_min < 0`; el campo de la topología no se lee |
| Límites de import/export sin exclusión mutua | `model_builder.py:235-238`, `:251-258` | dos variables `NonNegativeReals`, sin binaria |
| Cargo fijo de red **por hora** | `model_builder.py:491` (objetivo) y `:808` (desglose) | `grid_d` se suma en cada hora del horizonte |
| Topología de producción | `Backend/services/mpcScheduler.js:20-40` | diésel `max_kw 300 / min_kw 50`; grid `max_import 400`, `max_export_kw 300`, `min_import_kw -300`, `cost_fixed 40` |
| **Ausencia de rampa** en todo el sistema | `grep -rn "ramp" optimization Backend Frontend/GestionFront/src` | **0 resultados**: no existe ni en el modelo, ni en la API, ni en el editor |
| Evidencia de la auditoría (§A.1: A8, A9, A10) | `../cambio_06_banda_conformal/reference/docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` | **una sola copia versionada** — no se duplica por cambio |

## Lo que debe fijar el AUTOR (no el implementador)

| dato | para qué | estado |
|---|---|---|
| `ramp_kw_per_h` real del generador | restricción de rampa (08.1) | ⏳ **pendiente: dato del fabricante** |
| Naturaleza del cargo fijo: ¿`cost_fixed` por hora de conexión o cargo fijo **mensual** del contrato? | contabilidad del término fijo (08.3) | ⏳ **pendiente: decisión del autor** |

**Regla mientras no lleguen esos datos** (spec §2.1): si `ramp_kw_per_h` no viene, el modelo
**no impone rampa** y devuelve un `warning` explícito. Nunca un 0 silencioso ni un valor inventado.
