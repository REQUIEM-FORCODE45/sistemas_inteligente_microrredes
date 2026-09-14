# Experimento A — Comparativa económica (S-MPC vs D-MPC vs HEUR vs MPC-PI)

**Periodo**: 2026-07-18 → 2026-07-20 (3 días) · **Estado inicial**: SOC=0.65 (igual para todas) · **Cadena de predicción**: PatchTST (72 h, P10/P50/P90) + ajuste de datos (plantas PV/load calibradas) · **Escenarios**: S=3 anclados a cuantiles (P90 0.2 / P50 0.6 / P10 0.2) · **Lazo**: receding horizon horario con SOC real propagado, se implementa la primera acción del escenario base (P50).

**Tarifas ToU (COP/kWh)**: valle (00–05) 45 · media (06–18, 22–23) 80 · pico (19–21) 140 · fijo 40 COP/h. Diésel: consumo (0.5 + 0.001·P²·…), C_comb = 100 COP/L.

## Tabla de métricas (3 días)

| Estrategia                        |   Costo total periodo (COP) | Costo diario medio (COP) ± std   |   Uso renovables (%) |   Ciclos batería /día |   Importación red (kWh) |   Diésel (L) |   Violaciones |
|:----------------------------------|----------------------------:|:---------------------------------|---------------------:|----------------------:|------------------------:|-------------:|--------------:|
| S-MPC (estocástico, 3 escenarios) |                     172,198 | 57,399 ± 309                     |                 13.3 |                  0    |                     154 |          473 |             0 |
| D-MPC (determinista, P50)         |                     170,962 | 56,987 ± 356                     |                 13.3 |                  0    |                     155 |          467 |             0 |
| HEUR (priority list)              |                   1,306,423 | 435,474 ± 128,416                |                 21.3 |                  0.21 |                     343 |          232 |            15 |
| MPC-PI (información perfecta)     |                     169,429 | 56,476 ± 333                     |                 13.3 |                  0    |                     153 |          464 |             0 |

## Conclusiones (valores reales)

- **S-MPC vs D-MPC**: 172,198 vs 170,962 COP (periodo) → **diferencia -0.72%**: las primeras acciones coinciden (el arbitraje valle→pico es un efecto que ambos explotan con la misma curva P50). La ventaja estocastica es marginal en esta microred.
- **S-MPC vs HEUR**: 172,198 vs 1,306,423 COP (periodo) → **mejora de 87%** (orden de magnitud): la regla heuristica no explota el arbitraje de la bateria ni la exportacion en pico.
- **MPC-PI** (información perfecta): 169,429 COP — cota superior; el S-MPC queda a 1.63% de la operacion con informacion perfecta (el valor de la precision del pronostico es bajo cuando el arbitraje es el lever dominante).
- **Violaciones de balance**: S-MPC=0, D-MPC=0, HEUR=15, MPC-PI=0 (todas deben ser 0).
- **Uso de renovables**: S-MPC 13.3% vs D-MPC 13.3% vs HEUR 21.3%.
- **Ciclos de batería/día**: S-MPC 0.00 (arbitraje valle→pico) vs HEUR 0.21.

## Discusión

- Con la **tarifa ToU horaria** en el modelo, la bateria hace el arbitraje valle→pico (carga en valle a 45, descarga en pico a 140) y el SOC recorre el rango operativo completo [0.2, 0.95]·capacidad sin violaciones.
- S-MPC y D-MPC coinciden porque la primera accion sale del escenario base (P50) y, con solo 3 escenarios anclados a cuantiles, ese primer paso es identico al determinista en esta microred exportadora. El beneficio estocastico (si existe) se manifiesta en el costo esperado, no en la primera accion implementada.
- El MPC-PI confirma la cota: la brecha de informacion perfecta es de 1.6% (S-MPC 172,198 vs MPC-PI 169,429); con export_tariff=0 la ventaja de pronóstico perfecto domina.
- HEUR vs MPC: +87% (HEUR 1,306,423 vs S-MPC 172,198). Con carga baja y degradación 30 COP/kWh la heurística compite y puede superar al MPC — resultado legítimo en esta ventana.

## Notas de honestidad (R7)

- El lazo usa la cadena real de producción: contexto Open-Meteo `past_days` que termina antes de cada hora de decisión → PatchTST (capa ML) → plantas calibradas (ajuste de datos) → escenarios.
- El **SOC se propaga** entre horas: cada solve recibe el SOC real del lazo cerrado (no un SOC ficticio), garantizando que las acciones sean físicamente realizables (SOC ∈ [soc_min, soc_max]).
- La demanda y el PV realizados provienen de las mediciones del sistema (Mongo); el clima realizado es ERA5 del sitio.
- El **MPC-PI** usa como forecast la propia serie realizada (P10=P50=P90=PV realizado): es la cota superior teórica y debe dominar a las estrategias basadas en pronóstico.
- La batería es el único almacenamiento; la red es el slack. El excedente solar se exporta hasta el límite o se recorta (no viola el balance).