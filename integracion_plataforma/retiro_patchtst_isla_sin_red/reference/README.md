# Retiro de PatchTST + red acoplada al diagrama (sin bloque Red = isla)

Verificado ejecutando (Playwright + backend/frontend en vivo + solver real).
Detalle de criterios en `../VERIFICACION.md`. Regla del proyecto: nada de
cifras a mano; lo no medido se declara, no se tabula.

| archivo | bytes | sha256 |
|---|---|---|
| `resultados/c1_dashboard_sin_experimental.png` | 117567 | `09f31840dd080f8d45dc000798d9f59efa0e74442c25ab081c2d988eabbd9b9e` |
| `resultados/c2_aviso_modo_isla.png` | 117612 | `5f214a4fb2c4fda5ae1cf9f537acbaa906d210e3801374b067b07c4b0cd64e10` |

> Los sha256 son **completos (64 hex)**, recalculados en el mismo commit que
> toca este README. Verificación canónica: `git show HEAD:<path> | sha256sum`.
> PatchTST queda congelado en `optimization/prediction/patchtst/` como
> referencia (no elegible): `fase_1/` y comparativas históricas lo conservan.
