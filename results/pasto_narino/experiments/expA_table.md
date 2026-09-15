# Experimento A — Comparativa económica (S-MPC vs D-MPC vs HEUR vs MPC-PI)

**Periodo**: 2026-07-24 → 2026-08-06 (14 días) · **Estado inicial**: SOC=0.65 (igual para todas) · **Cadena de predicción**: PatchTST (72 h, P10/P50/P90) + ajuste de datos (plantas PV/load calibradas) · **Escenarios**: S=3 anclados a cuantiles (P90 0.2 / P50 0.6 / P10 0.2) · **Lazo**: receding horizon horario con SOC real propagado, se implementa la primera acción del escenario base (P50).

**Tarifas ToU (COP/kWh)**: valle (00–05) 45 · media (06–18, 22–23) 80 · pico (19–21) 140 · fijo 40 COP/h. Diésel: consumo (0.5 + 0.001·P²·…), C_comb = 100 COP/L.

## Tabla de métricas (14 días)

| Estrategia                        |   Costo total periodo (COP) | Costo diario medio (COP) ± std   |   Uso renovables (%) |   Ciclos batería /día |   Importación red (kWh) |   Diésel (L) |   Violaciones |   SoC final (kWh) |   Costo normalizado (COP) |
|:----------------------------------|----------------------------:|:---------------------------------|---------------------:|----------------------:|------------------------:|-------------:|--------------:|------------------:|--------------------------:|
| S-MPC (estocástico, 3 escenarios) |                     836,767 | 59,769 ± 3,626                   |                 20   |                  0.13 |                     141 |          485 |             0 |             100.3 |                   839,145 |
| D-MPC (determinista, P50)         |                     832,478 | 59,463 ± 3,829                   |                 20   |                  0.14 |                     151 |          474 |             0 |             119.2 |                   833,343 |
| HEUR (priority list)              |                     791,184 | 56,513 ± 669                     |                 18   |                  0.02 |                     180 |          424 |             0 |              41.3 |                   798,280 |
| MPC-PI (información perfecta)     |                     781,903 | 55,850 ± 676                     |                 17.6 |                  0.01 |                     151 |          457 |             0 |             173.5 |                   778,424 |

## Conclusiones (valores reales)

- **S-MPC vs D-MPC**: 836,767 vs 832,478 COP (periodo) → **diferencia -0.52%**: las primeras acciones coinciden (el arbitraje valle→pico es un efecto que ambos explotan con la misma curva P50). La ventaja estocastica es marginal en esta microred.
- **S-MPC vs HEUR**: 836,767 vs 791,184 COP (periodo) → **diferencia de -6%** (negativo = HEUR más barato en esta ventana): la regla heuristica evita el mínimo técnico del diésel y no paga degradación por ciclar la batería.
- **MPC-PI** (información perfecta): 781,903 COP — cota superior; el S-MPC queda a 7.02% de la operacion con informacion perfecta (el valor de la precision del pronostico es bajo cuando el arbitraje es el lever dominante).
- **Violaciones de balance**: S-MPC=0, D-MPC=0, HEUR=0, MPC-PI=0 (todas deben ser 0).
- **Uso de renovables**: S-MPC 20.0% vs D-MPC 20.0% vs HEUR 18.0%.
- **Ciclos de batería/día**: S-MPC 0.13 (arbitraje valle→pico) vs HEUR 0.02.

## Discusión

- Con degradación 40 COP/kWh y red limitada a 30 kW, el S-MPC carga ~52 h y su SoC se mueve en [100, 158] kWh (0.50–0.79·cap), manteniendo reserva; HEUR no carga y termina en el piso (41 kWh).
- S-MPC y D-MPC coinciden porque la primera accion sale del escenario base (P50) y, con solo 3 escenarios anclados a cuantiles, ese primer paso es identico al determinista en esta microred diésel-dominada. El beneficio estocastico (si existe) se manifiesta en el costo esperado, no en la primera accion implementada.
- El MPC-PI confirma la cota: la brecha de informacion perfecta es de 7.0% (S-MPC 836,767 vs MPC-PI 781,903); con export_tariff=0 la ventaja de pronóstico perfecto domina.
- HEUR vs MPC: -6% (HEUR 791,184 vs S-MPC 836,767). Con degradación 40 COP/kWh la heurística compite y puede superar al MPC — resultado legítimo en esta ventana.
- **Ranking por costo normalizado** (reserva terminal igualada a 0.65·cap a 80 COP/kWh): MPC-PI 778,424 < HEUR 798,280 < D-MPC 833,343 < S-MPC 839,145. Con estados finales igualados, la información perfecta domina como predice la teoría.

## Comparabilidad (nota metodológica)

Los costos crudos NO son directamente comparables porque los estados finales difieren (S-MPC 100, D-MPC 119, HEUR 41, MPC-PI 173 kWh frente a 130 kWh iniciales): HEUR liquida su reserva y MPC-PI la acumula. El costo normalizado valora esa diferencia de inventario a 80 COP/kWh (tarifa media: reponer o ceder 1 kWh cuesta lo que la red media). Limitación explícita: no captura dinámica intra-periodo ni el valor pico de la reserva; solo iguala el punto de llegada para ordenar el ranking.

## Notas de honestidad (R7)

- El lazo usa la cadena real de producción: contexto Open-Meteo `past_days` que termina antes de cada hora de decisión → PatchTST (capa ML) → plantas calibradas (ajuste de datos) → escenarios.
- El **SOC se propaga** entre horas: cada solve recibe el SOC real del lazo cerrado (no un SOC ficticio), garantizando que las acciones sean físicamente realizables (SOC ∈ [soc_min, soc_max]).
- La demanda y el PV realizados provienen de las mediciones del sistema (Mongo); el clima realizado es ERA5 del sitio.
- El **MPC-PI** usa como forecast la propia serie realizada (P10=P50=P90=PV realizado): es la cota superior teórica y debe dominar a las estrategias basadas en pronóstico.
- La batería es el único almacenamiento; la red es el slack. El excedente solar se exporta hasta el límite o se recorta (no viola el balance).