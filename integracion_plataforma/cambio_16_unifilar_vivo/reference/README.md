# reference — cambio_16_unifilar_vivo

## Artefactos de datos
Este incremento introduce artefactos de MEDICIÓN propios (línea base de
fluidez C0 + captura del lienzo), versionados abajo con bytes + sha256.
Fuera de eso no hay JSON/CSV de mediciones que el implementador no pueda
generar. **Sí lleva la referencia VISUAL** (figuras vectoriales) que la spec
cita: el implementador **copia** de aquí en vez de inventar iconografía.

## Documentos que la spec cita (ya versionados en el repo)
- `../../docs/PLAN_AMPLIACION_MODELO_ELECTRICO.md` (§F6: rediseño visual y reglas de fluidez)
- `../../docs/PLAN_DIAGRAMA_Y_MODELOS.md` (modelos por dispositivo)
- `../AUDITORIA_12.md` (auditoría de la cadena de confianza)

## Manifiesto (sha256 del blob versionado, LF)

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 7621 | `3e78ca6a4520ad705216a12a54010cfa8136fcaf97c68e696a1e6d0a234a0fbf` |
| `docs/DECISION_VISUAL.md` | 3333 | `89650abd5dbcb9bdc65f038bd107a1379cea5a6bbe69ced4b5689398d9ca35df` |
| `figuras/unifilar_variante_b.svg` | 11770 | `4ac9c7c1a41a76b9f983c1f8148c32e58129098ff98d5ba2e902bf9b5eb9139c` |
| `figuras/simbolos.svg` | 7599 | `31b50aa306de47dfe752d99350dfcc795ba16345b28c6e17aa2993e1a25eeac8` |
| `figuras/unifilar_variantes.html` | 20681 | `b3364c9219b1214014494999dec1b2d77083b0442bf1a96c14ed1de002eb14db` |
| `resultados/fps_baseline_c0.json` | 851 | `c22b0c66fce5da9ba8a1dce9c6705c89e4685dc2596e61032fddd1b0ea2b29c8` |
| `figuras/c16_editor.png` | 154456 | `64ee9277e03d6c0c99186fd8641a5965345543af7a5c31f84cbc40f98d2d3370` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
