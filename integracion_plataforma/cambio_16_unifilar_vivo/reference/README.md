# reference — cambio_16_unifilar_vivo

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos**: no hay JSON/CSV de mediciones que el
implementador no pueda generar. **Sí lleva la referencia VISUAL** (figuras vectoriales) que la spec
cita: el implementador **copia** de aquí en vez de inventar iconografía.

## Documentos que la spec cita (ya versionados en el repo)
- `../../docs/PLAN_AMPLIACION_MODELO_ELECTRICO.md` (§F6: rediseño visual y reglas de fluidez)
- `../../docs/PLAN_DIAGRAMA_Y_MODELOS.md` (modelos por dispositivo)
- `../AUDITORIA_12.md` (auditoría de la cadena de confianza)

## Manifiesto (sha256 del blob versionado, LF)

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 6287 | `e4740b3a8957cbf7f29cbb8e14d678e10b6da503206e931ad06dbf42cba51529` |
| `docs/DECISION_VISUAL.md` | 3177 | `4f0674801ad7ba5e9f77421ab5cf77f063b28f2b4a1f192bbae8b443a08f3e87` |
| `figuras/unifilar_variante_b.svg` | 11605 | `e01476da99da9a3e7ab3f6f85dd27d330818092eea57a04c1e4a8cf842d6eb83` |
| `figuras/simbolos.svg` | 7434 | `afec9a3eb3cfd57a189f8799bfc257f4a84c7861c4ec06fe95af8eea3e6b5b5c` |
| `figuras/unifilar_variantes.html` | 20516 | `4c07a6efba5e7b9b742a95d84d3e562a95c8a48f5d33c8b044b4830159c16bf3` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
