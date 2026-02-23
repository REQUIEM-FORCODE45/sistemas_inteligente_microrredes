export const ROLES = {
    superadmin: {
        label: 'Super Admin',
        badgeClass: 'bg-red-50 text-red-600 border-red-200',
        dotClass: 'bg-red-500',
        permissions: ['read', 'write', 'delete', 'manage_users', 'all_sensors'],
    },
    admin: {
        label: 'Administrador',
        badgeClass: 'bg-orange-50 text-orange-600 border-orange-200',
        dotClass: 'bg-orange-500',
        permissions: ['read', 'write', 'manage_users'],
    },
    operador: {
        label: 'Operador',
        badgeClass: 'bg-blue-50 text-blue-600 border-blue-200',
        dotClass: 'bg-blue-500',
        permissions: ['read', 'write'],
    },
    visor: {
        label: 'Visor',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
        permissions: ['read'],
    },
};
