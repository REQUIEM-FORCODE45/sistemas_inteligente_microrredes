# Experimento A2 — Estocástico bajo escasez de red y adversidad

**Periodo**: 2026-07-24 → 2026-08-06 (14 días) · **SOC inicial**: 0.65 (igual para todas) · **Lazo**: continuo con SOC propagado · **Forecast**: cadena de producción (sin tocar) · **Normalización**: costo_norm = costo + (130 − SoC_final)·80 (inventario a tarifa media; misma convención del Exp A). El ENS por escasez es métrica, no violación (el balance cierra por construcción).

## Métricas por modo × estrategia (costos normalizados)

| modo   | estrategia   |   n_dias |   costo_medio_norm |   costo_se_norm |   cvar80_norm |   costo_periodo_crudo |   soc_final |   costo_periodo_norm |   ens_total_kwh |   ens_horas |   deficit_max_kw |   diesel_L_total |   diesel_h_total |   viol_total |
|:-------|:-------------|---------:|-------------------:|----------------:|--------------:|----------------------:|------------:|---------------------:|----------------:|------------:|-----------------:|-----------------:|-----------------:|-------------:|
| grid10 | dmpc         |       14 |            61737.9 |          1024.2 |       66366.8 |      863037           |       113.8 |     864330           |             0   |           0 |              0   |           7281.8 |              220 |            0 |
| grid10 | heur         |       14 |            72337.8 |           487.9 |       74824.9 |           1.00563e+06 |        41.3 |          1.01273e+06 |             0   |           0 |              0   |           9888.2 |              335 |            0 |
| grid10 | mpc-pi       |       14 |            56805.4 |           197.6 |       57687.1 |      798888           |       175.1 |     795276           |             0   |          57 |              0   |           6380.3 |              209 |            0 |
| grid10 | smpc         |       14 |            61793   |           960.4 |       65927.2 |      867312           |       157.6 |     865102           |             0   |           0 |              0   |           7356.9 |              222 |            0 |
| grid30 | dmpc         |       14 |            59524.5 |          1011.8 |       63762.5 |      832478           |       119.2 |     833343           |             0   |           0 |              0   |           6637.2 |              198 |            0 |
| grid30 | heur         |       14 |            57020   |           430.7 |       59286.8 |      791184           |        41.3 |     798280           |             0   |           0 |              0   |           5940.2 |              194 |            0 |
| grid30 | mpc-pi       |       14 |            55117.8 |           144.7 |       55921.2 |      774316           |       163.3 |     771650           |             0   |           0 |              0   |           6060.7 |              198 |            0 |
| grid30 | smpc         |       14 |            59938.9 |           931.6 |       63825.3 |      836767           |       100.3 |     839145           |             0   |           0 |              0   |           6793.7 |              202 |            0 |
| isla   | dmpc         |       14 |            68914.8 |          2280.9 |       80462.7 |      963245           |       110.5 |     964806           |            10.6 |           8 |              3.7 |           7869.7 |              241 |            0 |
| isla   | heur         |       14 |            72337.8 |           487.9 |       74824.9 |           1.00563e+06 |        41.3 |          1.01273e+06 |             0   |           0 |              0   |           9888.2 |              335 |            0 |
| isla   | mpc-pi       |       14 |            60312.9 |           241.9 |       61592.6 |      846326           |       154.3 |     844381           |             0   |         160 |              0   |           7084.4 |              234 |            0 |
| isla   | smpc         |       14 |            66859.6 |          1114.8 |       71752.4 |      933626           |        99.9 |     936035           |             3.5 |           3 |              2.3 |           8006.1 |              245 |            0 |

## S-MPC vs D-MPC pareado por día (costo normalizado)

| modo   |   n_dias |   dif_media_smpc_menos_dmpc |   dif_se |   dif_pct_vs_dmpc |   t_student |   p_valor |
|:-------|---------:|----------------------------:|---------:|------------------:|------------:|----------:|
| grid10 |       14 |                      55.126 |  193.509 |             0.089 |       0.285 |     0.78  |
| grid30 |       14 |                     414.421 |  114.049 |             0.696 |       3.634 |     0.003 |
| isla   |       14 |                   -2055.13  | 1544.95  |            -2.982 |      -1.33  |     0.206 |

