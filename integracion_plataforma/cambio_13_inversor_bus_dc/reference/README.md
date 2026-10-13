# reference — cambio_13_inversor_bus_dc

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos** (es una spec de arquitectura y de
contrato): no hay JSON/CSV/figuras que el implementador no pueda generar por su cuenta.
Por eso `reference/` no lleva `datos/` ni `scripts/`.

## Documentos que la spec cita (ya versionados en el repo)
- `integracion_plataforma/cambio_06_banda_conformal/README.md`
- `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md`

## Manifiesto de la spec

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 9164 | `c00dcde28d2c89dcb4f9d7f0cfe220628e311d5b044b262880c67af5f37c33de` |

## Evidencia visual versionada (render real, no mockup)

| archivo | bytes | sha256 |
|---|---|---|
| `figuras/cambio_13_unifilar.png` | 145992 | `59e9341d4e9096cb3446bffdfcdf2b76c8d7b42324b7391108a1db432ac5e4b2` |

- `figuras/cambio_13_unifilar.png` — captura 1920×1080 del lienzo con el 13
  aplicado (7 nodos, inversor con η=0.97 declarada, eco `modelado`). Lo que se
  ve: tarjeta del inversor con píldora `▲ convirtiendo`, `Capacidad 10.0 kW`,
  `Eficiencia 97%`, **sin** la nota "Solo visual" y **sin** badge "no simulable";
  rama inv→bus con badge `▲ 9.7 kW` (= 0.97 × 10.0, la conversión en el cable);
  ramas `sin modelo` desaparecidas (todo modelado). Tomada con harness temporal
  (borrado tras la captura).

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
