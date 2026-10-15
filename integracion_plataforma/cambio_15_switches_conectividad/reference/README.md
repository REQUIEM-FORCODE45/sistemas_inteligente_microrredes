# reference — cambio_15_switches_conectividad

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos** (es una spec de arquitectura y de
contrato): no hay JSON/CSV/figuras que el implementador no pueda generar por su cuenta.
Por eso `reference/` no lleva `datos/` ni `scripts/`.

## Documentos que la spec cita (ya versionados en el repo)
- `integracion_plataforma/cambio_09_ciclo_calibracion/README.md`

## Manifiesto de la spec

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 7184 | `1a71063f192167fbf9b2600a7e56db31afeb4ad55c938bc16d74cefda701e998` |
| `figuras/cambio_15_unifilar.png` | 130585 | `7ad2dca5a5ec8991006408b4d686bb26b884cc96245fdbf6931b589035ba6c20` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
