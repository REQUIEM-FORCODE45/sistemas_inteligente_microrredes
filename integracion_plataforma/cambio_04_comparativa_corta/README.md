# Cambio 04 — Comparativa CORTA (4 meses) que sustituye a la de 12

**Estado**: 🟢 listo para ejecutar.
**Decisión del autor**: se **descarta** la comparativa de 12 meses (pre-fix, con la fila del
MOS contaminada). Se hace **una sola comparativa corta** — la evidencia útil es la del
periodo reciente, no la de un año.

---

## Por qué una corrida nueva y no un parche

Los números del CSV los escribió el **código viejo** (proxy = ERA5, = la verdad). Corregir el
código no reescribe los datos: hay que **volver a ejecutar**. Y solo están mal **las filas del
MOS**; `patchtst`, `ecmwf_crudo`, `persistence` y `climatology` son correctas.

⚠️ **No sirve** re-correr unos meses y pegarlos en la tabla de 12: el resume por mes deja los
otros meses con las filas contaminadas y la tabla quedaría **mezclada sin que se note**. Por eso
se genera una tabla **propia** para la ventana corta.

---

## Comando exacto

```bash
cd <repo>            # raíz del repositorio (el outdir se ancla solo, no importa el cwd)

# 1) borrar los parciales de 12 meses: si existen, el resume los REUTILIZA
#    y reproduciría la tabla vieja en segundos, sin avisar.
rm -f results/pasto_narino/forecast/comparativa_detalle_20*.csv

# 2) corrida corta (4 meses, ~5 parciales por los meses de borde)
python3 -m optimization.prediction.compare_providers \
  --months 4 \
  --step-h 6 \
  --providers mos,patchtst \
  --horizons 1,6,12,24,48,72 \
  --step-delay 3
```

Notas del runner (verificado en el código):

- `end = hoy - 14 días`; `start = end - 4 × 30,42 días` → ventana ≈ **4 meses**.
- Los meses se escriben como parciales `comparativa_detalle_YYYY-MM.csv`; **el resume está
  activo por defecto** → si la cuota corta, se relanza **el mismo comando** y continúa.
- La verdad (ERA5) se pide **en un solo fetch** con reintentos pacientes ante 429.
- `--step-h 6` es obligatorio: con 24 reaparece el **aliasing** de radiación (solo h=12).

**Costo estimado**: ~1/3 de la corrida de 12 meses → **~3 h**, con buena probabilidad de
caber en la cuota de un día.

---

## Qué borrar y qué conservar

| Borrar | Conservar |
|---|---|
| `comparativa_detalle_20*.csv` (12 parciales) | `baselines_mae.csv`, `walkforward_mae_long.csv` (**son del repo**, de `evaluate.py` — no tocar) |
| El agregado viejo se **sobrescribe** solo | Los `.py` y el `.gitattributes` |

---

## Cómo obtener la vista de 3 meses (sin re-correr)

Los parciales guardan **una fila por paso** (no agregados), así que la vista de 3 meses se
**deriva filtrando** los 3 meses centrales de los parciales de la corrida de 4. No hace falta
una segunda corrida.

---

## Verificación (la haré yo al hacer pull)

1. **Radiación sin degenerados**: `mos` con MAE > 0 en `cloud_cover` y `precipitation`
   (hoy dan 0.000 exacto = tautología).
2. **Cobertura**: GHI con muestras en los **6 horizontes** y conteos balanceados
   (prueba de que no volvió el aliasing).
3. **Ventana coherente**: los parciales son **solo** de la ventana nueva (no queda ningún
   `2025-*` mezclado).
4. **Fila del MOS interpretable**: el proxy del backtest es IFS, no ERA5 → comparar el MAE
   del MOS contra el `ecmwf_crudo` del **mismo periodo**.
5. **`comparativa_series.json` generado** → el overlay deja de estar oculto.
6. **El banner de stale desaparece** (el `meta.commit` del nuevo `skill.json` coincidirá con
   el HEAD de la corrida).
7. **El duelo MOS vs PatchTST queda resuelto** en temp/presión/RH/viento (hoy sin resolver
   por la contaminación).

---

## Trampas

1. **Borrar los parciales ANTES** (si no, el resume produce la tabla vieja en segundos).
2. **No tocar** `baselines_mae.csv` ni `walkforward_mae_long.csv` (artefactos propios del repo).
3. **No** correr con `--step-h 24` (aliasing) ni con `--months 20` (vuelve a 12+ meses).
4. Si la cuota corta a mitad: **relanzar el mismo comando** (resume), nunca `--no-resume`.
