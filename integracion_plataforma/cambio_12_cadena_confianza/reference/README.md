# reference — cambio_12_cadena_confianza

## Artefactos de datos
Este incremento **no introduce artefactos de datos nuevos**: no hay JSON/CSV de mediciones que el
implementador no pueda generar. **Sí lleva la referencia VISUAL** (figuras vectoriales) que la spec
cita: el implementador **copia** de aquí en vez de inventar iconografía.

## Documentos que la spec cita (ya versionados en el repo)
- `../../docs/PLAN_AMPLIACION_MODELO_ELECTRICO.md` (§F6: rediseño visual y reglas de fluidez)
- `../../docs/PLAN_DIAGRAMA_Y_MODELOS.md` (modelos por dispositivo)
- `../AUDITORIA_12.md` (auditoría de la cadena de confianza)

## Evidencia visual versionada (render real, no mockup)
- `figuras/cambio_12_4_unifilar.png` — captura 1920×1080 del lienzo con el 12.4
  aplicado (7 nodos, 6 ramas, eco con `dispatch_plan` + `device_echo`). Tomada con
  el harness temporal `__harness124.jsx` (borrado tras la captura; el diagrama se
  precarga vía `loadDiagram` + `setOptimizationResult`). Lo que se ve: filetes,
  6 símbolos verbatim en tarjeta, píldoras solo-con-datos, `smoothstep` + grosor ∝ kW con badges
  `▲ 4.0/10.0 kW`, ramas `s=0` en el camino DC (inversor aún solo-visual, lo cierra
  el cambio 13), barra de 880 anclada, panel de sensores **sin** la barra.

## Manifiesto (sha256 del blob versionado, LF)

| archivo | bytes | sha256 |
|---|---|---|
| `../README.md` | 10712 | `c879cd740bb15ceed2939a7e1ac7fa40cf26c00bf3bf736492c970f9773470f8` |
| `docs/DECISION_VISUAL.md` | 3336 | `7bad09903616335b55ad7ba3db8225f6aac062a9e10dec4face17e80d4e53de4` |
| `figuras/unifilar_variante_b.svg` | 11770 | `4ac9c7c1a41a76b9f983c1f8148c32e58129098ff98d5ba2e902bf9b5eb9139c` |
| `figuras/simbolos.svg` | 7599 | `31b50aa306de47dfe752d99350dfcc795ba16345b28c6e17aa2993e1a25eeac8` |
| `figuras/unifilar_variantes.html` | 20681 | `b3364c9219b1214014494999dec1b2d77083b0442bf1a96c14ed1de002eb14db` |
| `figuras/cambio_12_4_unifilar.png` | 153302 | `a3f6b2a1f2187fd62ab7c92494f80e5ccb194d392de71ffeb36e762521700906` |

> Los sha256 son del **blob versionado (LF)**. En un checkout Windows con `core.autocrlf=true` el
> archivo en disco puede diferir por CRLF: verificar con `git show HEAD:<path> | sha256sum`,
> **no** con `sha256sum <path>`.
