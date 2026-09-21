# VERIFICACIÓN — Cambio 04 (comparativa corta, 4 meses)

**Commit verificado**: `e4e10a8`. **Método**: los 7 criterios del spec, ejecutados sobre los
artefactos nuevos + revisión visual de las figuras + servicio Node ejecutado.

**Veredicto**: ✅ **la comparativa quedó válida** (7/7). Un solo defecto, **cosmético**
(el banner de stale da falso positivo).

---

## ✅ Los 7 criterios

| # | Criterio | Resultado |
|---|---|---|
| 1 | Sin filas degeneradas | ✅ **0** filas con `mae == 0` (antes 12) |
| 2 | Cobertura por horizonte (anti-aliasing) | ✅ GHI `157/160/160/160/160/160`; temp `320` en los 6 |
| 3 | Ventana limpia | ✅ solo parciales `2026-06 … 2026-09`; **ningún `2025-*` mezclado** |
| 4 | Fila del MOS interpretable | ✅ **prueba dura**: `mos cloud_cover 13.61 == ecmwf_crudo 13.61` **exacto** → el pass-through coincide con el crudo, luego el proxy **es** el IFS |
| 5 | `comparativa_series.json` generado | ✅ 24 puntos (cada 3 h), 4 contendientes, 10 variables → el overlay ya dibuja |
| 6 | Figuras regeneradas y legibles | ✅ barras = **skill adimensional** con N/A en nota al pie; curvas con leyenda correcta (no lista series ausentes) |
| 7 | Duelo MOS vs PatchTST resuelto | ✅ (ver tabla) |

---

## 📊 El resultado honesto (MAE a h = 24, filtro diurno)

| Variable | **mos** | patchtst | ecmwf_crudo | gana |
|---|---|---|---|---|
| surface_pressure | **0.43** | 0.64 | 1.60 | 🟢 MOS (**−73%** vs crudo) |
| temperature_2m | **0.81** | 1.01 | 1.18 | 🟢 MOS (**−31%**) |
| relative_humidity_2m | **6.99** | 9.30 | 12.56 | 🟢 MOS (**−44%**) |
| direct_normal_irradiance | **162.5** | 195.4 | — | 🟢 MOS |
| precipitation | 0.11 | 0.13 | — | pass-through |
| cloud_cover | 13.61 | 21.36 | 13.61 | empate (pass-through) |
| **shortwave_radiation** | 48.67 | 93.11 | **47.03** | 🔴 **el crudo** (MOS −3,4%) |
| diffuse_radiation | 45.56 | 41.78 | — | 🔴 climatología (41.26) |
| wind_speed_100m | 4.83 | **2.91** | — | 🔴 patchtst (**el MOS es el peor**) |
| wind_speed_10m | 2.62 | **1.75** | 8.84 | 🔴 patchtst |

**GHI por horizonte** (el hallazgo más matizado):

```
h        1      6     12     24     48     72
mos   37.91  46.69  46.98  48.67  49.52  51.78
crudo 40.75  46.22  46.22  47.03  47.28  46.87
```

→ El MOS **gana en h=1** (−7%) y **pierde desde h≥6** (+1% a +10%). La corrección aporta a
muy corto plazo, pero **no mejora al NWP en radiación más allá de 6 h**.

---

## Conclusiones para la tesis

1. **Frente al ML puro, el MOS arrasa**: GHI 48.67 vs 93.11 de PatchTST (**−48%**).
   Es el único contendiente competitivo en radiación **y** termodinámica a la vez.
2. **Frente al NWP crudo, el MOS aporta donde el crudo falla**: presión −73%, viento10 del
   crudo −3,2 en skill, RH −44%, temp −31%. Ahí la corrección por ML es decisiva.
3. **Pero en GHI el NWP ya es excelente** y el MOS no lo mejora (empate técnico, leve
   pérdida). Honesto: *"el MOS corrige los sesgos del NWP, no su radiación"*.
4. **Viento = punto débil real**: el MOS queda **peor que la persistencia** (skill −0,40 en
   wind100). La corrección **sobrecorrige** el viento.
5. **Acción derivada** (mejora concreta, no urgente): para **viento**, usar el **NWP crudo o
   PatchTST** en vez del MOS — o recalibrar esa variable. Arquitectura híbrida:
   MOS para radiación+termo, NWP/PatchTST para viento.

---

## ⚠️ Defecto encontrado (cosmético) — el banner de stale da FALSO POSITIVO

Ejecutado:

```
HEAD: e4e10a8 | dataCommit: 468f22d | stale: true   ← avisa "datos previos al fix"
git merge-base --is-ancestor 1a0c19d 468f22d  →  SÍ  ← los datos SÍ son posteriores al fix
```

La comprobación `dataCommit !== head` **siempre** será verdadera: commitear los resultados
mueve el HEAD. Así que el banner se queda encendido para siempre, con datos válidos.

**Arreglo recomendado (el robusto)**: que el runner grabe en `meta` **qué proxy usó**
(`"proxy": "ecmwf_ifs025"`) y el servicio marque stale solo si no coincide. Es semántico,
no depende del historial de git y no tiene falsos positivos.
Mínimo alternativo: comprobar ancestría (`git merge-base --is-ancestor <fix> <dataCommit>`).