## Estratos por tercil de PV diario

| modo   | estrategia   | tercil_pv      |   n_dias |   costo_medio_norm |   ens_medio_kwh |
|:-------|:-------------|:---------------|---------:|-------------------:|----------------:|
| grid10 | dmpc         | bajo (nublado) |        5 |            61833.6 |             0   |
| grid10 | dmpc         | medio          |        4 |            61957.7 |             0   |
| grid10 | dmpc         | alto           |        5 |            61466.4 |             0   |
| grid10 | heur         | bajo (nublado) |        5 |            72377.8 |             0   |
| grid10 | heur         | medio          |        4 |            73357.2 |             0   |
| grid10 | heur         | alto           |        5 |            71482.3 |             0   |
| grid10 | mpc-pi       | bajo (nublado) |        5 |            57331.8 |             0   |
| grid10 | mpc-pi       | medio          |        4 |            56994.5 |             0   |
| grid10 | mpc-pi       | alto           |        5 |            56127.8 |             0   |
| grid10 | smpc         | bajo (nublado) |        5 |            61969.2 |             0   |
| grid10 | smpc         | medio          |        4 |            62242.2 |             0   |
| grid10 | smpc         | alto           |        5 |            61257.5 |             0   |
| grid30 | dmpc         | bajo (nublado) |        5 |            59822.9 |             0   |
| grid30 | dmpc         | medio          |        5 |            59171   |             0   |
| grid30 | dmpc         | alto           |        4 |            59593.4 |             0   |
| grid30 | heur         | bajo (nublado) |        5 |            57116.4 |             0   |
| grid30 | heur         | medio          |        5 |            57556.9 |             0   |
| grid30 | heur         | alto           |        4 |            56228.3 |             0   |
| grid30 | mpc-pi       | bajo (nublado) |        5 |            55578.2 |             0   |
| grid30 | mpc-pi       | medio          |        5 |            55004.5 |             0   |
| grid30 | mpc-pi       | alto           |        4 |            54684   |             0   |
| grid30 | smpc         | bajo (nublado) |        5 |            60073.9 |             0   |
| grid30 | smpc         | medio          |        5 |            59548.4 |             0   |
| grid30 | smpc         | alto           |        4 |            60258.4 |             0   |
| isla   | dmpc         | bajo (nublado) |        4 |            77518.5 |             2.7 |
| isla   | dmpc         | medio          |        5 |            66354.2 |             0   |
| isla   | dmpc         | alto           |        5 |            64592.4 |             0   |
| isla   | heur         | bajo (nublado) |        4 |            72490.3 |             0   |
| isla   | heur         | medio          |        5 |            73071.3 |             0   |
| isla   | heur         | alto           |        5 |            71482.3 |             0   |
| isla   | mpc-pi       | bajo (nublado) |        4 |            61103.4 |             0   |
| isla   | mpc-pi       | medio          |        5 |            59985.3 |             0   |
| isla   | mpc-pi       | alto           |        5 |            60008.2 |             0   |
| isla   | smpc         | bajo (nublado) |        4 |            68983.9 |             0.9 |
| isla   | smpc         | medio          |        5 |            66949.3 |             0   |
| isla   | smpc         | alto           |        5 |            65070.5 |             0   |

## Lectura honesta

- **grid30**: S-MPC 839,145 vs D-MPC 833,343 (diferencia -0.7% a favor de D-MPC); CVaR_80 S 63,825 vs D 63,763 (-0.1%); ENS kWh S/D/HEUR = 0/0/0.
- **grid10**: S-MPC 865,102 vs D-MPC 864,330 (diferencia -0.1% a favor de D-MPC); CVaR_80 S 65,927 vs D 66,367 (+0.7%); ENS kWh S/D/HEUR = 0/0/0.
- **isla**: S-MPC 936,035 vs D-MPC 964,807 (diferencia +3.0% a favor de S-MPC); CVaR_80 S 71,752 vs D 80,463 (+10.8%); ENS kWh S/D/HEUR = 3/11/0.
  HEUR en isla: ENS total 0 kWh — SIN déficit: el diésel (300 kW >> pico ~80 kW) cubre todo; HEUR no colapsa en energía pero quema 9,888 L (+49% vs D-MPC). Reportado tal cual.
