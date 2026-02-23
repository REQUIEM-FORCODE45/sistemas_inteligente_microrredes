# Módulo de Gestión de Usuarios

Componente modular de gestión de usuarios para SolarGrid con una arquitectura escalable y lista para integración con backend.

## 📁 Estructura del Proyecto

```
src/components/users/
├── UserManagment.jsx                 # Componente principal (orquestador)
├── index.js                          # Exportaciones centralizadas
├── constants/                        # Configuraciones estáticas
│   ├── roles.js                      # Definición de roles y permisos
│   ├── sensors.js                    # Listado de sensores
│   └── initialData.js                # Datos de ejemplo iniciales
├── utils/                            # Funciones auxiliares
│   └── helpers.js                    # Utilidades (sha256, getInitials, etc)
├── hooks/                            # Custom React Hooks
│   └── useUserManagement.js          # Hook de gestión de estado
└── components/                       # Componentes React
    ├── UserStats.jsx                 # Tarjetas de estadísticas
    ├── UserToolbar.jsx               # Barra de búsqueda y filtros
    ├── UserTable.jsx                 # Tabla de usuarios
    ├── UserModal.jsx                 # Modal crear/editar usuario
    ├── DeleteModal.jsx               # Modal confirmación eliminación
    └── atoms/                        # Componentes atómicos reutilizables
        ├── RoleBadge.jsx             # Badge de rol coloreado
        ├── Toggle.jsx                # Switch on/off
        ├── Field.jsx                 # Campo formulario con validación
        └── Toast.jsx                 # Notificación tipo toast
```

## 🚀 Características

- ✅ **Modular**: Cada componente es independiente y reutilizable
- ✅ **Hook personalizado**: `useUserManagement` maneja toda la lógica de estado
- ✅ **Constantes centralizadas**: Fácil de actualizar roles, sensores, etc
- ✅ **Validación integrada**: Validación de formularios con mensajes de error
- ✅ **Seguridad**: Contraseñas cifradas con SHA-256
- ✅ **Responsive**: Diseño adaptado para móviles, tablets y desktop
- ✅ **Listo para backend**: Fácil integración con API REST

## 📦 Cómo Usar

### Importación Simple
```jsx
import UserManagement from '@/components/users';
// o
import { UserManagement } from '@/components/users';

export default function App() {
  return <UserManagement />;
}
```

### Importación de Componentes Específicos
```jsx
import { UserTable, UserModal, useUserManagement } from '@/components/users';

// Ahora puedes usar componentes individuales con tu propia lógica
```

## 🔌 Integración con Backend

### 1. Reemplazar hook `useUserManagement`

Actualmente el hook usa estado local. Para conectar con backend:

```js
// hooks/useUserManagement.js
export const useUserManagement = () => {
  const [users, setUsers] = useState([]);
  
  // Cargar usuarios del API
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const response = await fetch('/api/users');
    const data = await response.json();
    setUsers(data);
  };

  const handleSave = async (data) => {
    const endpoint = data.id 
      ? `/api/users/${data.id}` 
      : '/api/users';
    
    const method = data.id ? 'PUT' : 'POST';
    
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    // Actualizar estado local
    const result = await response.json();
    // ...
  };

  // ... resto de la lógica
};
```

### 2. Actualizar constantes

Reemplaza los datos hardcodeados en `constants/initialData.js`:

```js
// Obtener datos reales del backend
export const INITIAL_USERS = []; // Comenzar vacío

// El hook se encargará de cargar los datos
```

### 3. Endpoints esperados

El código está preparado para estos endpoints:

- `GET /api/users` - Obtener todos los usuarios
- `POST /api/users` - Crear nuevo usuario
- `PUT /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario

## 🎨 Componentes Detallados

### UserManagement (Principal)
Orquestador que usa el hook y renderiza todos los sub-componentes.

```jsx
<UserManagement /> // Listo para usar, sin props necesarias
```

### UserStats
Muestra tarjetas con estadísticas de usuarios.

```jsx
<UserStats users={usersArray} />
```

**Props:**
- `users` (Array): Array de usuarios

### UserToolbar
Barra con búsqueda y filtros.

```jsx
<UserToolbar
  search={searchValue}
  onSearchChange={(value) => setSearch(value)}
  filterRole={roleFilter}
  onFilterChange={(role) => setFilterRole(role)}
  onNewUser={() => openModal()}
/>
```

**Props:**
- `search` (String): Valor de búsqueda actual
- `onSearchChange` (Function): Callback para cambiar búsqueda
- `filterRole` (String): Rol filtrado ('all' o id de rol)
- `onFilterChange` (Function): Callback para cambiar filtro
- `onNewUser` (Function): Callback para crear usuario

### UserTable
Tabla de usuarios con acciones.

```jsx
<UserTable
  users={filteredUsersArray}
  onEdit={(user) => setModalUser(user)}
  onDelete={(user) => setDeleteUser(user)}
/>
```

**Props:**
- `users` (Array): Usuarios a mostrar
- `onEdit` (Function): Callback para editar usuario
- `onDelete` (Function): Callback para eliminar usuario

### UserModal
Modal para crear/editar usuarios.

```jsx
<UserModal
  user={userToEdit} // null para crear nuevo
  onSave={(data) => saveUser(data)}
  onClose={() => closeModal()}
/>
```

**Props:**
- `user` (Object|null): Usuario a editar o null para crear
- `onSave` (Function): Callback con datos del usuario
- `onClose` (Function): Callback para cerrar

### DeleteModal
Confirmación de eliminación.

```jsx
<DeleteModal
  user={userToDelete}
  onConfirm={() => deleteUser()}
  onClose={() => closeDelete()}
/>
```

**Props:**
- `user` (Object): Usuario a eliminar
- `onConfirm` (Function): Callback de confirmación
- `onClose` (Function): Callback para cancelar

## 🧬 Componentes Atómicos

### RoleBadge
Badge coloreado según rol.

```jsx
<RoleBadge role="admin" />
```

### Toggle
Switch on/off.

```jsx
<Toggle 
  checked={isActive} 
  onChange={(newValue) => setActive(newValue)} 
/>
```

### Field
Campo de formulario con validación.

```jsx
<Field 
  label="Nombre" 
  error={errors.name}
>
  <input value={name} onChange={(e) => setName(e.target.value)} />
</Field>
```

### Toast
Notificación.

```jsx
<Toast message="Usuario creado" type="success" />
<Toast message="Error al guardar" type="error" />
```

## 🔐 Seguridad

- **Contraseñas**: Se cifran con SHA-256 en el cliente (cambiar a método seguro en producción)
- **Validación**: Todos los campos se validan antes de enviar
- **HTTPS**: Usar siempre en producción
- **CORS**: Configurar CORS en backend

## 🎯 Próximos Pasos

1. **Conectar a backend**: Reemplazar `useUserManagement` con llamadas a API
2. **Autenticación**: Agregar tokens JWT/Bearer
3. **Validación mejorada**: Validar en backend también
4. **Paginación**: Agregar paginación para muchos usuarios
5. **Filtros avanzados**: Más opciones de filtrado
6. **Exportación**: Exportar datos a CSV/Excel
7. **Bulk actions**: Acciones en lote

## 📝 Licencia

Parte del proyecto SolarGrid - Sistemas Inteligentes de Microrredes
