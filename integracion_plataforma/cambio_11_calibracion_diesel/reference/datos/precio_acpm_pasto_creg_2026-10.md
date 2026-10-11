# Precio del ACPM por ciudad — octubre 2026 (Portal CREG)

**Artefacto de referencia del cambio 11.** El implementador no puede abrir el portal; esta es la cifra
citada por la spec, con su fuente y su fecha para que el precio sea auditable.

| Ciudad | COP por galón | **COP por litro** |
|---|---|---|
| Bogotá | $11,616 | $3,069 |
| Cali | $11,763 | $3,108 |
| Medellín | $11,641 | $3,076 |
| Barranquilla | $11,291 | $2,983 |
| **Pasto (sitio del proyecto)** | **$10,529** | **$2,782** |
| Cúcuta (frontera) | $9,486 | $2,506 |

**Fuente**: Portal CREG — *"Precio del galón de ACPM por ciudad principal (octubre 2026)"*.
Conversión usada: galón = 3.785 L.

## Valor que va al YAML del sitio

```yaml
fuel:
  price_cop_per_l: 2782
  galon_cop: 10529
  ciudad: "Pasto"
  vigencia: "2026-10"
  fuente: "Portal CREG"
```

## Por qué el precio es un dato del sitio y no una constante

En Colombia el ACPM **varía por ciudad** (rango observado **$2,506 – $3,108/L**, un 24 % entre Cúcuta y
Cali) **y en el tiempo** (ajustes mensuales). Cualquier valor fijo en el código queda desactualizado y
sin trazabilidad. De ahí el campo `vigencia` + `fuente` obligatorios y la precedencia declarada
(nodo > sitio > default).

## Efecto del precio en el régimen del MPC

Con la Willans de la tesis (`1.8 + 0.24·P + 0.0012·P²`) y la penalización de ENS en 5,000 COP/kWh:

| precio | @50 kW | ENS ÷ diésel |
|---|---|---|
| 100 (repo, adimensional) | 56 COP/kWh | **89.29×** |
| 4,500 (tesis, ~1.1 USD/L) | 1,512 COP/kWh | 3.31× |
| **2,782 (Pasto real)** | **935 COP/kWh** | **5.35×** |

El régimen del sitio es **5.35×**: un ENS cuesta 5.4 veces más que generar con diésel.
