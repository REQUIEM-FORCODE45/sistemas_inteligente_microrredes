import React from 'react';

/**
 * Switch on/off estilizado.
 * Props:
 *   checked - booleano indicando el estado
 *   onChange - callback que recibe el nuevo valor
 */
const Toggle = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200
      ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
        <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
        ${checked ? 'translate-x-5' : 'translate-x-1'}`}
        />
    </button>
);

export default Toggle;
