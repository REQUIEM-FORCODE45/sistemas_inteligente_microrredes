/**
 * UserManagement.jsx
 * ─────────────────────────────────────────────────────────────
 * Componente principal de gestión de usuarios para SolarGrid.
 *
 * Estructura modular con componentes reutilizables para facilitar
 * la integración con backend.
 *
 * Props:
 *   (ninguna — maneja su propio estado interno mediante hook)
 *
 * Uso:
 *   import UserManagement from './UserManagement';
 *   <UserManagement />
 * ─────────────────────────────────────────────────────────────
 */

import React from 'react';
import { useUserManagement } from './hooks/useUserManagement';
import UserStats from './components/UserStats';
import UserToolbar from './components/UserToolbar';
import UserTable from './components/UserTable';
import UserModal from './components/UserModal';
import DeleteModal from './components/DeleteModal';
import Toast from './components/atoms/Toast';

/**
 * UserManagement
 * Panel completo de gestión de usuarios: tabla, búsqueda,
 * filtros, formulario de registro/edición y eliminación.
 *
 * Estructura modular con componentes independientes:
 * - UserStats: Tarjetas de estadísticas
 * - UserToolbar: Búsqueda y filtros
 * - UserTable: Tabla de usuarios
 * - UserModal: Modal de crear/editar
 * - DeleteModal: Modal de confirmación
 * - Toast: Notificaciones
 */
const UserManagement = () => {
  const {
    users,
    search,
    filterRole,
    modalUser,
    deleteUser,
    toast,
    filtered,
    setSearch,
    setFilterRole,
    setModalUser,
    setDeleteUser,
    handleSave,
    handleDelete,
  } = useUserManagement();

  return (
    <div className="space-y-5">
      {/* ── Toast de notificación ── */}
      {toast && <Toast message={toast.msg} type={toast.type} />}

      {/* ── Tarjetas de estadísticas ── */}
      <UserStats users={users} />

      {/* ── Barra de herramientas ── */}
      <UserToolbar
        search={search}
        onSearchChange={setSearch}
        filterRole={filterRole}
        onFilterChange={setFilterRole}
        onNewUser={() => setModalUser({})}
      />

      {/* ── Tabla de usuarios ── */}
      <UserTable
        users={filtered}
        onEdit={setModalUser}
        onDelete={setDeleteUser}
      />

      {/* ── Modales ── */}
      {modalUser !== null && (
        <UserModal
          user={Object.keys(modalUser).length ? modalUser : null}
          onSave={handleSave}
          onClose={() => setModalUser(null)}
        />
      )}
      {deleteUser && (
        <DeleteModal
          user={deleteUser}
          onConfirm={handleDelete}
          onClose={() => setDeleteUser(null)}
        />
      )}
    </div>
  );
};

export default UserManagement;