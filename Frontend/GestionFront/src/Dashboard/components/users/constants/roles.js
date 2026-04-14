export const ROLES = {
    admin: {
        label: 'Administrador',
        badgeClass: 'bg-orange-50 text-orange-600 border-orange-200',
        dotClass: 'bg-orange-500',
        permissions: ['read', 'write', 'manage_users'],
    },
    operator: {
        label: 'Operador',
        badgeClass: 'bg-blue-50 text-blue-600 border-blue-200',
        dotClass: 'bg-blue-500',
        permissions: ['read', 'write'],
    },
    user: {
        label: 'Usuario',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
        permissions: ['read'],
    },
};
