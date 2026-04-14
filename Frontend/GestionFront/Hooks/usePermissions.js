import { useSelector } from 'react-redux';

const PERMISSIONS = {
    admin: {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canManageUsers: true,
        canViewAllSensors: true,
    },
    operator: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canManageUsers: false,
        canViewAllSensors: false,
    },
    user: {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canManageUsers: false,
        canViewAllSensors: false,
    },
};

export const usePermissions = () => {
    const { user } = useSelector(state => state.auth);
    const role = user?.role || 'user';
    const permissions = PERMISSIONS[role] || PERMISSIONS.user;

    const hasPermission = (permission) => permissions[permission] === true;
    const isAdmin = role === 'admin';
    const isOperator = role === 'operator';

    return {
        ...permissions,
        role,
        hasPermission,
        isAdmin,
        isOperator,
    };
};