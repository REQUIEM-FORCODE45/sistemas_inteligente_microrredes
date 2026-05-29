# Frontend component reference

Esta guía técnica concentra por carpeta qué hace cada componente/gancho de la capa frontend de `GestionFront`. El enfoque está en el flujo de sensores, la autenticación y la vista principal, incluyendo los endpoints de `GridAPI` y los slices de Redux que alimentan las pantallas. Cada bloque menciona funciones clave, peticiones HTTP o eventos de sockets que usa el componente.

## Entrypoint y enrutamiento

- **`src/main.jsx`**: arranca la aplicación con `<StrictMode>` y monta `GestionApp` sobre el `root` del DOM.
- **`src/GestionApp.jsx`**: proveedor global que combina `Provider` (Redux store configurado en `Authentication/store/store.js`) y `BrowserRouter`. Crea la capa común para que los hooks de `useSelector` y `useDispatch` lean `auth`, `devices` o `ui`.
- **`src/router/AppRouter.jsx`**: decide si se renderiza `App` (dashboard) o `AuthPage` según el estado `state.auth.user`. También protege la ruta `/auth` con `Navigate` para evitar acceder al login cuando ya hay sesión.
- **`src/router/app.routes.jsx`** (no usado directo actualmente): define el mismo par de rutas (`/` → `App`, `/auth` → `AuthPage`) pero con `createBrowserRouter`, lo cual puede reutilizarse si se adopta el router basado en objetos.

## APIs comunes y hooks globales

- **`src/api/grid-api.js`**: instancia `axios` apuntando a `VITE_API_URL`. El interceptor inyecta `x-token` con `localStorage.getItem('sensor_token')`, por lo que cualquier servicio que use este cliente recibe el JWT automáticamente (login, registro, sensores, usuarios).
- **`Hooks/UseAuthSystem.js`**: hook que provee `currentUser`, `msg`, `login`, `register`, `logout`, `setMsg`. Usa `GridAPI` para `POST /auth` y `POST /auth/new`, despacha `setUser`, `setMsg` y `setLoading`, y guarda el usuario y token en `localStorage` (`sensor_user`, `sensor_token`). Los errores se muestran mediante `msg`.
- **`Hooks/usePermissions.js`**: toma `state.auth.user.role` y devuelve permisos predefinidos (`canManageUsers`, `canViewAllSensors`, etc.), `hasPermission(permission)` y banderas `isAdmin`, `isOperator`. `App` lo usa para condicionar pestañas (ej. sólo admins ven `users`).
- **`Hooks/getIntials.js`**: genera iniciales con dos letras para mostrar en el avatar del header (`{getInitials(user.fullName)}`).
- **`Hooks/useDevices.js`**: expone `devices`, `loading`, `error`, `successMsg`, `addDevice`, `clearMsgs`. Despacha los thunks `fetchDevices` y `registerDevice` del slice de sensores (`Dashboard/store/device/deviceSlice.js`) y refresca la lista al montar con `useEffect`.
- **`src/Dashboard/components/realtime/hooks/useChartOptions.js`**: define `CHART_MODES` (combinado o separado) y helpers (`toggleSeparatedKey`, `selectAllSeparated`, `clearSeparated`). Aunque `RealtimeView` maneja su propio estado de chart, el hook está preparado para extraer la lógica si se reutiliza.

## Autenticación

- **`src/Authentication/pages/AuthPage.jsx`**: pantalla que alterna entre login y registro usando `useForm` y los métodos de `useAuthSystem`. Controla la vista (`login` o `register`), el estado `showPassword`, el mensaje (`msg`) y renderiza `AuthView`. Si el usuario ya está logueado, muestra `Sidebar` y un mensaje de bienvenida.
- **`src/Authentication/components/layout/Sidebar.jsx`**: barra lateral que ilustra la marca, el usuario actual y el botón de logout (`onLogout`). También muestra el avatar (primera letra del nombre en mayúsculas) y un botón “Mi Panel”.
- **`src/Authentication/components/views/AuthView.jsx`**: contenedor visual del formulario. Recibe `isLogin`, `onSubmit`, `showPassword`, `onTogglePassword`, `msg`, `register`, `errors`. Muestra alertas con iconos (`AlertCircle`/`CheckCircle2`), alterna el texto del botón y el enlace para cambiar de vista.
- **`src/Authentication/components/ui/AuthInput.jsx`**: wrapper para inputs con `register` de `react-hook-form`, validaciones, estilos de error y un botón para mostrar/ocultar contraseña (`Eye`/`EyeOff`). Se usa para campos de nombre, usuario y contraseña dentro de `AuthView`.

## Redux y slices relevantes

