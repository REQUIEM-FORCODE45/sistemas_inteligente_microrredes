# RESPUESTA A LA AUDITORÍA — cambios 06, 08, 09, 10

Ítem → acción → evidencia. Fecha: 2026-10-09.

## 1 · C3 del 06 (CRÍTICO)

- Medida la **variante C** (radio conformal del predictor final + simétrica) en dos
  ventanas × tres métodos, mismo holdout. JSONs versionados:
  `cambio_06_banda_conformal/cobertura_06_2026-10-09_w30_s602020.json` y `..._w30_s503020.json`.
- Resultados: 60/20/20 → A 90.28 / **B 69.44** / **C 87.50**;
  50/30/20 (n_cal=108, sin avisos) → A 90.28 / **B 69.44** / **C 88.89**.
- **C3 queda `[ ]` NO ALCANZADO en producción** (B 69.44 % < 0.72); C supera el criterio
  en ambas ventanas pero **no se adopta sin orden explícita** (cambiaría la banda del MPC).
- VERIFICACION_06 actualizado con la tabla + enlaces; fila 06 del README coherente con
  el ajuste de la auditoría (no pisada).

## 2 · JSON versionado (regla dura 2)

Los 2 JSONs del protocolo viven junto al `VERIFICACION.md` y este los enlaza.
El `reference/` congelado no se tocó (la extensión C/`--split` está documentada como
divergencia intencional en la `nota` del propio JSON).

## 3 · C3 marcado y README coordinado

C3 en `[ ]` con número real; fila 06 conserva el texto de la auditoría y añade la
variante C + JSONs.

## 4 · `rmse_antes` (09)

`fit_from_sensor` lee el `rmse_calibrado_kw` previo **antes** de sobrescribir;
`registrar_evento` acepta `rmse_antes_causa` (`sin_artefacto_previo` vs
`artefacto_previo_sin_baseline`, NO RECONSTRUIBLE). Las 2 entradas viejas se
conservan (append-only). **Tercer evento** demuestra el arreglo:
`manual 1.4104→1.4104` (misma ventana: la recalibración no cambió el error).
La entrada `motivo:"age"` fue prueba manual etiquetada, no disparo automático.
Tests: +2 en `test_drift.py` (10 passed).

## 5 · Rampa eludible (08-A) → 08.4

Implementado **sin binarias nuevas**: `S[t]≥U[t]−U[t−1]`, `D[t]≥U[t−1]−U[t]`
(`t=0` con estado inicial); `objetivo += c_start·S (+c_stop·D)`, ambos **dato del
equipo** (sin declarar → sin penalizar + warning). Producción: 2 arranques/1 parada
(pocos transitorios). Comportamiento: `start_cost=1e7` → 4→0 arranques.
Estructura sola p50 4.43 s (≈ base: cero coste); penalización activa p50 9.63 s
(margen 90×). Limitación y carácter **preexistente** documentados en VERIFICACION_08.
3 tests nuevos; binarias idénticas con/sin penalización.

## 6 · Exp B (08-C)

Causa raíz medida: modelo de **2094 vars / 2036 constr** > límite 2000 de la licencia
pip size-limited → `"Model too large for size-limited license"` → **HiGHS**.
0.45 s publicados = Gurobi (no reproducible con size-limited en este modelo).
`solvers.py` reporta `solver_usado`; `hardware_report()` expone el **solver efectivo**
(antes estático). Medido: job 8h → `solver_usado: gurobi`; job 24h → HiGHS.

## 7 · Fallos preexistentes (08)

`cambio_08.../evidencia_fallos_preexistentes.txt`: worktree de `8e8e2d3` →
**mismos 2 fallos**, 13 passed (vs 19 passed con los cambios). Worktree borrado.

## 8 · `tariffMode` (10, menor)

Ahora `<select>` hora/mes (captura `c10_select.png` en evidencia de sesión);
mapper verificado en navegador. Build ✓, lint 0.
