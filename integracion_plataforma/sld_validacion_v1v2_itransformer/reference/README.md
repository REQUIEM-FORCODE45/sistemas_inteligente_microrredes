# SLD: validación por escenarios (V1/V2) + pronóstico por componente

Panel "Resultados MPC" del Single-Line Diagram: V1/V2 de `fase_1_mos/`
(S-MPC vs D-MPC, provider mos declarado) + comparativa MOS vs iTransformer
solo vs NWP crudo (componentes de pronóstico reutilizados, sin corridas).
Verificado ejecutando (Playwright + backend/frontend en vivo). Fechas y
números en `../VERIFICACION.md`. Regla del proyecto: nada de cifras a mano.

| archivo | bytes | sha256 |
|---|---|---|
| `resultados/sld_v1v2_tablas.png` | 113177 | `20b521e75e86efb3c0fd90bdc1858a4cccfad8eb00785ce6c4a04a39ad147182` |
| `resultados/sld_pronostico_curvas.png` | 77873 | `3cb1b5b4cf7e50a6d08947760f32bf7ae6f34358a66012d7ad0ff2b4afb852d5` |
| `resultados/sld_pronostico_overlay.png` | 124343 | `17a72b0c95815c2904b9de7b08fd03aa14ab0940114d2d5e84badba38c28575a` |

> Los sha256 son **completos (64 hex)**, recalculados en el mismo commit que
> toca este README. Verificación canónica: `git show HEAD:<path> | sha256sum`.
> Leyendas verificadas por DOM: curvas
> `climatology/ecmwf_crudo/itransformer/mos/persistence` (sin patchtst);
> overlay `real (ERA5)/mos/itransformer/ecmwf_crudo` (sin duplicados).
> 0 `pageerror`.