- **`src/Authentication/store/store.js`**: combina los reducers `auth`, `ui` y `devices` (el slice de sensores que luego usa `useDevices`). Desactiva `serializableCheck` porque algunos payloads (como sockets) no son serializables.
- **`src/Authentication/store/auth/authSlice.js`**: mantiene `user`, `token`, `loading` y `msg`. La acción `logout` elimina `sensor_user` y `sensor_token` del `localStorage`.
- **`src/Dashboard/store/device/deviceSlice.js`**: define `fetchDevices` (`GET /front/sensors`) y `registerDevice` (`POST /front/register_sensor`). El estado guarda `devices`, `loading`, `error`, `successMsg` y una acción `clearMessages`. Además de actualizar la lista tras registrar, mantiene mensajes de éxito/error visibles en `AddDeviceForm`.

## Dashboard principal (`src/Dashboard/pages/App.jsx`)

- Define botones personalizados (`Button`, `Badge`, `SidebarItem`) con clases Tailwind para controles del layout.
- Controla el colapsado del sidebar, el drawer móvil y el `activeTab` que determina la sección mostrada.
- Lee el usuario (`state.auth.user`) y las `permissions` del hook para mostrar la pestaña `users` sólo si `canManageUsers`.
- Secciones renderizadas por pestaña:
  - *Default*: tarjetas estáticas con métricas dummy y una call-to-action para seleccionar sensores.
  - *devices*: incluye `AddDeviceForm` y `DeviceList` para registrar/visualizar sensores.
  - *realtime*: monta `RealtimeView` para seleccionar sensores, escuchar sockets y graficar señales.
  - *server-driven*: renderiza `ServerDrivenDashboard` con el usuario actual.
  - *users*: muestra `UserManagment` (solo para admins/operators según permisos). 
- El botón de logout despacha la acción `logout` del slice de auth.

## Gestión de dispositivos / sensores

- **`Dashboard/components/devices/AddDeviceForm.jsx`**: formulario controlado (nombre, tipo, estado) que llama a `addDevice` de `useDevices`. Muestra errores o mensajes de éxito en un alert que se limpia con `clearMsgs`.
- **`Dashboard/components/devices/DeviceList.jsx`**: tabla con columnas `Nombre`, `Tipo`, `Topic (ID)` e `Estado`. Usa `CopyButton` (estado local `copied`) para copiar `_id` al portapapeles, y colorea el badge según `device.status`.
- **`Hooks/useDevices.js`**: despacha `fetchDevices` al montar, expone `devices`, `addDevice`, `clearMsgs` y los flags de carga/errores.

## Monitoreo en tiempo real (sensores)

- **`Dashboard/components/realtime/RealtimeView.jsx`**:
  - Abre `socket.io` contra `VITE_SOCKET_URL` y escucha `sensor_update`.
  - Cuando un sensor se selecciona (`handleToggleSensor`), emite `join_sensor_room`, descarga historial (limite `HISTORICAL_LIMIT`) con `GET /front/sensors_data/{id}/{limit}`, normaliza los campos (quita `_id`, `createAt`, etc.) y lo almacena en `sensors[id]` con `dataKeys` y `activeKeys`.
  - Mantiene `selectedIds`, `sensors`, `chartOptions`, `collapsedSensors`, `mobileMenuOpen`, `activeSensorMobile`.
  - `sensor_update` actualiza sólo si el sensor está seleccionado, agrega un nuevo punto con las claves filtradas y trunca a `MAX_POINTS`.
  - Provee callbacks para alternar variables (`handleToggleKey`), seleccionar modo de gráfico (`handleSetChartMode`), seleccionar/deseleccionar claves en modo separado y colapsar paneles.
  - Renderiza `SensorSelector`, un mensaje de “seleccione sensores” si no hay ninguno, y por cada sensor seleccionado muestra `SensorPanel` + `RealtimeChart` o `SingleLineChart` según el modo.

- **`Dashboard/components/realtime/SensorSelector.jsx`**: lista de botones construidos con `devices` (via `useDevices`). Cada botón pasa el `_id` a `RealtimeView` y muestra un badge de estado. Usa `<Badge>` para mostrar `active`/`maintenance`.

- **`Dashboard/components/realtime/components/SensorPanel.jsx`**:
  - Muestra cards por variable (`KEY_LABELS`) con lectura actual (`lastPoint`) y colores. Las cards son clicables para activar/desactivar variables en modo combinado y cambian opacity/greyscale para indicar el estado.
  - Tiene botones para cambiar entre `CHART_MODES.COMBINED` y `.SEPARATED`, y al estar en `separated` muestra botones de “Todas” y “Ninguna”.
  - Versión móvil con menú emergente que lista todas las variables.
  - El prop `onToggleKey` dispara `handleToggleKey` de `RealtimeView` (o `handleToggleSeparatedKey` en modos separados).