- **Pareado grid30**: Δ media S−D = 414 ± 114 COP/día, t=3.63, p=0.003 (p<0.05).
- **Pareado grid10**: Δ media S−D = 55 ± 194 COP/día, t=0.28, p=0.780 (no distinguible del ruido: no se afirma significancia).
- **Pareado isla**: Δ media S−D = -2,055 ± 1,545 COP/día, t=-1.33, p=0.206 (no distinguible del ruido: no se afirma significancia).

Figuras: `expA2_figura_riesgo.png` (media/CVaR_80 y estratos PV), `expA2_figura_ens.png` (ENS y déficit máximo).

## Diagnóstico horario del ENS

Piso de batería: 40 kWh. SoC medido al inicio de cada hora.

- **grid10/D-MPC**: sin ENS>0.01 kWh.
- **grid10/HEUR**: sin ENS>0.01 kWh.
- **grid10/MPC-PI**: sin ENS>0.01 kWh.
- **grid10/S-MPC**: sin ENS>0.01 kWh.
- **grid30/D-MPC**: sin ENS>0.01 kWh.
- **grid30/HEUR**: sin ENS>0.01 kWh.
- **grid30/MPC-PI**: sin ENS>0.01 kWh.
- **grid30/S-MPC**: sin ENS>0.01 kWh.
- **isla/D-MPC**: 8 h con ENS (horas: 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 16:00, 17:00), media 1.3 kWh, max 3.7 kWh; SoC en piso en el 0% de esas horas; diésel medio esas horas 54 kW, descarga media 0.0 kW.
- **isla/HEUR**: sin ENS>0.01 kWh.
- **isla/MPC-PI**: sin ENS>0.01 kWh.
- **isla/S-MPC**: 3 h con ENS (horas: 13:00, 14:00, 16:00), media 1.2 kWh, max 2.3 kWh; SoC en piso en el 0% de esas horas; diésel medio esas horas 52 kW, descarga media 0.0 kW.

Limitación: el costo fijo de red (40 COP/h) se sigue cargando incluso en isla (model_builder intacto); iguala a todas, no sesga el ranking. En isla/grid10 el costo MPC está dominado por el ENS penalizado a 5,000 COP/kWh: comparar también el ENS físico (kWh), no solo COP.

## Sensibilidad a la fuente de PV realizado (spot-check 4 días, isla)

Ventana 07-24→07-27 (4d, primeros de la ventana principal): misma configuración,
solo cambia el PV realizado (mongo = sensores, 764 kWh; era5 = planta sobre
ERA5, 623 kWh). Spot-check honesto por throughput del solver (~50 s/solve en
isla): no es estadística de 14 días, es robustez direccional.

| Estrategia | ENS mongo | ENS era5 | Norma mongo | Norma era5 |
|:-----------|----------:|---------:|------------:|-----------:|
| S-MPC | 0.0 | 0.0 | 278,690 | 278,690 |
| D-MPC | 0.0 | 0.0 | 276,330 | 276,330 |
| HEUR | 0.0 | 0.0 | 293,329 | 295,494 |
| MPC-PI | 0.0 | 0.0 | 240,582 | 242,187 |

Lectura: el orden se conserva en ambas fuentes (MPC-PI < D-MPC ≤ S-MPC < HEUR).
S-MPC/D-MPC dan costos bit-idénticos entre fuentes: con diésel sobredimensionado
e import 0, el PV extra de mongo (141 kWh) se absorbe como vertido sin costo
(export_tariff=0), no como ahorro. HEUR y MPC-PI sí se mueven (su regla/cota usan
el realizado directo). Conclusión: el hallazgo isla no depende de la fuente de PV
en esta ventana soleada (ENS 0 en ambas; la ventana completa de 14 días con días
nublados es donde aparece el ENS 3.5/10.6 de la tabla principal).