# VERIFICACION — Cambio 11 · Precio del combustible declarable + Willans

Evidencia **medida ejecutando**. Fecha: 2026-10-11.

## Implementado

- `optimization/config/sites/pasto_narino.yaml`: sección `fuel` (2782/10529/Pasto/2026-10/CREG).
- `optimization/config/loader.py`: expone `fuel` (default Pasto si falta la sección).
- `optimization/experiments/config.py`: `MICROGRID["diesel"]` Willans + `fuel_cost` desde el sitio; docstring con equivalencia y fuente.
- `optimization/solver/model_builder.py`: precedencia **nodo > sitio > default**, normalización legacy (100 y 0.001/0.5/0.5 → sitio/Willans, solo con `site_id`); `fuel_price_applied {valor, origen, vigencia, fuente}` en el resultado; desglose usa valores resueltos.
- `optimization/solver/run_once.py`: inyecta `fuel` del sitio por `site_id` si el job no lo trae.
- `Backend/services/mpcScheduler.js`: `site_id` en el job; `DEFAULT_TOPOLOGY` Willans, `fuel_cost` resuelto por el solver.
- Frontend: `deviceTypes.js` Willans + `fuelCost: null` (sitio); mapper omite `fuel_cost` si no declarado; `OPTIONAL_PARAMS/NUMERIC` + etiquetas con unidad (`COP/L`, `L/h`, `L/(h·kW)`, `L/(h·kW²)`) y procedencia.
- `results/pasto_narino/experiments/REGIMEN_ECONOMICO.md`: etiqueta 89.29× → 5.35× + pendientes de re-corrida; CSVs intactos.
- Tests: `optimization/tests/test_fuel_site.py` (5 tests).

## Criterios

- [x] **C1** — `load_site("pasto_narino")["fuel"]["price_cop_per_l"] == 2782`; job con `site_id` →
  `fuel_price_applied.valor == 2782.0`; costo a 50 kW: **934.8 COP/kWh** (≈935).
- [x] **C2** — nodo `fuel_cost=3000` → `origen: "nodo"`, valor 3000.0; sin editar → `origen: "sitio"`.
- [x] **C3** — job isla 8 h: desglose diésel **373,900.8** vs Willans×precio a mano **373,900.8** (<0.01 %).
- [x] **C4** — `89.29× antes → 5.35× después` con precio, vigencia y fuente en `REGIMEN_ECONOMICO.md`.
- [x] **C5** — `expA_metrics.csv`, `expA_table.md`, `expA_cumulative_cost.csv`, `expA2_metrics.csv`,
  `expA2_table.md` intactos (sha256 registrados en el sidecar; nada reescrito).
- [x] **C6** — precio en `pasto_narino.yaml` **y** en `fuel_price_applied` del resultado (vigencia + fuente).
- [x] **C7** — job isla a 50 kW: **336.0 L/MWh** (no 560).
- Regresión: `test_solver.py` + `test_complementarity_scenarios.py` → mismos 2 fallos preexistentes, resto pasa; frontend lint 0 + build ✓.
