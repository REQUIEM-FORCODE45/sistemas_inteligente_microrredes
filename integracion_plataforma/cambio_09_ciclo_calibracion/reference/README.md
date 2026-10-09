# `reference/` — paquete de referencia del cambio 09

**Este cambio NO requiere artefactos opacos.** Las piezas que la spec cita están en el repositorio
y son legibles. El único dato externo es una **decisión del autor** (edad máxima del artefacto).

| la spec cita | dónde vive (verificado, HEAD `d8983af`) | qué se mira |
|---|---|---|
| **Detector de deriva ya implementado** | `optimization/monitoring/drift.py:42-68` (`detect_drift`) | exige `baseline_rmse_kw` como argumento → **sin él no puede correr** |
| RMSE rodante | `drift.py:34-39` (`rolling_rmse`, ventana 168 h) | ventana ya parametrizada |
| **Demo reproducible del gatillo** | `drift.py:71-84` (`simulated_monitoring`) | **es la base del criterio de cierre C2**: inyecta deriva a los 30 días sin datos reales |
| Ajuste por sensor + caché | `optimization/calibration/service.py:275-321` | `force=False` → "solo si falta"; `force=True` → reajusta |
| Artefacto **sin fecha ni baseline** | `service.py:143-147` (construcción) y `:324-338` (`_summary_of`) | el RMSE se calcula (`:148-149`) pero **no se persiste en el `.pkl`** |
| Endpoints actuales | `optimization/prediction/main.py:80-97`, `:100-112`, `:115-140` | no hay `calibrated_at`, ni `age_days`, ni `stale`, ni endpoint de deriva |
| Proveedor climático efectivo | `optimization/prediction/forecaster.py:436-446` | default `openmeteo`; `patchtst` solo se fija en `deploy_pi.sh:52` |
| Evidencia de la auditoría (§B.4: B7, B8, B9) | `../cambio_06_banda_conformal/reference/docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` | una sola copia versionada |

## Lo que debe fijar el AUTOR (no el implementador)

| dato | para qué | estado |
|---|---|---|
| `max_age_days` (edad máxima de un artefacto antes de marcarlo `stale`) | 09.3 / 09.4 | ⏳ **pendiente: decisión del autor** (¿7 días? ¿30?) |
| `threshold_mult` del gatillo de deriva | 09.2 / 09.4 | valor actual del código: **2.0×** — confirmar si se mantiene |

**Comportamiento mientras no lleguen esos datos**: `stale` se calcula con el parámetro declarado
(si falta, se expone `age_days` y `stale: null` — **nunca `false` inventado**); el gatillo usa el
defecto documentado del código y lo declara en la respuesta.

> **Nota de vida del cambio**: la **recalibración automática en caliente NO se activa** en este
> cambio (spec §3, decisión declarada). Primero se **mide y avisa**; el disparo automático es un
> cambio posterior, con la frecuencia real de deriva medida.
