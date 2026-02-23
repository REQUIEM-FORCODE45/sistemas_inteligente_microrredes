import React from 'react';

/**
 * Campo de formulario con label y mensaje de error opcional.
 * Props:
 *   label - texto del label
 *   error - mensaje de error (opcional)
 *   children - input o elemento hijo
 */
const Field = ({ label, error, children }) => (
    <div>
        <label className="text-sm font-medium text-slate-600 mb-1.5 block">{label}</label>
        {children}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
);

export default Field;
