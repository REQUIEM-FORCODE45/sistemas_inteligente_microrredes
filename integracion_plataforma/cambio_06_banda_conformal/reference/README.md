# `reference/` — paquete de referencia del cambio 06

Artefactos que respaldan cada cifra de la spec. **Tamaño + sha256** por archivo (regla dura 3:
toda cifra sale de un artefacto versionado).

| archivo | bytes | sha256 |
|---|---|---|
| `datos/cobertura_anexo.md` | 1798 | `6fd24a189fdec7c57d13841c6d1bb55405e39c2fad2e867866c7d58cddec79fd` |
| `datos/pasto_solar_pv.json` | 297 | `686ae358cd87618fd7be807f7231b67c9528f8d92d9dd029d8b6f1c5590d4cdb` |
| `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` | 13127 | `e00ebe101d7e0b62dcb33d23fb24bbbf4a1d203a0d464ce6d8668fb352b89729` |
| `scripts/medir_cobertura_banda.py` | 11219 | `30015a85be596e63e5de96f4e2be3c829a7d90b2582db3d141de6ccf76643c5d` |

## Qué es cada cosa

| archivo | para qué |
|---|---|
| `scripts/medir_cobertura_banda.py` | **protocolo único de medición**: mide la cobertura de la banda con el criterio **actual** y con el **corregido**, sobre el **mismo holdout**. Ambas partes lo ejecutan antes y después del cambio |
| `datos/cobertura_anexo.md` | copia literal del anexo del informe con la **línea base medida** (50.2% / 54.8% con nominal 80%) |
| `datos/pasto_solar_pv.json` | resumen del artefacto calibrado **actual** (k, params, radio conformal, n_muestras) |
| `docs/AUDITORIA_FORMULAS_Y_CALIBRACION.md` | auditoría con la evidencia y las líneas exactas (§B.2–B.3) |

## Ejecución (READ-ONLY)

El script **no escribe artefactos ni toca el repositorio**: solo lee mediciones de Mongo
(`Backend/.env`) y clima de Open-Meteo archive (sin API key).

```bash
python integracion_plataforma/cambio_06_banda_conformal/reference/scripts/medir_cobertura_banda.py \
    --sensor pasto_solar_pv --alpha 0.2 --out cobertura_06.json
```

Salida: JSON con `metodo_actual`, `metodo_corregido`, `delta_cobertura` y `criterio_cierre`
(objetivo declarado: **≥ 0.72** con nominal 0.80). Se versiona el JSON; la cifra que se publique
sale de ahí, nunca de una transcripción a mano.

## No se incluye `.gitattributes`

Este paquete solo contiene **texto** (`.py`, `.json`, `.md`). El riesgo de CRLF que motivó el
`.gitattributes` del cambio 01 aplica a **artefactos binarios de modelo** (LightGBM), que aquí no
viajan: el `.pkl` calibrado **no se copia**, se regenera.
