# VERIFICACIÓN — Cambio 03 (MOS visible en el Dashboard)

**Commit verificado**: `f3abca8`. **Método**: servicio Node ejecutado + revisión de los
diffs (no lectura de la spec).

## Resultado: 3.1 – 3.6 ✅ implementados y funcionando

| # | Cambio | Estado | Evidencia |
|---|---|---|---|
| 3.1 | Selector incluye el MOS | ✅ | `{ id: 'mos', label: 'MOS (ECMWF+ML)' }` en `DashboardPage.jsx` |
| 3.2 | Aviso metodológico | ✅ | nota condicional `provider === 'mos'` en la tarjeta |
| 3.3 | **N/A en la tabla** | ✅ | `MOS_PASS_THROUGH = {cloud_cover, precipitation}`; **12 celdas** marcadas N/A (verificado en el servicio); filas ausentes del crudo → `—` con tooltip |
| 3.4 | **Banner "datos previos al fix"** | ✅ | servicio ejecutado: `stale: true`, `dataCommit: a1bff6b`, `head: de90eb5` |
| 3.5 | Ocultar overlay sin artefacto | ✅ | `tabs = hasSeries ? [...'overlay'] : [...]` + fallback de pestaña activa (evita panel en blanco) |
| 3.6 | Docstring del endpoint | ✅ | `provider: openmeteo\|timesfm\|patchtst\|mos` |

**Servicio Node ejecutado** (prueba real, no lectura):

```
available: true | stale: true
dataCommit: a1bff6b | head: de90eb5
detalle filas: 276 | resumen: 30
celdas N/A (mos pass-through): 12
```

El `stale: true` es correcto: los datos son del commit `a1bff6b`, **anterior** al fix del
proxy (`1a0c19d`) → el banner aparecerá y evita que se lean números pre-fix como vigentes.

## Pendiente: solo 3.7 (reproducibilidad) 🟢

- **3.7** `optimization/requirements.txt` no declara `lightgbm` → añadirlo. **No bloquea
  nada**: en la VM ya está instalado (prueba: la comparativa corrió el MOS 12 meses, lo que
  exige `lightgbm` + `torch`).
- ~~**3.8** `dev.sh`~~ → **RETIRADO** por corrección del autor: la plataforma corre en una
  **VM (Linux)**, no en el Windows del usuario. `dev.sh` **no se toca**; el hallazgo salió de
  inspeccionar el clon de Windows, que es solo para lectura/verificación.

**La verificación de la UI** (arrancar, ver el selector, ver la tarjeta del MOS) se hace
**dentro de la VM** — no en el clon de Windows.
