# Experimento A2 — Estocástico bajo escasez de red y adversidad

**Periodo**: 2026-07-24 → 2026-08-06 (14 días) · **SOC inicial**: 0.65 (igual para todas) · **Lazo**: continuo con SOC propagado · **Forecast**: cadena de producción (sin tocar) · **Normalización**: costo_norm = costo + (130 − SoC_final)·80 (inventario a tarifa media; misma convención del Exp A). El ENS por escasez es métrica, no violación (el balance cierra por construcción).

## Métricas por modo × estrategia (costos normalizados)

| modo   | estrategia   |   n_dias |   costo_medio_norm |   costo_se_norm |   cvar80_norm |   costo_periodo_crudo |   soc_final |   costo_periodo_norm |   ens_total_kwh |   ens_horas |   deficit_max_kw |   diesel_L_total |   diesel_h_total |   viol_total |
|:-------|:-------------|---------:|-------------------:|----------------:|--------------:|----------------------:|------------:|---------------------:|----------------:|------------:|-----------------:|-----------------:|-----------------:|-------------:|
| grid10 | dmpc         |       14 |            61737.9 |          1024.2 |       66366.8 |      863037           |       113.8 |     864330           |             0   |           0 |              0   |           7281.8 |              220 |            0 |
| grid10 | heur         |       14 |            72337.8 |           487.9 |       74824.9 |           1.00563e+06 |        41.3 |          1.01273e+06 |             0   |           0 |              0   |           9888.2 |              335 |            0 |
| grid10 | mpc-pi       |       14 |            57037.6 |           224.3 |       58433.8 |      801876           |       171.9 |     798527           |             0   |          59 |              0   |           6437.6 |              211 |            0 |
| grid10 | smpc         |       14 |            61793   |           960.4 |       65927.2 |      867312           |       157.6 |     865102           |             0   |           0 |              0   |           7356.9 |              222 |            0 |
| grid30 | dmpc         |       14 |            59524.5 |          1011.8 |       63762.5 |      832478           |       119.2 |     833343           |             0   |           0 |              0   |           6637.2 |              198 |            0 |
| grid30 | heur         |       14 |            57020   |           430.7 |       59286.8 |      791184           |        41.3 |     798280           |             0   |           0 |              0   |           5940.2 |              194 |            0 |
| grid30 | mpc-pi       |       14 |            55601.7 |           200.1 |       56648.1 |      781903           |       173.5 |     778424           |             0   |           0 |              0   |           6396.7 |              210 |            0 |
| grid30 | smpc         |       14 |            59938.9 |           931.6 |       63825.3 |      836767           |       100.3 |     839145           |             0   |           0 |              0   |           6793.7 |              202 |            0 |
| isla   | dmpc         |       14 |           797511   |         17627.5 |      859832   |           1.11649e+07 |       126.4 |          1.11652e+07 |          2090.8 |         131 |             29.2 |           6665.2 |              199 |            0 |
| isla   | heur         |       14 |            72337.8 |           487.9 |       74824.9 |           1.00563e+06 |        41.3 |          1.01273e+06 |             0   |           0 |              0   |           9888.2 |              335 |            0 |
| isla   | mpc-pi       |       14 |           791621   |          8261   |      810361   |           1.10862e+07 |       173.5 |          1.10827e+07 |          2085.4 |         168 |             29.1 |           6396.7 |              210 |            0 |
| isla   | smpc         |       14 |           756247   |         19894.8 |      830436   |           1.05868e+07 |       122.2 |          1.05875e+07 |          1972.6 |         123 |             29.2 |           6793.7 |              202 |            0 |

## S-MPC vs D-MPC pareado por día (costo normalizado)

| modo   |   n_dias |   dif_media_smpc_menos_dmpc |    dif_se |   dif_pct_vs_dmpc |   t_student |   p_valor |
|:-------|---------:|----------------------------:|----------:|------------------:|------------:|----------:|
| grid10 |       14 |                      55.126 |   193.509 |             0.089 |       0.285 |     0.78  |
| grid30 |       14 |                     414.421 |   114.049 |             0.696 |       3.634 |     0.003 |
| isla   |       14 |                  -41263.9   | 25263.2   |            -5.174 |      -1.633 |     0.126 |

## Estratos por tercil de PV diario

