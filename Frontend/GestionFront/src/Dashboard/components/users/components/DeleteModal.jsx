import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Modal de confirmación de eliminación.
 * Props:
 *   user - usuario a eliminar
 *   onConfirm - callback de confirmación
 *   onClose - callback para cancelar
 */
const DeleteModal = ({ user, onConfirm, onClose }) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)' }}
    >
        <div className="bg-white border border-red-100 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-50 rounded-xl">
                    <AlertTriangle size={20} className="text-red-500" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Eliminar usuario</h2>
            </div>
            <p className="text-sm text-slate-500 mb-6">
                ¿Deseas eliminar a{' '}
                <span className="text-slate-800 font-semibold">{user.name}</span>?
                Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
                <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={onConfirm}
                    className="flex-1 px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                >
                    Eliminar
                </button>
            </div>
        </div>
    </div>
);

export default DeleteModal;