- **`Dashboard/components/realtime/components/ChartOptions.jsx`**: componente adicional que encapsula la lógica de modo combinado/separado, selección masiva y toggles. No se monta en `RealtimeView`, pero está estructurado igual para poder ser reutilizado si se reestructura la UI.

- **`Dashboard/components/realtime/components/SingleLineChart.jsx`** y **`RealtimeChart.jsx`**:
  - Ambos usan `Plotly` (`plotly.js-dist-min`) y `ResizeObserver` para ajustar dimensiones.
  - `RealtimeChart` dibuja múltiples `traces` con tamaño adaptativo y leyenda horizontal, marca el sensor en el header y muestra un badge “En vivo”.
  - `SingleLineChart` se usa cuando `chartMode` es `separated`: renderiza un `trace` por variable, rellena hasta cero (`fill: 'tozeroy'`) y ajusta títulos según móvil.

- **`Dashboard/components/realtime/SensorStatsCards.jsx`**: versión alternativa (no montada actualmente) de panel de variables que muestra cards de estado y menú móvil. Mantiene la misma lógica de `KEY_LABELS` y `activeKeys` que `SensorPanel`.

- **`Dashboard/components/realtime/hooks/useChartOptions.js`**: definiciones de modos y helpers (ya mencionado) que podrían fusionarse con `RealtimeView` para evitar duplicar el control de `chartMode`.

## Server-driven dashboard

- **`src/Dashboard/components/server-driven/ServerDrivenDashboard.jsx`**:
  - Usa `socket.io-client` y `partial-json-parser` para generar dashboards a partir de especificaciones JSON streaming.
  - Se conecta a `VITE_SOCKET_URL`, escucha eventos: `dashboard_spec_started`, `dashboard_spec_chunk`, `dashboard_spec_complete`, `dashboard_spec_error` (emitidos por `Backend/app.js` a su vez), y maneja estados `status`, `connected`, `chunkCount`, `spec`, `error`.
  - Cada chunk se acumula en `bufferRef`. Cuando `dashboard_spec_complete` llega intenta parsear con `partialParse` y, si falla, con `JSON.parse`. Los widgets resultantes se guardan en `spec.widgets`.
  - Tiene un textarea donde el usuario escribe el prompt, un botón que emite `request_dashboard_spec` con `prompt`, `userId` y `context` (rol + nombre) y un indicador del estado (`statusLabels`).
  - Renderiza los widgets dinámicamente usando `componentRegistry` para tipos `metric_card`, `table`, `line_chart` o `bar_chart`. Cada widget se envuelve en `Card`/`CardHeader/Content` y Plotly se usa dentro de `ChartWidget`.
  - También muestra un `pre` con el JSON parcial reconstruido para debugging.
  - A partir de ahora importa `useDevices` para conocer los sensores autorizados, se une a cada sala de sensor (`join_sensor_room`) y escucha el evento `sensor_update` que refleja los datos reales en vivo.
  - El prompt inicial incluye la instrucción base y se enriquece automáticamente con el sensor principal (`devices[0].name`) para que el agente genere métricas vinculadas a un sensor real.
  - Tan pronto se detecta un listado de sensores y la conexión está viva, el dashboard solicita automáticamente una especificación (sin tocar el botón) para evitar depender de datos simulados previos.
  - El renderizado inyecta `liveBuffers` en cada widget; `ChartWidget` combina `widget.data` con los puntos en vivo del sensor indicado en `widget.liveSource`, limita el histórico mediante `liveWindow` y muestra un badge “Vivo” cuando hay fuente en streaming.
  - En backend `services/dashboardAgent.js` ahora consume `services/sensorDataService.js` para agregar contextos con los últimos snapshots y extender los `line_chart`/`bar_chart` con `liveSource` + `liveWindow`, de forma que el frontend pueda enlazar cada gráfico con sensores reales.

## Gestión de usuarios

- **`src/Dashboard/components/users/UserManagment.jsx`**: panel maestro que consume `useUserManagement`. Renderiza `UserStats`, `UserToolbar`, `UserTable` y los modales `UserModal` / `DeleteModal`. También muestra `Toast` mientras exista `toast` en el hook.
- **`src/Dashboard/components/users/hooks/useUserManagement.js`**:
  - Carga `GET /auth/users` con `GridAPI`, transforma cada usuario (`role`, `active`, `createdAt` formateada) y lo mantiene en `users`.
  - Guarda `search`, `filterRole`, `modalUser`, `deleteUser`, `toast` y `filtered` (search + filter).
  - `handleSave` hace `POST /auth/new` o `PUT /auth/users/:id` dependiendo de si `data.id` existe y refresca la lista.
  - `handleDelete` hace `DELETE /auth/users/:id` y elimina el usuario localmente.
  - `showToast` dispara el componente `Toast` con animación.

