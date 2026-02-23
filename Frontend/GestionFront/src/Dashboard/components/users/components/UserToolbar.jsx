import React from 'react';
import { Search, Plus } from 'lucide-react';
import { ROLES } from '../constants/roles';

/**
 * Barra de herramientas con búsqueda, filtro y botón nuevo usuario.
 * Props:
 *   search - valor de búsqueda
 *   onSearchChange - callback para cambiar búsqueda
 *   filterRole - rol seleccionado en filtro
 *   onFilterChange - callback para cambiar filtro
 *   onNewUser - callback para crear nuevo usuario
 */
const UserToolbar = ({
    search,
    onSearchChange,
    filterRole,
    onFilterChange,
    onNewUser,
}) => {
    return (
        <div className="flex flex-col sm:flex-row gap-3">
            {/* Búsqueda */}
            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2.5 gap-2 shadow-sm">
                <Search size={15} className="text-slate-400 shrink-0" />
                <input
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder="Buscar por nombre o email..."
                    className="bg-transparent text-sm text-slate-700 placeholder-slate-300 focus:outline-none w-full"
                />
            </div>

            {/* Filtro por rol */}
            <select
                value={filterRole}
                onChange={e => onFilterChange(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-600
          focus:outline-none focus:ring-2 focus:ring-emerald-400/40 shadow-sm"
            >
                <option value="all">Todos los roles</option>
                {Object.entries(ROLES).map(([key, r]) => (
                    <option key={key} value={key}>
                        {r.label}
                    </option>
                ))}
            </select>

            {/* Botón nuevo usuario */}
            <button
                onClick={onNewUser}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm shrink-0"
            >
                <Plus size={16} /> Nuevo usuario
            </button>
        </div>
    );
};

export default UserToolbar;
