import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import RoleBadge from './atoms/RoleBadge';
import { SENSORS } from '../constants/sensors';
import { getInitials } from '../utils/helpers';

/**
 * Tabla de usuarios con acciones de edición y eliminación.
 * Props:
 *   users - array de usuarios a mostrar
 *   onEdit - callback(usuario) para editar
 *   onDelete - callback(usuario) para eliminar
 */
const UserTable = ({ users, onEdit, onDelete }) => {
    return (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                            {['Usuario', 'Rol', 'Sensores', 'Creado', 'Estado', ''].map((h, i) => (
                                <th
                                    key={i}
                                    className={`text-left text-xs text-slate-400 font-semibold px-5 py-3.5 uppercase tracking-wide
                    ${i === 2 ? 'hidden md:table-cell' : ''}
                    ${i === 3 ? 'hidden lg:table-cell' : ''}
                    ${i === 5 ? 'w-16' : ''}`}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={6} className="py-14 text-center text-slate-400 text-sm">
                                    No se encontraron usuarios
                                </td>
                            </tr>
                        )}
                        {users.map((user, i) => (
                            <tr
                                key={user.id}
                                className={`hover:bg-slate-50 transition-colors
                  ${i < users.length - 1 ? 'border-b border-slate-100' : ''}`}
                            >
                                {/* Nombre + email */}
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                            {getInitials(user.name)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{user.name}</p>
                                            <p className="text-xs text-slate-400">{user.email}</p>
                                        </div>
                                    </div>
                                </td>

                                {/* Rol */}
                                <td className="px-5 py-4">
                                    <RoleBadge role={user.role} />
                                </td>

                                {/* Acceso a sensores (barra de progreso) */}
                                <td className="px-5 py-4 hidden md:table-cell">
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 rounded-full bg-slate-100 w-20 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full transition-all"
                                                style={{ width: `${(user.sensorAccess.length / SENSORS.length) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-400">
                                            {user.sensorAccess.length}/{SENSORS.length}
                                        </span>
                                    </div>
                                </td>

                                {/* Fecha de creación */}
                                <td className="px-5 py-4 hidden lg:table-cell text-xs text-slate-400">
                                    {user.createdAt}
                                </td>

                                {/* Estado activo/inactivo */}
                                <td className="px-5 py-4">
                                    <span
                                        className={`inline-flex items-center gap-1.5 text-xs font-medium
                    ${user.active ? 'text-emerald-600' : 'text-slate-400'}`}
                                    >
                                        <span
                                            className={`w-1.5 h-1.5 rounded-full
                      ${user.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}
                                        />
                                        {user.active ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>

                                {/* Acciones */}
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-1 justify-end">
                                        <button
                                            onClick={() => onEdit(user)}
                                            title="Editar"
                                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => onDelete(user)}
                                            title="Eliminar"
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserTable;