- **`src/Dashboard/components/users/components/UserStats.jsx`**: tarjetas que resumen `total users`, `usuarios activos` y `admins`, usando iconos `lucide-react` y estilos de background.
- **`src/Dashboard/components/users/components/UserToolbar.jsx`**: barra superior con campo de búsqueda (`Search`), select por rol (usa `ROLES`), y botón `Nuevo usuario` con icono `Plus`. Llama a `setSearch`, `setFilterRole` y `setModalUser`.
- **`src/Dashboard/components/users/constants/roles.js`**: define meta información por rol (`label`, clases `badgeClass`, `permissions`). `RoleBadge` usa este archivo para colorear badges y el hook `usePermissions` se basa en valores como `canManageUsers`.
- **`src/Dashboard/components/users/constants/sensors.js`**: lista de sensores ficticios usada por `UserTable` para mostrar barras de acceso a sensores (el ratio de `sensorAccess` se calcula en función de `SENSORS.length`). También exporta `SENSOR_GROUPS`.
- **`src/Dashboard/components/users/components/UserTable.jsx`**:
  - Muestra una tabla con columnas: usuario, rol (`RoleBadge`), sensores (barra de progreso), fecha de creación, estado (activo/inactivo) y acciones (editar/eliminar).
  - Usa `getInitials` local para generar avatars y `SENSORS` para mostrar el ratio de acceso.
  - `onEdit` / `onDelete` llaman a los callbacks de `useUserManagement`.
- **`src/Dashboard/components/users/components/DeleteModal.jsx`**: modal de confirmación con icono `AlertTriangle`. Recibe `user`, `onConfirm`, `onClose`.
- **`src/Dashboard/components/users/components/UserModal.jsx`**:
  - Formulario completo de creación/edición: campos para nombre, email, rol, estado, contraseña (con toggle `showPass`), y acceso a sensores.
  - Valida email/contraseña y cifra la contraseña con `sha256` (de `utils/helpers`) antes de enviar `passwordHash`.
  - Botón “Todos/Ninguno” para seleccionar sensores usando los grupos (`SENSOR_GROUPS`). Cada botón de sensor muestra icono y `Check` si está seleccionado.
- **`src/Dashboard/components/users/components/atoms/Field.jsx`**, **`Toggle.jsx`**, **`RoleBadge.jsx`**, **`Toast.jsx`**: componentes reutilizables (label + error, switch on/off, badge por rol, notificación flotante con animación `slideIn`) que alivian el layout de los modales y la tabla.
- **`src/Dashboard/components/users/utils/helpers.js`**: expone `sha256` (Web Crypto), `getInitials` y `inputClass` para inputs con/without errores.

## Primitivas UI compartidas

- **`src/components/ui/card.jsx`**: composición de `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription` e `CardAction` con clases base y `cn` de `@/lib/utils`. Usado por casi todos los widgets del dashboard.
- **`src/components/ui/badge.jsx`** y **`src/components/ui/button.jsx`**: variantes (`cva`) de badges/botones para mantener consistencia en colores, sombras y estados (`hover`, deshabilitado, iconos).
- **`src/components/ui/separator.jsx`**: wrapper simple de `Radix Separator` para dividir contenidos.
- **`src/Dashboard/components/ui/button.jsx`**: botón alternativo dentro del dashboard principal (usado en `App.jsx`). También usa `cva` y `cn`.
- **`src/Dashboard/components/ui/scroll-area.jsx`**, **`sheet.jsx`**, **`tooltip.jsx`**: wrappers de componentes Radix (`ScrollArea`, `Dialog`, `Tooltip`) con estilos personalizados (scrollbar, overlay, animaciones) listos para usar dentro de modales o estructuras que requieran overlays y tooltips.

## Notas adicionales

- La lógica de sensores gira alrededor de la combinación `useDevices` + `RealtimeView`. `RealtimeView` se suscribe y se da de baja de sockets, selecciona sensores únicos y siempre normaliza el payload para que solo se graficen claves numéricas.
- `ServerDrivenDashboard` consume el socket que el backend alimenta mediante LangChain/`generateDashboardSpec`, por lo que el frontend solo renderiza widgets a partir del JSON streaming sin conocer la lógica interna del agente.
- `UserManagement` usa `GridAPI` para CRUD completo de usuarios; `UserModal` cifra la contraseña con SHA-256 antes de enviar y `useUserManagement` actualiza la lista tras cada operación.

***

Mantener este archivo actualizado evita tener que reanalizar este conjunto de sensores y componentes cuando llegue un nuevo desarrollador. Si se añade un componente adicional dentro de `src/Dashboard/components` o un nuevo endpoint de sensores, añadir una entrada en la sección correspondiente.
