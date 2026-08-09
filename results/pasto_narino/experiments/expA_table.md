# Experimento A — Comparativa económica (S-MPC vs D-MPC vs HEUR vs Oráculo)

**Periodo**: 2026-07-18 → 2026-07-31 (14 días) · **Estado inicial**: SOC=0.65 (igual para todas) · **Cadena de predicción**: PatchTST (72 h, P10/P50/P90) + ajuste de datos (plantas PV/load calibradas) · **Escenarios**: S=3 anclados a cuantiles (P90 0.2 / P50 0.6 / P10 0.2) · **Lazo**: receding horizon horario con SOC real propagado, se implementa la primera acción del escenario base (P50).

**Tarifas ToU (COP/kWh)**: valle (00–05) 45 · media (06–18, 22–23) 80 · pico (19–21) 140 · fijo 40 COP/h. Diésel: consumo (0.5 + 0.001·P²·…), C_comb = 100 COP/L.

## Tabla de métricas (14 días)

| Estrategia                        |   Costo total periodo (COP) | Costo diario medio (COP) ± std   |   Uso renovables (%) |   Ciclos batería /día |   Importación red (kWh) |   Diésel (L) |   Violaciones |
|:----------------------------------|----------------------------:|:---------------------------------|---------------------:|----------------------:|------------------------:|-------------:|--------------:|
| S-MPC (estocástico, 3 escenarios) |                  -1,428,731 | -102,052 ± 1,625                 |                 61.2 |                  0.51 |                       3 |        2,353 |             0 |
| D-MPC (determinista, P50)         |                  -1,428,730 | -102,052 ± 1,625                 |                 61.2 |                  0.51 |                       3 |        2,353 |             0 |
| HEUR (priority list)              |                    -117,912 | -8,422 ± 1,619                   |                 61.2 |                  0.04 |                      35 |           12 |             0 |
| Oráculo (forecast perfecto)       |                  -1,432,591 | -102,328 ± 1,624                 |                 61.2 |                  0.51 |                       3 |        2,361 |             0 |

## Conclusiones (valores reales)

- **S-MPC vs D-MPC**: -1,428,731 vs -1,428,730 COP (periodo) → **diferencia 0.00%**: las primeras acciones coinciden (el arbitraje valle→pico es un efecto que ambos explotan con la misma curva P50). La ventaja estocastica es marginal en esta microred.
- **S-MPC vs HEUR**: -1,428,731 vs -117,912 COP (periodo) → **mejora de 1112%** (orden de magnitud): la regla heuristica no explota el arbitraje de la bateria ni la exportacion en pico.
- **Oráculo** (forecast perfecto): -1,432,591 COP — cota superior; el S-MPC queda a 0.27% de la operacion con informacion perfecta (el valor de la precision del pronostico es bajo cuando el arbitraje es el lever dominante).
- **Violaciones de balance**: S-MPC=0, D-MPC=0, HEUR=0, Oráculo=0 (todas deben ser 0).
- **Uso de renovables**: S-MPC 61.2% vs D-MPC 61.2% vs HEUR 61.2%.
- **Ciclos de batería/día**: S-MPC 0.51 (arbitraje valle→pico) vs HEUR 0.04.

## Discusión

- Con la **tarifa ToU horaria** en el modelo, la bateria hace el arbitraje valle→pico (carga en valle a 45, descarga en pico a 140) y el SOC recorre el rango operativo completo [0.2, 0.95]·capacidad sin violaciones.
- S-MPC y D-MPC coinciden porque la primera accion sale del escenario base (P50) y, con solo 3 escenarios anclados a cuantiles, ese primer paso es identico al determinista en esta microred exportadora. El beneficio estocastico (si existe) se manifiesta en el costo esperado, no en la primera accion implementada.
- El Oráculo confirma la cota: la brecha de informacion perfecta es de 0.27%, evidencia cuantitativa de que el valor economico esta en la operacion (arbitraje y exportacion en pico), no en la precision del pronostico para esta configuracion.
- HEUR demuestra la brecha con la optimizacion: 1,112% de mejora del MPC (cualquier variante) sobre la regla simple.

## Notas de honestidad (R7)

- El lazo usa la cadena real de producción: contexto Open-Meteo `past_days` que termina antes de cada hora de decisión → PatchTST (capa ML) → plantas calibradas (ajuste de datos) → escenarios.
- El **SOC se propaga** entre horas: cada solve recibe el SOC real del lazo cerrado (no un SOC ficticio), garantizando que las acciones sean físicamente realizables (SOC ∈ [soc_min, soc_max]).
- La demanda y el PV realizados provienen de las mediciones del sistema (Mongo); el clima realizado es ERA5 del sitio.
- El **Oráculo** usa como forecast la propia serie realizada (P10=P50=P90=PV realizado): es la cota superior teórica y debe dominar a las estrategias basadas en pronóstico.
- La batería es el único almacenamiento; la red es el slack. El excedente solar se exporta hasta el límite o se recorta (no viola el balance).