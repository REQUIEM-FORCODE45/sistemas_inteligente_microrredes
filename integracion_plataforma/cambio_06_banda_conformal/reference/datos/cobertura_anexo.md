# Línea base medida — cobertura de la banda

> Copia literal de `informe.md` líneas 437-470 (anexo de Fase 2). El original vive en el informe; esta copia existe para que el implementador tenga la cifra de referencia sin depender de otro agente.

# Anexo — Resultados consolidados (Fase 2: calibración y pronóstico)

Resultados reproducibles (semillas fijas, clima ERA5 real de Pasto, 6 meses
horarios, split temporal 70/30). Artefactos en `results/pasto_narino/`.

## Calibración PV en dos niveles (HO#3)

| Experimento | Nominal | Derating K | Calibrado | Híbrido (N1+N2) |
|---|---|---|---|---|
| seed 7 — planta limpia | 1.671 kW | 0.429 kW | **0.427 kW** | 0.502 kW |
| seed 42 — planta realista (suciedad+sombra) | 4.019 kW | 1.534 kW | 1.507 kW | **0.496 kW** |

- seed 7: la identificación recupera la verdad oculta (losses 20.1 vs 21.0,
  η 0.918 vs 0.93, γ −0.409 vs −0.42); el ML no aporta donde solo hay ruido.
- seed 42: los parámetros se contaminan (losses 27.3, η 0.869, γ=−0.10 en el
  límite) al absorber suciedad/sombra; el residual ML gana −67% y sus
  features dominantes (`hour_sin`, `elapsed_days`) coinciden con los efectos
  inyectados. Reproduce cualitativamente HO#3.

## Banda probabilística P10-P90 (split-conformal)

| seed | Radio conformal | Cobertura holdout | @nivel q90 | @nivel q95 |
|---|---|---|---|---|
| 7 | 0.555 kW | 50.2% | 85% | 92% |
| 42 | 0.848 kW | 54.8% | 98% | 100% |

Hallazgo (replica HO#1 §6.6): con split-conformal disjunto la cobertura
nominal 80% NO se alcanza bajo deriva temporal; el nivel q95 la garantiza.
Documentado para el capítulo de calibración probabilística.

## Baselines de pronóstico (walk-forward, ERA5, MAE diurno)

| Variable | Persistencia | Climatología | ARIMA (h=12) |
|---|---|---|---|
