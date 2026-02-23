import React from 'react';
import { Users, UserCheck, Shield } from 'lucide-react';

/**
 * Tarjetas de estadísticas de usuarios.
 * Props:
 *   users - array de usuarios
 */
const UserStats = ({ users }) => {
    const stats = [
        {
            label: 'Total usuarios',
            value: users.length,
            icon: Users,
            colorText: 'text-blue-500',
            colorBg: 'bg-blue-50',
        },
        {
            label: 'Usuarios activos',
            value: users.filter(u => u.active).length,
            icon: UserCheck,
            colorText: 'text-emerald-500',
            colorBg: 'bg-emerald-50',
        },
        {
            label: 'Administradores',
            value: users.filter(u => ['superadmin', 'admin'].includes(u.role)).length,
            icon: Shield,
            colorText: 'text-orange-500',
            colorBg: 'bg-orange-50',
        },
    ];

    return (
        <div className="grid grid-cols-3 gap-4">
            {stats.map(s => (
                <div key={s.label} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className={`p-2.5 ${s.colorBg} rounded-xl`}>
                        <s.icon size={18} className={s.colorText} />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                        <p className="text-xs text-slate-400">{s.label}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default UserStats;
