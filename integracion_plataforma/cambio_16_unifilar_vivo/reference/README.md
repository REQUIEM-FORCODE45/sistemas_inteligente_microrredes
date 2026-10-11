# reference — cambio_16_unifilar_vivo

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos** (es una spec de arquitectura y de
contrato): no hay JSON/CSV/figuras que el implementador no pueda generar por su cuenta.
Por eso `reference/` no lleva `datos/` ni `scripts/`.

## Documentos que la spec cita (ya versionados en el repo)
- `integracion_plataforma/cambio_12_cadena_confianza/README.md`

## Manifiesto de la spec

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 6287 | `e4740b3a8957cbf7f29cbb8e14d678e10b6da503206e931ad06dbf42cba51529` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
