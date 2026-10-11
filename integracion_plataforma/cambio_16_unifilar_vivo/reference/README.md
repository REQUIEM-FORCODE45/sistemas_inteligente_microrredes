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
| `docs/DECISION_VISUAL.md` | 3333 | `89650abd5dbcb9bdc65f038bd107a1379cea5a6bbe69ced4b5689398d9ca35df` |
| `figuras/unifilar_variante_b.svg` | 11770 | `4ac9c7c1a41a76b9f983c1f8148c32e58129098ff98d5ba2e902bf9b5eb9139c` |
| `figuras/simbolos.svg` | 7599 | `31b50aa306de47dfe752d99350dfcc795ba16345b28c6e17aa2993e1a25eeac8` |
| `figuras/unifilar_variantes.html` | 20681 | `b3364c9219b1214014494999dec1b2d77083b0442bf1a96c14ed1de002eb14db` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
