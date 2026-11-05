# Fase 1 con MOS (republicación) — V1 + V2

Mismo diseño, mismo periodo, mismo decode, mismos baselines que
`../fase_1/` (PatchTST). **Se cambia UNA cosa: el proveedor del forecast
(`mos`)**. Comparación siempre por par (S-MPC vs D-MPC en la misma ventana).
Nada de `fase_1/` se toca (verificado 31/31 sha antes y después).

| pregunta | corrida | respuesta (números) | artefacto |
|---|---|---|---|
| ¿S-MPC se separa de D-MPC en estrés isla 08-03/04/05, banda C? | V1 mos vs V1 patchtst | mos: ENS −3.32 kWh (−22.4 %), costo −0.19 % total (−0.15 % norm). PatchTST: ENS −5.13 kWh (−26.3 %), costo −0.68 %. Signo igual, magnitud del ENS atenuada | `v1_bandc/resultado.json` |
| ¿Cuánto vale el estocástico con red 08-03, banda C? | V2 mos vs V2 patchtst | mos: grid10 −3.44 % norm / −3.47 % total, ENS −7.84; grid30 −3.59 % / −3.13 %, ENS −6.26. PatchTST: grid10 −1.81/−1.82 %, ENS −5.33; grid30 **+1.62/+2.38 %** (D-MPC gana), ENS −4.80. **El signo se invierte en grid30** | `v2_red/resultado.json` |

Cadena de predicción (T0.5, en cada `resultado.json`): `provider: "mos"`,
`modelo: "iTransformer + LightGBM MOS (v2 causales)"`,
`boosters: {cloud_cover, wind_speed_100m, direct_normal_irradiance,
diffuse_radiation: v2}`, `unidades_viento: "ms"`.

## No corrido con mos (alcance fijado por el autor: solo V1+V2)

- **V3 (fuente PV)**: no se corre — colapsa a la misma planta calibrada,
  no mide el forecast (la comparación era5≡mongo no depende del proveedor).
- **V5 (lazo vivo)**: no se corre — mide estabilidad del bucle, no el
  modelo de clima.
- **V7 (inversor)**: no se corre — su conclusión ("<= ~1 %, no atribuible")
  no la cambia el proveedor del forecast.

Un hueco declarado no es un hueco.

## Presupuesto y método

HiGHS 60-110 s/solve real (un solve grid10/smpc llegó a ~40 min en una
celda dura, gap 0.05 % → óptimo). V1: 144 celdas-hora ≈ 40 min (smpc) +
rápido (dmpc Gurobi). V2: 96 celdas ≈ 90 min. Orden V1 primero, V2 después;
nada a medias. Comandos en `../fase_1/README.md` (mismos flags +
`--band-mode conformal_disjunto --tag v1_c_mos|v2_c_mos`).
`test_validacion_json.py` exige que todo JSON de `validacion/` parsee.
