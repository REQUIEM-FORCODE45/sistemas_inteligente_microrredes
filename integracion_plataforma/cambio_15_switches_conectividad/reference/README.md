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
| `../README.md` | 8365 | `901281c3b6374e5ab01ae5dc425b4a203f889c861c83ec409b13d534d1f0be70` |
| `figuras/cambio_15_unifilar.png` | 130585 | `7ad2dca5a5ec8991006408b4d686bb26b884cc96245fdbf6931b589035ba6c20` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
