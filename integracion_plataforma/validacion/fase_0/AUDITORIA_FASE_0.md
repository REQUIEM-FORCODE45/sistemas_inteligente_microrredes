# AUDITORÍA — VALIDACIÓN FASE 0

> Ejecutada por quien especifica, sobre **`f9bc92d`**. Fecha: 2026-10-20.
> Método: recálculo propio sobre los artefactos versionados + lectura del código. **Este clon es solo de
> revisión** (sin `node_modules`, sin Mongo, sin `pyomo`): nada de lo que requiera correr el solver se
> ejecuta aquí; se verifica que **los números cuadren con los artefactos**.

---

## 1. Veredicto

**Fase 0 aprobada en lo que mide, y honesta en lo que no.** Las tres verificaciones numéricas pasan
(las recalculé yo). La decisión de entorno está bien argumentada y es la correcta: **no re-correr lo
caro**, medirlo por vía corta y declarar el resto.

Pero hay que decir algo con claridad: **V7 y V3 no están respondidos**. Se midió una **muestra** (1 solve)
y un **brazo** (el publicado), y ambos están declarados como tales. La pregunta que la Fase 0 debía
cerrar —*¿qué cifras publicadas siguen en pie?*— queda **contestada a medias**: la dirección es la
esperada, el tamaño del efecto **no está medido**.

| Prueba | Declarado | Verificado aquí |
|---|---|---|
| **V8a** jobs idénticos actual vs pre-15 | 4/4 `igual: true` | ✅ **coincide** (los 4 pares con el mismo sha canónico) |
| **V7** delta del inversor | +64,74 (+0,63 %) | ✅ **aritmética correcta**: 10393,99 − 10329,25 = **64,74** → 64,74/10329,25 = **0,6268 % → 0,63 %** |
| **V3** ENS isla 08-03/04/05 | smpc 3,45 · dmpc 8,82 (+1,83 = 10,65) | ✅ **recalculado del CSV publicado, exacto**: smpc 1,1195+0+2,3316 = **3,45**; dmpc 2,6238+0+6,1936 = **8,82**; +1,8322 = **10,65** |
| Manifiesto (sha256 de los 4 artefactos) | tabla en `manifest.json` | ✅ **los 4 coinciden** con el blob de git |

---

## 2. La decisión de entorno: correcta, y descubre el cuello de botella real

`v8a_timeout_head.txt` muestra la causa, y es la que ya conocíamos:

```
WARNING optimization.solver.solvers: Gurobi fallo: Model too large for size-limited license
INFO pyomo.contrib.appsci.solvers.highs: MIP has 2036 rows; 2094 cols; 792 binary
```

**Gurobi no admite el modelo de 24 h** (2.094 columnas > límite de la licencia size-limited) → **todos
los solves van a HiGHS**. Ritmo medido por el implementador: **~110 s/solve** (8 solves en 15 min antes
del corte). De ahí el presupuesto:

| Corrida | Solves (est.) | Tiempo con HiGHS |
|---|---|---|
| ExpA2 3 d × 2 estrategias | 144 | **4–6 h** |
| **V1** ExpA2 14 d isla × 2 | ~672 | **~20 h** |
| **V2** grid30 + grid10 + isla | ~576 | **~18 h** |

**Esto es el verdadero bloqueo del bloque de validación**, no una limitación de la Fase 0. Decidir no
correrlo fue correcto; pero conviene saber que **con HiGHS la validación completa son decenas de horas**.

> **Recomendación fuerte**: tramitar la **licencia académica de Gurobi** (gratuita para universidades,
> sin el límite de tamaño). Eso convierte 20 h en decenas de minutos y desbloquea V1/V2 completos. Es la
> acción con mejor relación coste/beneficio de todo lo que queda pendiente.

---

## 3. Hallazgos

### 3.1 🟠 V7 no está respondido: es una **muestra de 1 solve**, no el par de 3 días

