import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';

/**
 * Notificación tipo toast que aparece en la esquina superior derecha.
 * Props:
 *   message - texto del mensaje
 *   type - 'success' o 'error'
 */
const Toast = ({ message, type = 'success' }) => (
    <div
        className={`fixed top-5 right-5 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium
      ${type === 'success'
                ? 'bg-white border-emerald-200 text-emerald-700'
                : 'bg-white border-red-200 text-red-600'
            }`}
        style={{ animation: 'slideIn .25s ease' }}
    >
        {type === 'success' ? <Check size={15} /> : <AlertTriangle size={15} />}
        {message}
        <style>{`
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
    </div>
);

export default Toast;
