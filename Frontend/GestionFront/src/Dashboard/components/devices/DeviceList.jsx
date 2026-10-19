// Dashboard/components/devices/DeviceList.jsx
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useDevices } from '../../../../Hooks/useDevices';
import { Copy, Share2, MoreHorizontal, Power, PowerOff, Wrench, Trash2, Check, X } from 'lucide-react';
import { ShareSensorModal } from './ShareSensorModal';

const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-md transition-colors text-slate-600"
        >
            <Copy size={12} />
            {copied ? 'Copiado!' : text}
        </button>
    );
};

const StatusBadge = ({ status }) => (
    <span
        className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase
            ${status === 'active' ? 'bg-green-100 text-green-700' :
                status === 'inactive' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'}`}
    >
        {status}
    </span>
);

const MENU_HEIGHT = { normal: 200, confirm: 96 };

const DeviceActionsMenu = ({ device, onStatus, onDelete, onImpact, menuId, openMenuId, setOpenMenuId }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    // P3: preflight de borrado (conteo + referencias) para mostrarlo en la confirmacion.
    const [impact, setImpact] = useState(null);
    const isOpen = openMenuId === menuId;
    const btnRef = useRef(null);
    const menuRef = useRef(null);

    // position:fixed colocado escribiendo el DOM (sin setState en el effect).
    // Escapa al overflow-hidden de la tabla y al scroll de la página: no se corta.
    useLayoutEffect(() => {
        if (!isOpen) return undefined;

        const place = () => {
            const btn = btnRef.current;
            const menu = menuRef.current;
            if (!btn || !menu) return;
            const r = btn.getBoundingClientRect();
            const h = menu.offsetHeight
                || (confirmDelete ? MENU_HEIGHT.confirm : MENU_HEIGHT.normal);
            let top = r.bottom + 6;
            if (top + h > window.innerHeight - 8) {
                top = Math.max(8, r.top - h - 6);
            }
            menu.style.top = `${top}px`;
            menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
        };

        place();
        const onViewportChange = () => place();
        // capture=true: también reacciona al scroll del contenedor interno.
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        return () => {
            window.removeEventListener('scroll', onViewportChange, true);
            window.removeEventListener('resize', onViewportChange);
        };
    }, [isOpen, confirmDelete, impact]);

    const close = () => {
        setOpenMenuId(null);
        setConfirmDelete(false);
        setImpact(null);
    };

    const handleStatus = async (status) => {
        close();
        await onStatus(device._id, status);
    };

    const askDelete = async () => {
        setConfirmDelete(true);
        setImpact({ loading: true });
        const res = await onImpact(device._id);
        setImpact(res.success ? { impact: res.impact } : { error: res.message });
    };

    const handleDelete = async () => {
        const force = !!(impact?.impact?.warnings?.length);
        close();
        await onDelete(device._id, force);
    };

    return (
        <div>
            <button
                ref={btnRef}
                onClick={() => (isOpen ? close() : setOpenMenuId(menuId))}
                className="flex items-center rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:border-primary hover:text-primary"
                title="Configurar sensor"
            >
                <MoreHorizontal size={16} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={close} />
                    <div
                        ref={menuRef}
                        style={{ position: 'fixed', top: '-9999px', right: '-9999px', zIndex: 50 }}
                        className="w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                    >
                        {!confirmDelete ? (
                            <>
                                <button
                                    onClick={() => handleStatus('active')}
                                    disabled={device.status === 'active'}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                                >
                                    <Power size={14} className="text-green-600" />
                                    Activar
                                </button>
                                <button
                                    onClick={() => handleStatus('inactive')}
                                    disabled={device.status === 'inactive'}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                                >
                                    <PowerOff size={14} className="text-red-500" />
                                    Desactivar
                                </button>
                                <button
                                    onClick={() => handleStatus('maintenance')}
                                    disabled={device.status === 'maintenance'}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                                >
                                    <Wrench size={14} className="text-yellow-600" />
                                    Mantenimiento
                                </button>
                                <div className="my-1 border-t border-slate-100" />
                                <button
                                    onClick={askDelete}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 size={14} />
                                    Eliminar
                                </button>
                            </>
                        ) : (
                            <div className="px-3 py-2">
                                <p className="mb-2 text-xs font-semibold text-slate-700">¿Eliminar este sensor?</p>
                                {impact?.loading && (
                                    <p className="mb-2 text-[11px] text-slate-400">Calculando impacto…</p>
                                )}
                                {impact?.error && (
                                    <p className="mb-2 text-[11px] text-amber-600">{impact.error}</p>
                                )}
                                {impact?.impact && (
                                    <div className="mb-2 space-y-1">
                                        <p className="text-[11px] text-slate-600">
                                            Se archivarán {impact.impact.lecturas ?? 'un número desconocido de'} lecturas.
                                        </p>
                                        {(impact.impact.warnings || []).map((w, i) => (
                                            <p key={i} className="text-[10px] text-amber-700">⚠ {w}</p>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDelete}
                                        className="flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                                    >
                                        <Check size={12} />
                                        Sí
                                    </button>
                                    <button
                                        onClick={close}
                                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        <X size={12} />
                                        No
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export const DeviceList = () => {
    const { devices, loading, shareSensor, unshareSensor, updateSensorStatus, deleteSensor, deleteImpact } = useDevices({ includeInactive: true });
    const [sharingSensor, setSharingSensor] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [actionMsg, setActionMsg] = useState(null);

    const showMsg = (type, text) => {
        setActionMsg({ type, text });
        setTimeout(() => setActionMsg(null), 4000);
    };

    const handleStatusChange = async (sensorId, status) => {
        const res = await updateSensorStatus(sensorId, status);
        if (res.success) showMsg('success', 'Estado actualizado.');
        else showMsg('error', res.message || 'No se pudo actualizar el estado.');
    };

    const handleDelete = async (sensorId, force = false) => {
        const res = await deleteSensor(sensorId, force);
        if (res.success) {
            const bits = ['Sensor eliminado.'];
            if (res.archivadas !== undefined && res.archivadas !== null) {
                bits.push(`${res.archivadas} lecturas archivadas${res.archivo ? ` en ${res.archivo}` : ''}.`);
            }
            for (const w of res.warnings || []) bits.push(w);
            showMsg('success', bits.join(' '));
        } else if (res.conflict) {
            showMsg('error', res.message || 'El sensor tiene referencias vivas.');
        } else {
            showMsg('error', res.message || 'No se pudo eliminar el sensor.');
        }
    };

    const handleImpact = async (sensorId) => deleteImpact(sensorId);

    const handleModalShare = async (sensorId, payload) => {
        const result = await shareSensor(sensorId, payload);
        if (result.success && sharingSensor) {
            setSharingSensor(prev => (prev ? { ...prev, sharedWith: result.data } : prev));
        }
        return result;
    };

    const handleModalUnshare = async (sensorId, userId) => {
        const result = await unshareSensor(sensorId, userId);
        if (result.success && sharingSensor) {
            setSharingSensor(prev => (prev ? { ...prev, sharedWith: result.data } : prev));
        }
        return result;
    };

    // Solo bloquea la tabla en la carga inicial; los refetch tras una accion
    // no deben vaciar la lista.
    if (loading && devices.length === 0) {
        return <p className="text-slate-400 italic">Cargando dispositivos...</p>;
    }

    // NOTA: el clima no es un sensor de la planta (entrada externa
    // Open-Meteo/PatchTST); pasto_weather se excluye de la gestion de equipos.
    const plantDevices = (devices || []).filter((d) => String(d._id) !== 'pasto_weather');

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {actionMsg && (
                <div className={`px-6 py-2 text-xs ${actionMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {actionMsg.text}
                </div>
            )}
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <tr>
                        <th className="px-6 py-4">Nombre</th>
                        <th className="px-6 py-4">Tipo</th>
                        <th className="px-6 py-4">Topic (ID)</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4">Compartir</th>
                        <th className="px-6 py-4">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {plantDevices.map(d => (
                        <tr key={d._id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-semibold text-slate-800">
                                {d.name}
                                <p className="text-[10px] text-slate-400">Dueño: {d.owner?.name || 'Tú'}</p>
                            </td>
                            <td className="px-6 py-4 text-slate-500 text-sm capitalize">{d.type}</td>
                            <td className="px-6 py-4">
                                <CopyButton text={d._id} />
                            </td>
                            <td className="px-6 py-4">
                                <StatusBadge status={d.status} />
                            </td>
                            <td className="px-6 py-4">
                                <button
                                    onClick={() => setSharingSensor(d)}
                                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
                                >
                                    <Share2 size={14} />
                                    Compartir
                                </button>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    {d.sharedWith?.length ? `${d.sharedWith.length} usuarios` : 'Privado'}
                                </p>
                            </td>
                            <td className="px-6 py-4">
                                <DeviceActionsMenu
                                    device={d}
                                    menuId={d._id}
                                    openMenuId={openMenuId}
                                    setOpenMenuId={setOpenMenuId}
                                    onStatus={handleStatusChange}
                                    onDelete={handleDelete}
                                    onImpact={handleImpact}
                                />
                            </td>
                        </tr>
                    ))}
                    {plantDevices.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                                No hay dispositivos registrados.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {sharingSensor && (
                <ShareSensorModal
                    sensor={sharingSensor}
                    sharedWith={sharingSensor.sharedWith || []}
                    onClose={() => setSharingSensor(null)}
                    onShare={handleModalShare}
                    onUnshare={handleModalUnshare}
                />
            )}
        </div>
    );
};
