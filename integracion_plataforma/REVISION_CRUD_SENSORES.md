# REVISIÓN INDEPENDIENTE — CRUD DE SENSORES (gestión desde la UI)

> Autor del cambio: **Dario Solarte** · commit **`c025f0d`** (2026-10-18) ·
> *"feat(sensores): gestion desde la UI — eliminar, cambiar estado y lista al instante"*.
> Revisado por quien **especifica** la integración (auditoría **solo lectura**) · 2026-10-19.
> Alcance: 7 archivos (Backend + Frontend). **No es un cambio de la cola 01–16**: es un PR ajeno al
> roadmap, revisado por su impacto cruzado con la **cadena de confianza** (cambio 12) y el bucle MPC.

---

## 1. Veredicto

**Aprobado, con dos hallazgos a resolver y tres observaciones menores.** El código está bien pensado y
la parte difícil —que la lista blanca MQTT y el estado del sensor **no se desincronicen**— está
resuelta **de punta a punta**, incluido el arranque. No toca topología, solver ni unifilar: los cambios
12–16 quedan intactos.

| # | Tipo | Hallazgo |
|---|---|---|
| 1 | 🟠 | **`includeInactive: true` es global**: el diagrama y el selector de sensores ahora ofrecen sensores **inactivos** → enlazables al MPC |
| 2 | 🟠 | **El borrado es destructivo e irreversible** y no avisa a quien lo referencia |
| 3 | 🟡 | `canManageSensor` es **fail-open** si el sensor no tiene `userId` (pre-existente, pero ahora borra) |
| 4 | 🟡 | **No hay tests JS en el repo** y este PR añade dos rutas destructivas |
| 5 | 🟡 | `getAllAuthorizedDevices` fuerza `includeInactive` para el dueño/admin (coherente, a declarar) |

---

## 2. Lo que verifiqué (leyendo el código y el arranque real)

### 2.1 La lista blanca MQTT y el estado no se desincronizan ✅ (esto es lo importante)

- **Arranque**: `securityManager.syncAuthorizedSensors()` ya filtraba **`{ status: 'active' }`**
  (`securityManager.js:14-19`) → el estado **sobrevive un reinicio** ✓. (Comprobado, no asumido.)
- **Alta**: `registerNewSensor` **solo** añade a la lista blanca si `status === 'active'` ✓.
- **Cambio de estado en caliente**: `updateSensorStatus` hace `authorizedSensors.add/delete` según el
  nuevo estado ✓ — es lo correcto, y era la parte fácil de romper (RAM vs Mongo).
- **Borrado**: `deleteSensor` quita del Set ✓.
- `app.js` añade `PATCH`/`DELETE` al CORS ✓ (coherente con las rutas nuevas).

### 2.2 Autorización ✅

- Ambas rutas nuevas llevan **`validateJwt`** ✓ y comprueban **`canManageSensor(sensor, req.uid, req.role)`** ✓
  (dueño o admin) **antes** de tocar nada ✓.
- `req.uid` **existe**: lo setea `validateJwt` (`payload.uid`) ✓ y los endpoints nuevos lo usan igual que
  los pre-existentes ✓.
- `buildAccessQuery(userId, role, { includeInactive })`: con `includeInactive` el filtro de estado se
  relaja **pero el `$or` por `userId`/`sharedWith` se mantiene** ✓ → **no hay fuga entre usuarios**
  (un usuario no ve los sensores de otro por pedir inactivos). Para `admin` devuelve `{}` ✓ (esperado).

### 2.3 El histórico **no** se pierde con desactivar ✅

`getSensorData` **no** filtra por `status` (solo `canAccessSensor`) ✓ → un sensor inactivo **sigue
entregando su histórico**, así que la calibración existente no se rompe. Lo que deja de entrar son
**datos nuevos** (el `mqttService` los rechaza al no estar en la lista blanca) → el artefacto calibrado
se **congela** y el control de frescura del **cambio 09** lo declara `stale` ✓. Coherente.

### 2.4 Frontend ✅

- `deviceSlice`: `fetchDevices` con `includeInactive` (justificado en comentario), `updateSensorStatus`
  y `deleteSensor` **refrescan** la lista tras actuar ✓; `registerDevice` también ✓ (mejor que el
  `push` a mano anterior).
- **Bug real arreglado de paso**: `error.response?.data?.msg` → **`.message`** ✓ (el backend responde
  `message`) → los errores ya se muestran en vez de caer al texto genérico.
- `DeviceList.jsx`: `StatusBadge` extraído ✓; menú de acciones con **confirmación inline** (no
  `window.confirm`) ✓; posicionamiento `fixed` calculado **escribiendo el DOM** y reposicionado en
  `scroll`(capture)/`resize` → **escapa al `overflow-hidden` de la tabla** ✓ (detalle fino); aviso local
  con timeout ✓; y `loading && devices.length === 0` **para no vaciar la tabla en los refetch** ✓.
- **No rompe consumidores**: verifiqué los usos de `registerDevice`/`addDevice` (`AddDeviceForm`,
  `useDevices`) → **ninguno consume el payload del thunk**, así que el cambio de forma
  (`response.data.sensor` → `response.data`) no rompe a nadie ✓.

---

## 3. Hallazgos

### 3.1 🟠 `includeInactive: true` está puesto en el **thunk compartido** → afecta a más pantallas que la de gestión

`fetchDevices` es el **mismo** thunk que usan:
- `diagram/hooks/useDiagram.js:42` → **el editor del diagrama** (nodos Sensor),
- `realtime/SensorSelector.jsx` y `server-driven/ServerDrivenDashboard.jsx`,
- y `devices/DeviceList.jsx` (la pantalla de gestión, que es la que lo necesita).

