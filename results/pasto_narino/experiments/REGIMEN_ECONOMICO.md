# RÉGIMEN ECONÓMICO de las tablas publicadas (cambio 11)

> Las cifras de esta carpeta **NO se reescriben** (append-only). Esta nota las
> **etiqueta** con el régimen bajo el cual se produjeron y declara el vigente.

## Régimen vigente (producción y validaciones futuras)

- Precio: **2,782 COP/L** · ciudad **Pasto** · vigencia **2026-10** · fuente **Portal CREG**
  (`optimization/config/sites/pasto_narino.yaml`, sección `fuel`).
- Curva: **Willans de la tesis** (`c=1.8 L/h`, `b=0.24 L/h·kW`, `a=0.0012 L/h·kW²`).
- Relación ENS/diésel a 50 kW: **5.35×** (5,000 ÷ 934.75 COP/kWh).
- Consumo a 50 kW: **336 L/MWh**.

## Régimen de las tablas publicadas aquí (Exp A / Exp A2)

- Precio: **100 (adimensional, sin vigencia ni fuente)** · curva paramétrica
  (`c=0.5, b=0.5, a=0.001`) → 56 COP/kWh a 50 kW · **ENS/diésel 89.29×** · 560 L/MWh.
- Estado: cifras **PENDIENTES DE RE-CORRIDA** (bloque de validación diferido);
  las validaciones usarán el precio de Pasto.

## Trazabilidad

- sha256 al etiquetar (2026-10-11):
  - `expA_metrics.csv` `42eabfaa3229daa0749ef0275ea0a70df110576014bba07be658937f9cddf0bf`
  - `expA_table.md` `0b3f535049365eb661520ec89623eba2156f8ba0d97b9f08ab3d2d9eaec089dd`
  - `expA_cumulative_cost.csv` `db375095671b8c8a4d0ae73a5152106b6dc40e9f2bcd05c0520c350295c58619`
  - `expA2_metrics.csv` `c6122d0e7d63abea8c697065354b4bb53bab6338d066f3cfab679dd39802e8ac`
  - `expA2_table.md` `a9b0ad8479e72e2b721b6cdb322fc9ed649d00e157ac6292e40830959928ab51`
- Nota sobre la tesis: precio 4,500 COP/L (**+62 %** vs Pasto) — decisión del autor,
  capítulos ya escritos mantienen 4,500; la plataforma usa el real del sitio.
