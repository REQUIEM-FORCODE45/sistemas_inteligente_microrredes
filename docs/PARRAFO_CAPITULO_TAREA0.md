# Párrafo del capítulo con las cifras de la Tarea 0

Cifras de `integracion_plataforma/validacion/fase_1_mos/` (provider `mos`, boosters v2
causales). Métrica de costo citada: **`costo_norm`**, que es la declarada en cada
`resultado.json`. Se incluye la versión inglesa (manuscrito) y la española.

---

## English (manuscript)

The closed-loop validation was repeated with the production forecasting chain. Under the MOS
forecaster, the stochastic MPC reduces unserved energy by **3.32 kWh (22.0 %)** relative to the
deterministic MPC over the three-day stress window (**11.53 vs 14.86 kWh**), while the cost
difference narrows to **0.19 %**. More relevant than the separation between controllers is the
effect of the forecasting chain itself: **MOS lowers unserved energy in both arms**, from 19.51 to
14.86 kWh for the deterministic controller (**23.9 %**) and from 14.38 to 11.53 kWh for the
stochastic one (**19.8 %**). With grid access, the stochastic controller reduces cost in both
cases (grid10: **3.44 %**; grid30: **3.59 %**) and unserved energy by **7.84 and 6.26 kWh**
respectively, which **reverses the sign observed at grid30 under PatchTST (+1.62 %)**.

---

## Español (versión ES)

La validación en lazo cerrado se repitió con la cadena de pronóstico de producción. Con el
pronosticador MOS, el MPC estocástico reduce la energía no suministrada en **3,32 kWh (22,0 %)**
frente al MPC determinista en la ventana de estrés de tres días (**11,53 vs 14,86 kWh**),
mientras que la diferencia de costo se estrecha a **0,19 %**. Más relevante que la separación
entre controladores es el efecto de la cadena de pronóstico: **el MOS reduce la energía no
suministrada en ambos brazos**, de 19,51 a 14,86 kWh en el determinista (**23,9 %**) y de 14,38
a 11,53 kWh en el estocástico (**19,8 %**). Con acceso a red, el controlador estocástico reduce
el costo en los dos casos (grid10: **3,44 %**; grid30: **3,59 %**) y la energía no suministrada
en **7,84 y 6,26 kWh** respectivamente, lo que **invierte el signo observado en grid30 con
PatchTST (+1,62 %)**.

---

## Notas de redacción

- **Qué NO afirmar**: nada sobre 14 días ni p-valor (V4 sigue fuera); nada de "el inversor
  cambió las cifras" (su efecto atribuible es ≤ ~1 %, no atribuible).
- **De dónde sale cada número**: V1 de `fase_1_mos/v1_bandc/resultado.json` (`total_3d`);
  V2 de `fase_1_mos/v2_red/resultado.json` (`tabla_norm`, `tabla_ens`). Recalculables desde
  los CSV de la misma carpeta.
- **Si se cita el costo, decir la métrica**: `costo_norm` (grid30 pasa de +1,62 % norm a
  +2,38 % en `costo_total` en la corrida de PatchTST; en MOS −3,59 % norm y −3,13 % total).
- **La frase del signo invertido en grid30 conviene dejarla**: es honesta y además favorable;
  quitarla daría a entender que siempre ganó.
