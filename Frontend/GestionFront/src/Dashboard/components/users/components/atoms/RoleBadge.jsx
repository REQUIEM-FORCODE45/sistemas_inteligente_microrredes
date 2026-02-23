import React from 'react';
import { ROLES } from '../../constants/roles';

/**
 * Badge coloreado según el rol.
 * Props:
 *   role - ID del rol ('superadmin', 'admin', 'operador', 'visor')
 */
const RoleBadge = ({ role }) => {
    const { label, badgeClass, dotClass } = ROLES[role];
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {label}
        </span>
    );
};

export default RoleBadge;
