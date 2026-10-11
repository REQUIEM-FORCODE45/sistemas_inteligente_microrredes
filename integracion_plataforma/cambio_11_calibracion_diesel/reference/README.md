# `reference/` — paquete de referencia del cambio 11

Artefactos que **el implementador no puede abrir por sí mismo** (viven fuera de este repositorio o en
un portal externo). Tamaño + sha256 por archivo (regla dura 2: toda cifra sale de un artefacto).

| archivo | bytes | sha256 |
|---|---|---|
| `datos/diesel_willans_fase2.json` | 647 | `0b904c9f39fa137f977b2937b08d52c8f35ac1d6bfdd75f7bea4ee98057bbeda` |
| `datos/precio_acpm_pasto_creg_2026-10.md` | 1692 | `2746c362aa1ed46901b40c7e56470f1c826a2c9d66b8ada7fb264385ae78ca24` |
| `datos/precio_combustible_tesis.md` | 1914 | `603233670ffd5705bc8ef5b6da171076c449e6e9e31ccbcad3a685441e4739c2` |

## Qué es cada cosa

| archivo | para qué |
|---|---|
| `datos/diesel_willans_fase2.json` | la **Willans calibrada** de la tesis (`a0=1.8, a1=0.24, a2=0.0012`, `mae=2.5e-14`). Es la fuente de los `cost_c/cost_b/cost_a` del repo. Vive en `tesis-microrred/reports/fase2/resultados_fase2.json` (fuera de este repositorio) |
| `datos/precio_acpm_pasto_creg_2026-10.md` | el **precio de Pasto** citado por la spec ($10,529/galón → **2,782 COP/L**) con la tabla por ciudad y la conversión usada. Fuente: Portal CREG |
| `datos/precio_combustible_tesis.md` | el precio que usa HOY la tesis (**4,500 COP/L**, `ems_balance.py:157`) y su uso consistente en el Módulo 3, para que la diferencia **+62 %** quede declarada y no parezca una inconsistencia |

## Nota de trazabilidad

- El precio es un **dato del sitio con vigencia**: no se escribe a mano en informes ni en código. El
  YAML (`sites/pasto_narino.yaml`) es la única fuente, y el resultado del solver reporta el valor
  efectivo con su origen (`fuel_price_applied`).
- El **consumo** también es verificable: la Willans da **336 L/MWh** a 50 kW frente a los **560 L/MWh**
  de la curva paramétrica del repo (C7 de la spec).