`v7_sample.json` compara **un** solve de 24 h (ventana 2026-08-03) con y sin `converters`. El propio
artefacto lo dice: *"Muestra direccional, NO los deltas de 3 días"*. Y es correcto que lo diga.

**Qué sirve**: la **dirección** (con inversor cuesta **más**, +0,63 %, coherente con 3 % menos de PV
aprovechable) y que el efecto es **pequeño**. **Qué no sirve**: el **número para el capítulo** — el delta
de costo/ENS/litros de 3 días sigue sin medir.

**Y hay un matiz de método**: el brazo "sin inversor" se corrió en el worktree **pre-13** (`0fced54`),
no con `converters: []` en el árbol actual. Como el pre-13 no modela el inversor, es aceptable, pero
entonces **no se está comparando solo `eta`**: se compara **código pre-13 vs post-16**. Para aislar el
η habría que correr el árbol actual con y sin `converters` (el mismo código), que es la comparación
justa. Con 1 solve el sesgo probablemente sea nulo, pero con 3 días hay que hacerlo bien.

### 3.2 🟠 V3 está a medias: el brazo `era5` **no se corrió**

Lo que se hizo es valioso pero **no es V3**: se verificó que el **CSV publicado cuadra** con la tabla del
§2 de `PENDIENTES_MPC_ESTADO.md` (y cuadra exacto, lo recalculé). Eso responde *"¿la tabla del documento
refleja el artefacto?"* → **sí**. Lo que V3 preguntaba era otra cosa: *"¿el ENS de esos días es artefacto
de la fuente de PV?"* → **sin correr `--pv-source era5` no se sabe**. Está declarado como no medido ✓,
con el comando listo ✓.

### 3.3 🟡 `manifest.json` **es markdown**, no JSON

El archivo se llama `manifest.json` y su contenido es una tabla markdown (`| archivo | bytes | sha256 |`).
El contenido es correcto —los 4 sha256 **coinciden** con el blob—, pero el nombre engaña: cualquier
herramienta que lo parsee falla (me pasó a mí al abrirlo). **Renombrar a `MANIFEST.md`** o convertirlo a
JSON real. Y ojo: `test_manifiestos_reference` **no lo cubre** (solo recorre `reference/README.md`) → o se
extiende la convención, o este queda sin red.

### 3.4 🟡 Las corridas usan **PV calibrado, no el sensor**

El log de la corrida lo dice:

```
WARNING optimization.experiments.data_loader: PV Mongo vacio; usando planta calibrada sobre ERA5
```

Es el pitfall conocido (Mongo sin historial PV → planta calibrada). **No invalida** la muestra de V7
—ambos brazos usan la misma entrada— pero sí hay que declararlo: el delta de +0,63 % es sobre la **planta
calibrada**, no sobre la operación real.

---

## 4. Lo que la Fase 0 sí habilita (y con qué condición)

La conclusión del implementador es defendible: **V8a idéntico + V7 con dirección y magnitud pequeña**
→ las cifras publicadas se pueden sostener en el capítulo **con una nota al pie** (job actual = job
publicado + inversor −3 % PV + switches que no tocan defaults).

**Condición**: que el par completo de 3 días (cuando haya Gurobi) **no muestre un delta grande**. Por
eso V7 no se puede cerrar con una muestra: es justo el número que decide si hay que rehacer los números
del capítulo.

---

## 5. Qué pediría para cerrar la Fase 0

1. **Licencia académica de Gurobi** (decisión del autor, no del implementador) → desbloquea todo.
2. Con solver completo: **V7 completo** — 3 días, **mismo código** con y sin `converters` (no worktree
   pre-13), reportando costo **y** ENS **y** litros; y el par en isla como contraste (delta esperado ≈0).
3. Con solver completo: **V3 brazo `era5`** — el comando ya está escrito en el README.
4. Renombrar `manifest.json` → `MANIFEST.md` (o JSON válido) y decidir si el test de manifiestos lo cubre.

Nada de esto toca código. Y **V1/V2 siguen sin lanzarse**, que es la decisión correcta hasta tener
solver rápido.
