import React, { useState } from 'react';
import { useDevices } from '../../../../Hooks/useDevices';
import { Copy, Share2 } from 'lucide-react';
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

export const DeviceList = () => {
    const { devices, loading, shareSensor, unshareSensor } = useDevices();
    const [sharingSensor, setSharingSensor] = useState(null);

    if (loading) return <p className="text-slate-500 text-sm">Cargando dispositivos...</p>;

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

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <tr>
                        <th className="px-6 py-4">Nombre</th>
                        <th className="px-6 py-4">Tipo</th>
                        <th className="px-6 py-4">Topic (ID)</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4">Compartir</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {devices.map(d => (
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
                                <span
                                    className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase
                                        ${d.status === 'active' ? 'bg-green-100 text-green-700' :
                                            d.status === 'inactive' ? 'bg-red-100 text-red-700' :
                                                'bg-yellow-100 text-yellow-700'}`}
                                >
                                    {d.status}
                                </span>
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
                        </tr>
                    ))}
                    {devices.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
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