| modo   | estrategia   | tercil_pv      |   n_dias |   costo_medio_norm |   ens_medio_kwh |
|:-------|:-------------|:---------------|---------:|-------------------:|----------------:|
| grid10 | dmpc         | bajo (nublado) |        5 |            61833.6 |             0   |
| grid10 | dmpc         | medio          |        4 |            61957.7 |             0   |
| grid10 | dmpc         | alto           |        5 |            61466.4 |             0   |
| grid10 | heur         | bajo (nublado) |        5 |            72377.8 |             0   |
| grid10 | heur         | medio          |        4 |            73357.2 |             0   |
| grid10 | heur         | alto           |        5 |            71482.3 |             0   |
| grid10 | mpc-pi       | bajo (nublado) |        5 |            57716.9 |             0   |
| grid10 | mpc-pi       | medio          |        4 |            56778.4 |             0   |
| grid10 | mpc-pi       | alto           |        5 |            56565.7 |             0   |
| grid10 | smpc         | bajo (nublado) |        5 |            61969.2 |             0   |
| grid10 | smpc         | medio          |        4 |            62242.2 |             0   |
| grid10 | smpc         | alto           |        5 |            61257.5 |             0   |
| grid30 | dmpc         | bajo (nublado) |        5 |            59822.9 |             0   |
| grid30 | dmpc         | medio          |        5 |            59171   |             0   |
| grid30 | dmpc         | alto           |        4 |            59593.4 |             0   |
| grid30 | heur         | bajo (nublado) |        5 |            57116.4 |             0   |
| grid30 | heur         | medio          |        5 |            57556.9 |             0   |
| grid30 | heur         | alto           |        4 |            56228.3 |             0   |
| grid30 | mpc-pi       | bajo (nublado) |        5 |            56238.5 |             0   |
| grid30 | mpc-pi       | medio          |        5 |            55150.9 |             0   |
| grid30 | mpc-pi       | alto           |        4 |            55369.3 |             0   |
| grid30 | smpc         | bajo (nublado) |        5 |            60073.9 |             0   |
| grid30 | smpc         | medio          |        5 |            59548.4 |             0   |
| grid30 | smpc         | alto           |        4 |            60258.4 |             0   |
| isla   | dmpc         | bajo (nublado) |        4 |           766766   |           143.2 |
| isla   | dmpc         | medio          |        5 |           828853   |           155.5 |
| isla   | dmpc         | alto           |        5 |           790766   |           148.1 |
| isla   | heur         | bajo (nublado) |        4 |            72490.3 |             0   |
| isla   | heur         | medio          |        5 |            73071.3 |             0   |
| isla   | heur         | alto           |        5 |            71482.3 |             0   |
| isla   | mpc-pi       | bajo (nublado) |        4 |           809946   |           152.5 |
| isla   | mpc-pi       | medio          |        5 |           794760   |           149.7 |
| isla   | mpc-pi       | alto           |        5 |           773823   |           145.4 |
| isla   | smpc         | bajo (nublado) |        4 |           745919   |           138.9 |
| isla   | smpc         | medio          |        5 |           765167   |           142.5 |
| isla   | smpc         | alto           |        5 |           755590   |           140.9 |

## Lectura honesta

- **grid30**: S-MPC 839,145 vs D-MPC 833,343 (diferencia -0.7% a favor de D-MPC); CVaR_80 S 63,825 vs D 63,763 (-0.1%); ENS kWh S/D/HEUR = 0/0/0.
- **grid10**: S-MPC 865,102 vs D-MPC 864,330 (diferencia -0.1% a favor de D-MPC); CVaR_80 S 65,927 vs D 66,367 (+0.7%); ENS kWh S/D/HEUR = 0/0/0.
- **isla**: S-MPC 10,587,461 vs D-MPC 11,165,156 (diferencia +5.2% a favor de S-MPC); CVaR_80 S 830,436 vs D 859,832 (+3.4%); ENS kWh S/D/HEUR = 1973/2091/0.
  HEUR en isla: ENS total 0 kWh — SIN déficit: el diésel (300 kW >> pico ~80 kW) cubre todo; HEUR no colapsa en energía pero quema 9,888 L (+49% vs D-MPC). Reportado tal cual.
- **Pareado grid30**: Δ media S−D = 414 ± 114 COP/día, t=3.63, p=0.003 (p<0.05).
- **Pareado grid10**: Δ media S−D = 55 ± 194 COP/día, t=0.28, p=0.780 (no distinguible del ruido: no se afirma significancia).
- **Pareado isla**: Δ media S−D = -41,264 ± 25,263 COP/día, t=-1.63, p=0.126 (no distinguible del ruido: no se afirma significancia).

Figuras: `expA2_figura_riesgo.png` (media/CVaR_80 y estratos PV), `expA2_figura_ens.png` (ENS y déficit máximo).
Limitación: el costo fijo de red (40 COP/h) se sigue cargando incluso en isla (model_builder intacto); iguala a todas, no sesga el ranking. En isla/grid10 el costo MPC está dominado por el ENS penalizado a 5,000 COP/kWh: comparar también el ENS físico (kWh), no solo COP.