Y `diagram/SensorMappingPanel.jsx:13` lee `state.devices.devices` **directamente** → el panel de
sensores del diagrama ahora lista también los **inactivos/en mantenimiento**, **sin filtrar por estado**
(`SensorMappingPanel.jsx:31` filtra por tipo, no por estado).

**Consecuencia**: se puede enlazar en `sensor_mappings` un sensor que **no ingiere** (no está en la
lista blanca) → el bucle calibrar→predecir→optimizar queda con un sensor **mudo**. El sistema lo
degrada con honestidad (histórico congelado + `stale` del 09), **pero el panel no advierte que ese
sensor no va a recibir datos** — y la cadena de confianza del **cambio 12** existe justo para no dejar
al usuario adivinando.

**Attenuante**: `SensorSelector.jsx:39` **sí** pinta el estado con un badge ✓ (existe la señal en el
selector, no en el panel del diagrama).

**Fix sugerido** (pequeño): que el parámetro viaje **por llamada** —
`fetchDevices({ includeInactive })` con default `false`, y que **solo** la pantalla de gestión pase
`true`; o filtrar `status === 'active'` en `SensorMappingPanel` y en el diagrama. Y, opcionalmente, un
aviso en el panel del tipo *"este sensor está inactivo: no recibirá datos nuevos"*.

### 3.2 🟠 El borrado es **destructivo e irreversible**, y no avisa a quien lo referencia

`deleteSensor` (`controllers/Front.js`) hace tres cosas sin retorno:
1. `deleteOne` del documento ✓ (esperado),
2. `authorizedSensors.delete` ✓,
3. **`mongoose.connection.db.dropCollection(String(id))`** → **borra toda la colección de lecturas**
   (el histórico completo del sensor).

Y **no comprueba ni avisa** si ese sensor está **referenciado** en los `sensor_mappings` del diagrama
(Redis) que alimentan el **bucle MPC**. Tras borrarlo queda un mapping **huérfano** y el histórico que
alimentaba la **calibración** se pierde sin traza — justo lo contrario de la regla del proyecto
(*"los artefactos no se borran: se archivan"*) y de la lógica del **cambio 12** (declarar por qué algo
no se puede simular, en vez de dejar al usuario adivinando).

**Fix sugerido**: (a) **archivar** en vez de `dropCollection` (renombrar a `_deleted_<id>` o marcar
`deletedAt`), o al menos confirmarlo en la UI diciendo **cuántas lecturas** se van a borrar; y (b)
**detectar referencias** antes de borrar (mappings del diagrama / sensores usados por la optimización)
y **declararlo** en la respuesta y en la UI.

### 3.3 🟡 `canManageSensor` es fail-open en un caso límite (pre-existente)

```js
return toIdString(sensor.userId) === toIdString(userId);
```
`toIdString(null|undefined)` → `null`, así que si el sensor **no** tuviera `userId` y el token tampoco
lo trajera, la comparación sería `null === null` → **`true`** (cualquiera podría gestionarlo). La
función **no cambió en este commit**, pero ahora **gobierna un borrado**: vale el endurecimiento
trivial — `if (!sensor.userId) return false;`.

### 3.4 🟡 Sin red de seguridad automatizada

El repo **no tiene suite JS** (`Frontend/GestionFront/package.json` sin `test`/`vitest`/`jest`; los
tests existentes son Python, en `optimization/tests/`). Este PR estrena **dos rutas destructivas** sin
prueba automática. No se exige montar un runner, pero sí conviene **declararlo** y, si se puede, cubrir
lo barato y de mayor riesgo: **403 para no-dueño** y **200 para dueño** en `PATCH /sensors/:id/status`
y `DELETE /sensors/:id`.

> **Estado posterior**: se añadió `Backend/tests/sensores_autorizacion.test.js` con el runner nativo
> `node --test` (auditado por lectura en `AUDITORIA_16.md` §5.bis). **Nota de entorno**: esta copia del
> repo es **solo de revisión** — no está instalada (sin `node_modules`, sin Mongo), así que la
> ejecución de esos tests corresponde al implementador y su salida debe quedar versionada como
> artefacto; aquí no se pueden correr, y eso no dice nada sobre el test.

### 3.5 🟡 Detalles a declarar

- `getAllAuthorizedDevices` fuerza `includeInactive` cuando `ownerView` → el **dueño/admin ve siempre
  los inactivos** ✓ (coherente con la gestión), pero conviene dejarlo escrito.
- Los endpoints nuevos **no tocan Redis** (`sensor_mappings`) ni la caché del diagrama → ver 3.2.

---

## 4. Relación con la cola 01–16

- **No toca**: `optimization/` (solver, calibración, banda), `topology_schema`, el unifilar, `AGENTS.md`
  ni los `reference/` → **los cambios 12–16 quedan intactos** ✓.
- **Cruza** con la **cadena de confianza (12)** por el punto **3.1** (sensores inactivos enlazables en
  el diagrama) y con el **ciclo de calibración (09)** por el punto **3.2** (se puede borrar el
  histórico que una calibración necesita).
- **Sugerencia de proceso**: si este PR se va a mantener en `main` junto a la cola, conviene una fila
  propia en el índice (`integracion_plataforma/README.md`) o una nota — hoy el estado oficial del
  proyecto no lo menciona, y un tercero que lea el índice no sabría que los sensores ya se gestionan
  desde la UI.
