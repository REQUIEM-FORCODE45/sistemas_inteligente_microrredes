# reference — cambio_15_switches_conectividad

## Artefactos de datos
Este incremento introduce UN artefacto de datos: `resultados/golden_impuesto.json`
(evidencia pre-cambio del C6, cierre de auditoría §3.1 — ver manifiesto).
Fuera de eso no hay JSON/CSV/figuras que el implementador no pueda generar por
su cuenta.

## Documentos que la spec cita (ya versionados en el repo)
- `integracion_plataforma/cambio_09_ciclo_calibracion/README.md`

## Manifiesto de la spec

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 8365 | `901281c3b6374e5ab01ae5dc425b4a203f889c861c83ec409b13d534d1f0be70` |
| `figuras/cambio_15_unifilar.png` | 130585 | `7ad2dca5a5ec8991006408b4d686bb26b884cc96245fdbf6931b589035ba6c20` |
| `resultados/golden_impuesto.json` | 15604 | `078e3999c1f47c1872f63056bc2555f7ad33c3b282b91ffebddfa06f400e1df2` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
