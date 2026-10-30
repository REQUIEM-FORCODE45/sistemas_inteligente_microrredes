# CIERRE — Sprint 1, paquete A (iTransformer sano, con tests y en la página)

**Estado: CERRADO** (2026-10-28). Cierra el alcance que se podía ejecutar; lo bloqueado y lo diferido
se declaran abajo, con su motivo.

Commits: `a5a29ab` (tests + sort + recorte + strict), `f7e5fc1` (provider), `f60b849` (`--providers`),
`79e469d` (VERIFICACION + tabla), `a4184d1` (1a.5 leyenda + H1 re-captura), `c3070bb` (P10 corte).

---

## 1. Los 6 pasos del plan

| Paso | Qué | Estado |
|---|---|---|
| **5.0** | Reconstruir el pipeline de entrenamiento del MOS y reproducir los boosters | 🔵 **BLOQUEADO** — no hay parquet de entrenamiento en repo ni en la VM; ingesta parada desde el 13-oct |
| **5.1** | `cape`, `tcwv`, `elevation` → `delta_h_topo` | 🔵 **BLOQUEADO** por 5.0 |
| **5.2** | `dct_high_freq_energy` | 🔵 **BLOQUEADO** por 5.0 |
| **5.3** | Provider `FORECASTER=itransformer` | ✅ **HECHO** |
| **5.4** | `torch.sort` (monotonía P10 ≤ P50 ≤ P90) | ✅ **HECHO** |
| **5.5** | Recorte a rango físico, con conteo | ✅ **HECHO** |
| **5.6** | Tests del MOS | ✅ **HECHO** (9 tests, con prueba mutante) |

Y de propina, fuera del plan original pero necesario: **P10** (el histórico de telemetría a −10 h) y
**1a.5/H1** (la leyenda duplicada y la captura sin color).

---

## 2. Lo que se puede afirmar (con número y artefacto)

**El iTransformer solo, medido** (20 meses, step 24 h, h=12, n=518):

| variable | MOS | iTransformer | Δ |
|---|---|---|---|
| GHI | **77,50** | 137,54 | **−43,7 %** |
| temperatura | **0,90** | 1,25 | −27,9 % |
| humedad | **5,96** | 8,98 | −33,6 % |
| presión | **0,39** | 0,55 | −29,6 % |
| nubes | 28,89 | **16,96** | **+70,3 % (peor)** |
| viento 10 m | 3,71 | **1,62** | **+128 % (peor)** |

**Contra el NWP crudo** (el baseline correcto, h=12): GHI `79,53 → 77,50` = **−2,6 %**; temperatura
−42,1 %; humedad −49,4 %; presión −75,0 %. **En nubes el MOS es idéntico al crudo** (28,89 = 28,89): es
`_PASS_THROUGH`, el LightGBM ni lo toca.

**Lectura honesta**: el MOS aporta mucho **frente al modelo profundo** y **poco frente al NWP crudo** en
radiación. Lo que sí corrige de verdad es temperatura, humedad y presión.

---

## 3. Verificado por el auditor (ejecutando, no leyendo)

- **9/9** tests del MOS en verde, y **11/11** los de calibración + conformal (el corte de P10 no rompió
  nada). *Nota: hubo que instalar `pytest` en el venv de revisión, no estaba.*
- **Tabla de MAE recalculada** desde el CSV del implementador: coincide exacto.
- **5 sha256** de `reference/resultados/`: los 5 coinciden con el blob.
- **Alcance respetado**: 5 archivos tocados, **cero** cambios en el MOS, el solver o el conformal.
- **P10**: conteo propio comprobado (8.878 + 8.848 + 8.686 + 8.827 = **35.239**), hueco 13→27-oct = 0.

## 4. Lo que el auditor NO pudo verificar (declarado, no escondido)

- **La captura re-capturada** (`s1a_panel_overlay_3contendientes_h1.png`, 143.359 bytes, sha
  `6cdd95e9…`, distinta de la vieja): el visor dio timeout tres veces. Las dos condiciones del criterio
  están en el código (`if (c === 'real') return;` y `itransformer: '#0ea5e9'`), pero **no la he visto**.
- **El backup** (`~/backups_p10_20261028`, `mongoexport`) y **el archivado de los 4 probes**: viven en la
  VM y en Mongo. Se acepta el reporte del implementador.
- **Los 19,8 FPS** del cambio 19: artefacto con sha válido, no re-ejecutado aquí.

## 5. Fuera del alcance de este cierre (con motivo)

- **Tarea 0** (`FORECASTER=mos` como default): **decisión del autor**. Mueve las cifras del capítulo,
  porque los experimentos usan `name="patchtst"` hardcodeado en `experiments/data_loader.py:154`; va con
  re-corrida de la Fase 1.
- **5.7** (quitar el pass-through de nubes y el proxy ×1.3 del viento): **al final**, por decisión del
  autor, junto con el resto del problema del MOS.
- **Paquete B** completo: bloqueado por datos.

---

**Conclusión**: el paquete A está cerrado y verificado. Lo que queda abierto no es deuda de este sprint:
son un bloqueo de datos (paquete B) y dos decisiones del autor (Tarea 0 y 5.7).
