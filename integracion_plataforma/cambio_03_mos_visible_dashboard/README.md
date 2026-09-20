# Cambio 03 — Hacer visible el MOS en el Dashboard

**Estado**: 🟢 **Listo para implementar** (todo verificado en el código).
**Origen**: el autor quiere **ver el MOS en la plataforma**. Hoy se ve la *comparativa*,
pero el MOS **no es seleccionable** como fuente del pronóstico en vivo.

---

## Contexto verificado (no hay que redescubrirlo)

| Hecho | Evidencia |
|---|---|
| El backend **ya soporta** el MOS | `get_climate_provider(name="mos")` → `MOSClimateForecaster` (probado ejecutando) |
| La ruta **ya propaga** el provider | `/front/prediction/weather?provider=mos` → API Python → factory (`main.py:157`) |
| El Dashboard **tiene selector** de providers | `DashboardPage.jsx:59` (`useState('openmeteo')`) + botones en `:181` |
| Pero la lista es **fija y sin `mos`** | `DashboardPage.jsx:16` `const PROVIDERS = [...]` |
| La tarjeta pide **48 h** (≤ 72 h del MOS) | `DashboardPage.jsx:68` `params: { hours: 48, provider }` → no necesita clamp |
| El endpoint **ya captura** `RuntimeError` | `main.py:163` → devuelve error amable, no un 500 |

---

## 3.1 (bloqueante) Añadir el MOS al selector — **1 línea**

`Frontend/GestionFront/src/Dashboard/pages/DashboardPage.jsx:16`

```js
const PROVIDERS = [
  { id: 'openmeteo', label: 'Open-Meteo (NWP)' },
  { id: 'timesfm',   label: 'TimesFM 2.5' },
  { id: 'patchtst',  label: 'PatchTST' },
  { id: 'mos',       label: 'MOS (ECMWF+ML)' },   // <-- NUEVO (al final, no reordenar)
];

```

**Criterio**: el botón aparece; al seleccionarlo la tarjeta de clima muestra
`Fuente: mos` y una serie de 48 h.

---

## 3.2 (credibilidad) Aviso metodológico cuando la fuente es el MOS

La tarjeta ya imprime `Fuente: {provider}`. Añadir, **solo** cuando `provider === 'mos'`,
una nota pequeña debajo:

> *NWP corregido con ML — ERA5 (verdad) y ECMWF (entrada) son de la misma familia;
> el error es optimista.*

Es un compromiso ya acordado en la SPEC del PASO 2 (§4). 2-3 líneas de JSX.

---

## 3.3 (crítico para leer el panel) Marcar **N/A** en la TABLA de la comparativa

La **figura** ya marca N/A, pero la **tabla** del panel mostraría `0.00` en
`cloud_cover` y `precipitation` del MOS → **se lee como "modelo perfecto"**.

Reglas:

| Caso | Mostrar |
|---|---|
| `contendiente === 'mos'` y `variable ∈ {cloud_cover, precipitation}` | **N/A** (tooltip: *pass-through del NWP; no evaluable en este backtest*) |
| `contendiente === 'ecmwf_crudo'` sin filas (DNI, DHI, precipitación) | **—** |

**Criterio**: ninguna celda muestra un `0.00` engañoso.

---

## 3.4 (credibilidad) Aviso de "datos previos al fix"

`comparativa_skill.json` ya guarda `meta.commit`. Que el servicio Node lo compare con el
`HEAD` actual y exponga `stale: true` + el commit; el panel muestra un banner:

> *Datos previos al fix del proxy (commit `98ff052`) — re-correr la comparativa.*

**Criterio**: abriendo el panel **hoy** aparece el aviso (los artefactos son pre-fix).

---

## 3.5 (cosmético) Ocultar la pestaña de overlay si falta el artefacto

`comparativa_series.json` no existe → esa pestaña dice siempre *"Sin serie de ejemplo"*,
que se lee como bug. Ocultarla/deshabilitarla mientras `available: false`.

---

## 3.6 (cosmético) Docstring del endpoint

`optimization/prediction/main.py:150`: `provider: openmeteo|timesfm|patchtst` →
añadir `mos`.

---

## Criterios de cierre

- [ ] `./dev.sh` → login → Dashboard: el selector incluye **MOS**.
- [ ] Al elegirlo, la tarjeta muestra 48 h del MOS con `Fuente: mos` y el aviso 3.2.
- [ ] La tabla del panel **no** muestra `0.00` en las 2 variables pass-through del MOS.
- [ ] El panel avisa de que los datos son previos al fix (3.4).
- [ ] **Regresión**: `openmeteo`, `timesfm` y `patchtst` siguen funcionando igual;
      los paneles de experimentos y calibración, intactos.
- [ ] El MOS sigue con `MAX_HORIZON_H = 72` (no tocar).

---

## Trampas

1. El MOS necesita **lightgbm + torch** en el entorno del servicio de predicción
   (los importa *lazy*). Si faltan, el endpoint devuelve error amable — no rompe el Dashboard.
2. El MOS pide **ECMWF en vivo** (`models=ecmwf_ifs025`) → si la cuota está agotada (429),
   la tarjeta mostrará error. Es esperado: el mensaje debe ser claro, no un stacktrace.
3. **No tocar** el `hours: 48` de la tarjeta (ya está dentro del límite de 72 h del MOS).
4. **No reordenar** la lista de providers: añadir `mos` al final.
