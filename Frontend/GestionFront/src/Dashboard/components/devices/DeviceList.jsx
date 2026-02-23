// Dashboard/components/devices/DeviceList.jsx

import { useDevices } from "../../../../Hooks/useDevices";


export const DeviceList = () => {
    const { devices, loading } = useDevices();

    if (loading) return <p className="text-slate-500 text-sm">Cargando dispositivos...</p>;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <tr>
                        <th className="px-6 py-4">Nombre</th>
                        <th className="px-6 py-4">Tipo</th>
                        <th className="px-6 py-4">Estado</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {devices.map(d => (
                        <tr key={d._id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-semibold text-slate-800">{d.name}</td>
                            <td className="px-6 py-4 text-slate-500 text-sm capitalize">{d.type}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase
                                    ${d.status === 'active' ? 'bg-green-100 text-green-700' :
                                        d.status === 'inactive' ? 'bg-red-100 text-red-700' :
                                            'bg-yellow-100 text-yellow-700'}`}>
                                    {d.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                    {devices.length === 0 && (
                        <tr>
                            <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">
                                No hay dispositivos registrados.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};