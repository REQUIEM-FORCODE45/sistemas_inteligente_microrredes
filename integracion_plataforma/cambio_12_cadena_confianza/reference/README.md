# reference — cambio_12_cadena_confianza

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos** (es una spec de arquitectura y de
contrato): no hay JSON/CSV/figuras que el implementador no pueda generar por su cuenta.
Por eso `reference/` no lleva `datos/` ni `scripts/`.

## Documentos que la spec cita (ya versionados en el repo)
- `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md`
- `integracion_plataforma/AUDITORIA_06_08_09_10.md`
- `integracion_plataforma/cambio_11_calibracion_diesel/README.md`

## Manifiesto de la spec

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 10179 | `980ba68d5b2927843e884dba70d5b2e001d60a1e689ebfe859e724eb4c848857` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
