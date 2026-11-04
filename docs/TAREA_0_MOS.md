# Tarea 0 con MOS — spec de la re-corrida de la Fase 1

**Estado**: especificada, pendiente de ejecucion en la VM Linux.
**Decision del autor (2026-11-04)**: *"con mos pero guarda resultados patchtst"*.

## 1. Por que ahora

La cola de produccion 06-19 esta cerrada y los forecast ya estan corregidos: nubes 30,03 ->
15,15, viento 4,86 -> 0,62, DNI 86,89 -> 60,18 y DHI 130,50 -> 19,39, todos causales. Hoy la
plataforma puede servir tres proveedores distintos segun por donde se entre:

| sitio | valor | archivo |
|---|---|---|
| default del predictor | `openmeteo` | `optimization/prediction/forecaster.py` |
| despliegue en la Pi | `patchtst` | `deploy_pi.sh:52` |
| backtest / experimentos | `patchtst` **hardcodeado** | `optimization/experiments/data_loader.py:154` |

Mientras eso no se unifique, **el capitulo y la pagina no hablan del mismo modelo**, y
cualquier cifra nueva nace con esa ambiguedad.

## 2. T0.1 — unificar en `mos`

- `forecaster.py`: default `mos`.
- `deploy_pi.sh:52`: `FORECASTER=mos`.
- `data_loader.py:154`: quitar el `name="patchtst"` hardcodeado y que respete el proveedor
  efectivo. Si necesita un nombre para el CSV, que lo reciba, no que lo invente.

**Criterio**: pedir el forecast por los tres caminos y que los tres devuelvan el **mismo
`provider` efectivo**. Se verifica leyendo `fc.provider` (ya lo devuelve `main.py:226`), no
suponiendo.

## 3. T0.2 — re-correr la Fase 1 con `mos`

Mismo diseno, mismo periodo, mismo decode, mismos baselines que la Fase 1 publicada. **Se
cambia UNA cosa: el proveedor del forecast.** Se re-corren los bloques que dependen del
forecast: V1 (banda C), V2 (red), V3 (fuente), V7 (inversor). V5 (lazo en vivo) solo si
alcanza el tiempo; si no, se declara no corrido.

Salidas en `integracion_plataforma/validacion/fase_1_mos/`:

```
README.md            tabla pregunta|corrida|respuesta(numeros)|artefacto
MANIFEST.md          archivo | bytes | sha256 de todo lo de la carpeta
v1_bandc/ ...        misma estructura que fase_1/
```

Y en cada `resultado.json`, un campo nuevo obligatorio:

```json
{"provider": "mos", "modelo": "iTransformer + LightGBM MOS (v2 causales)",
 "boosters": {"cloud_cover": "v2", "wind_speed_100m": "v2",
              "direct_normal_irradiance": "v2", "diffuse_radiation": "v2"}}
```

**Eso es lo que faltaba en la Fase 1**: la cifra sin la cadena de prediccion no se puede
reproducir.

## 4. T0.3 — preservar PatchTST

**No renombrar ni borrar `fase_1/`.** Sus artefactos, su `MANIFEST.md` y sus sha256 quedan
como estan; ya se declaro ahi que corrieron con PatchTST. La carpeta nueva es adicional
(append-only). Si algo de `fase_1/` necesita corregirse, va en una version nueva, no encima.

## 5. Criterios de aceptacion

1. **Los tres caminos sirven `mos`** y lo declaran (`fc.provider`).
2. **Cada `resultado.json` de `fase_1_mos/` declara provider y boosters.**
3. **La comparacion es por par**: S-MPC vs D-MPC en la misma ventana. No se compara una
   celda `mos` contra una celda `patchtst` de otra fecha.
4. **Si un bloque no se puede correr por presupuesto de horas**, se declara no corrido con el
   motivo. No se rellena con el resultado de PatchTST.
5. **`fase_1/` intacta**: sha256 identicos a su `MANIFEST.md` antes y despues.

## 6. NO HACER

- No sobrescribir `fase_1/` ni sus CSV.
- No mezclar cifras `mos` y `patchtst` en una misma tabla sin declarar el cambio.
- No reportar `feasible` como `optimal` (C6 del cambio 18 sigue vigente).
- No ajustar numeros para que un criterio pase.

## 7. Presupuesto

HiGHS ronda **52-110 s por solve**. La Fase 1 publicada consumio horas de solver; el
presupuesto se decide antes de lanzar y se declara. Si no alcanza para todo, el orden es
**V1 -> V2 -> V7 -> V3 -> V5**, porque V1 es la que va al texto del capitulo.
