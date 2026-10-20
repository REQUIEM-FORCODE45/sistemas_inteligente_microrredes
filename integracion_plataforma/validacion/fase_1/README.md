# Fase 1 — alcance mínimo defendible (2026-10-19/20)

Cada corrida responde una pregunta que va al texto del capítulo, con la
ventana más corta que todavía responde. Comparaciones justas: mismo periodo,
mismo decode, mismos baselines; se cambia UNA cosa y se declara.
PV: Mongo vacío → planta calibrada ERA5 en ambos brazos de cada par
(fallback del propio loader, verificado: 72 lecturas, 0 NaN).

| # | Pregunta | Corrida | Respuesta (número, no adjetivo) | Artefacto |
|---|---|---|---|---|
| V7 | ¿El inversor movió las cifras? (grid30 08-03, 2 estr) | mismo código con/sin `converters` (harness `/tmp`, declarado; B ≡ pre-13) | **No atribuible**: `costo_norm` −4.84 %/−2.83 % (`costo_total` −5.06 %/−2.90 %), ENS −3.7/−2.5 kWh a favor del inversor pese a −3 % PV → re-optimización discreta con feedback SOC (diverge en h8 con mismo SOC), no física. Efecto atribuible ≤ ~1 % (4.2 kWh/día × marginal). | `v7_grid30/resultado.json` + 4 CSV |
| V7c | ¿Delta ≈0 en isla? (08-03, smpc) | mismo par en isla | Costo −0.30 % `costo_norm` (−0.30 % `costo_total`, ruido); ENS +1.3 kWh dentro de sensibilidad del lazo, no física nueva. | `v7_isla/resultado.json` + 2 CSV |
| V3 | ¿ENS del 08-05 artefacto de la fuente? (isla, era5 vs mongo, 2 estr) | era5 fresco + mongo fresco (SOC 0.65 ambos); publicado citado como contexto | era5 ≡ mongo **byte-idénticos** (colapsan a la misma planta): **no hay dos fuentes que comparar**; el orden S<D se mantiene (8.45<12.93). No atribuible a la fuente con este diseño. | `v3_fuente/resultado.json` + 4 CSV |
| V1+V6 | ¿S-MPC se separa con banda C? (estres 08-03/04/05 isla, 2 estr) | banda `conformal_disjunto` | **Sí en ENS**: −5.13 kWh (−26 %); costo −0.68 % `costo_total` (−0.62 % `costo_norm`). 08-04 no discrimina. | `v1_bandc/resultado.json` + 2 CSV |
| V2 | ¿Valor del estocástico con red? (08-03 grid10+grid30, banda C, 2 estr) | 4 celdas | grid10: −1.81 % `costo_norm` (−1.82 % `costo_total`), −5.3 ENS. grid30: +1.62 % `costo_norm` (**+2.38 % `costo_total`**), −4.8 ENS. Con red holgada el seguro cuesta poco y baja mucho el ENS. Reproducibilidad byte-idéntica grid30 vs V7a. | `v2_red/resultado.json` + 4 CSV |
| V5 | ¿Funciona el lazo en vivo? | 3 ciclos reales 15 min | Estable (R0=R1; R1→R2 deriva suave explicable, sin flip-flop). plan→realidad NO aplicable (DEFAULT_TOPOLOGY sin diagrama; Exp D diferido). | `v5_lazo/` 3 ciclos + forecast |

## Lo afirmable (y lo que no)

- SÍ: "en la ventana de estrés (3 días con mayor déficit), con la banda corregida, el S-MPC reduce el ENS frente al D-MPC en 5.1 kWh (26 %); el costo difiere −0.68 % `costo_total` (−0.62 % `costo_norm`)".
- SÍ: "el efecto atribuible del inversor es ≤ ~1 % (≈4 kWh PV/día); los deltas medidos entre corridas (±5 %) son ruido de re-optimización discreta".
- SÍ: "con red, S vs D difiere poco en costo y bastante en ENS (grid10 −1.81 % norm / −1.82 % total, −5.3 kWh; grid30 +1.62 % norm / +2.38 % total, −4.8 kWh)".
- NO: nada sobre 14 días ni p<0.05 (V4 fuera, ya declarado).
- NO: delta de costo "por el inversor" (no atribuible; ver V7).

## Manifiesto

Ver `MANIFEST.md` (archivo | bytes | sha256 completo) de esta carpeta.

Nota: los hourly completos (`results/pasto_narino/experiments/expA2_hourly_<tag>_*.csv`,
24 filas por celda) quedan en `results/` sin versionar (locales); lo versionado
son los daily + `resultado.json` por carpeta.
