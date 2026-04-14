import { useState, useEffect, useCallback } from 'react';
import GridAPI from '../../../../api/grid-api';

/**
 * Hook personalizado para gestionar la lógica de usuarios.
 * Obtiene usuarios del backend.
 */
export const useUserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [modalUser, setModalUser] = useState(null);
    const [deleteUser, setDeleteUser] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchUsers = useCallback(async () => {
        try {
            const response = await GridAPI.get('/auth/users');
            if (response.data.ok) {
                setUsers(response.data.data.map(u => ({
                    id: u._id,
                    name: u.name,
                    email: u.email,
                    role: u.role || 'user',
                    active: u.active !== false,
                    createdAt: u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                })));
            }
        } catch (error) {
            console.error('Error fetching users:', error);
            showToast('Error al cargar usuarios', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSave = async (data) => {
        try {
            if (data.id) {
                await GridAPI.put(`/auth/users/${data.id}`, {
                    name: data.name,
                    email: data.email,
                    role: data.role,
                    active: data.active,
                });
                showToast('Usuario actualizado correctamente');
            } else {
                await GridAPI.post('/auth/new', {
                    name: data.name,
                    email: data.email,
                    password: data.password,
                    role: data.role,
                });
                showToast('Usuario creado correctamente');
            }
            fetchUsers();
            setModalUser(null);
        } catch (error) {
            showToast(error.response?.data?.msg || 'Error al guardar usuario', 'error');
        }
    };

    const handleDelete = async () => {
        try {
            await GridAPI.delete(`/auth/users/${deleteUser.id}`);
            setUsers(prev => prev.filter(u => u.id !== deleteUser.id));
            showToast('Usuario eliminado', 'error');
            setDeleteUser(null);
        } catch (error) {
            showToast('Error al eliminar usuario', 'error');
        }
    };

    const filtered = users.filter(u => {
        const q = search.toLowerCase();
        const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        const matchRole = filterRole === 'all' || u.role === filterRole;
        return matchSearch && matchRole;
    });

    return {
        users,
        loading,
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
        showToast,
        refreshUsers: fetchUsers,
    };
};