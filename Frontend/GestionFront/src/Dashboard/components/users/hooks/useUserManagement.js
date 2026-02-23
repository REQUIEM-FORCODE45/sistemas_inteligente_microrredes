import { useState } from 'react';
import { INITIAL_USERS } from '../constants/initialData';

/**
 * Hook personalizado para gestionar la lógica de usuarios.
 * Maneja estado, CRUD y notificaciones.
 */
export const useUserManagement = () => {
    const [users, setUsers] = useState(INITIAL_USERS);
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [modalUser, setModalUser] = useState(null); // null=cerrado | {}=nuevo | user=editar
    const [deleteUser, setDeleteUser] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Toast ──────────────────────────────────────────────────

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // ── CRUD ───────────────────────────────────────────────────

    const handleSave = (data) => {
        if (data.id) {
            // Actualizar usuario existente
            setUsers(prev => prev.map(u => (u.id === data.id ? { ...u, ...data } : u)));
            showToast('Usuario actualizado correctamente');
        } else {
            // Crear nuevo usuario
            const newUser = {
                ...data,
                id: Date.now().toString(),
                createdAt: new Date().toISOString().split('T')[0],
            };
            setUsers(prev => [...prev, newUser]);
            showToast('Usuario creado correctamente');
        }
        setModalUser(null);
    };

    const handleDelete = () => {
        setUsers(prev => prev.filter(u => u.id !== deleteUser.id));
        showToast('Usuario eliminado', 'error');
        setDeleteUser(null);
    };

    // ── Filtrado ───────────────────────────────────────────────

    const filtered = users.filter(u => {
        const q = search.toLowerCase();
        const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        const matchRole = filterRole === 'all' || u.role === filterRole;
        return matchSearch && matchRole;
    });

    return {
        // Estado
        users,
        search,
        filterRole,
        modalUser,
        deleteUser,
        toast,
        filtered,

        // Setters
        setSearch,
        setFilterRole,
        setModalUser,
        setDeleteUser,

        // Acciones
        handleSave,
        handleDelete,
        showToast,
    };
};
