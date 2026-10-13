# reference — cambio_14_transformador

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos** (es una spec de arquitectura y de
contrato): no hay JSON/CSV/figuras que el implementador no pueda generar por su cuenta.
Por eso `reference/` no lleva `datos/` ni `scripts/`.

## Documentos que la spec cita (ya versionados en el repo)
- `integracion_plataforma/cambio_08_modelo_mpc_fisica/README.md`

## Manifiesto de la spec

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 6393 | `0bcd8d6035435b9cf5ccd8a4e66dfe5496fdb84d5b198f8547dbabfb7fffbb5e` |

## Evidencia visual versionada (render real, no mockup)

| archivo | bytes | sha256 |
|---|---|---|
| `figuras/cambio_14_unifilar.png` | 160321 | `2c79ebd9bb07c9e9ddcf5a0510f0f50ce277088f` |

- `figuras/cambio_14_unifilar.png` — captura 1920×1080 del lienzo con el 14
  aplicado (8 nodos, trafo con placa declarada en la rama de red, eco
  `modelado`). Lo que se ve: tarjeta del trafo con rótulo `13.2/0.22 kV`,
  píldora `▲ transformando`, `Capacidad 100 kVA`, `Pérdidas 2.0%` y pie
  `Despacho: pérdidas + capacidad · tensión/impedancia NO incluidas`;
  ramas grid→trafo→bus con `▲ 10.0 kW`; paleta Conversión con Inversor +
  Transformador; panel de sensores con 6 equipos (trafo excluido, como la
  barra). Harness temporal borrado.

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
