# Precio del combustible usado HOY en la tesis (para declarar la diferencia)

**Artefacto de referencia del cambio 11.** El proyecto de la tesis vive fuera de este repositorio
(`C:\Users\2D\tesis-microrred`), así que el implementador no puede comprobarlo por sí mismo.

## Valor y ubicación exacta

```python
# tesis-microrred/scripts/ems_balance.py  línea 157
price_cop_per_L = 4500  # ~1.1 USD/L
```

Y se usa de forma **consistente** en todo el Módulo 3 (mismo valor, sin excepciones):

| archivo de la tesis | línea | uso |
|---|---|---|
| `scripts/ems_balance.py` | 157 | `price_cop_per_L = 4500  # ~1.1 USD/L` |
| `scripts/ems_mpc.py` | 90, 162, 204 | `(a0 + a1·P + a2·P²) * 4500` |
| `scripts/ems_decision_transformer.py` | 89, 345, 384 | `(a0 + a1·P + a2·P²) * 4500` |
| `scripts/ems_dimensionamiento_pv.py` | 56 | `PRICE_COP_L = 4500` |

## La forma de la ecuación es la MISMA que la del repo

```
tesis :  (a0  + a1·P + a2·P²) · 4500        con a0=1.8, a1=0.24, a2=0.0012
repo  :  (c   + b ·P + a ·P²) · fuel_cost   → equivalencia c↔a0, b↔a1, a↔a2
```

## Diferencia declarada con el precio del sitio (Pasto, CREG oct-2026)

| | precio | @50 kW | vs Pasto |
|---|---|---|---|
| tesis | 4,500 COP/L | 1,512 COP/kWh | **+62 %** |
| **Pasto real** | **2,782 COP/L** | **935 COP/kWh** | — |

**Decisión del autor (registrada en la spec §7)**: los capítulos ya escritos mantienen **4,500**; la
plataforma usa el **precio real del sitio** con su vigencia y fuente. La diferencia queda **explícita**
para que no se lea como una inconsistencia. Para futuras revisiones del manuscrito, el dato CREG con
vigencia mensual es más defendible que un supuesto de 1.1 USD/L.

**Nota**: el ACPM en Colombia tiene componente subsidiado; si en algún análisis se requiere un precio
sin subsidio, debe **declararse como supuesto aparte** (nunca sustituir el dato del sitio en silencio).
