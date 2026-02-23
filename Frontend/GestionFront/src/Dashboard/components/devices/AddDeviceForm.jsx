// Dashboard/components/devices/AddDeviceForm.jsx
import { useDevices } from '../../../../Hooks/useDevices';
import { useState } from 'react';


export const AddDeviceForm = () => {
    const { addDevice, loading, error, successMsg, clearMsgs } = useDevices();
    const [form, setForm] = useState({ name: '', type: 'microgrid', status: 'active' });

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await addDevice(form);
        setForm({ name: '', type: 'microgrid', status: 'active' });
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-lg">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Registrar Dispositivo</h3>
            <p className="text-sm text-slate-500 mb-6">Añade un nuevo sensor o dispositivo IoT.</p>

            {(error || successMsg) && (
                <div className={`p-3 rounded-lg mb-4 text-sm flex justify-between items-center
                    ${error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    <span>{error || successMsg}</span>
                    <button onClick={clearMsgs} className="font-bold ml-4">✕</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nombre</label>
                    <input
                        name="name" value={form.name} onChange={handleChange} required
                        placeholder="Ej: Sensor de Corriente - Inversor 03"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tipo</label>
                    <select name="type" value={form.type} onChange={handleChange}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                        <option value="microgrid">Microgrid</option>
                        <option value="solar">Solar</option>
                        <option value="battery">Batería</option>
                        <option value="inverter">Inversor</option>
                        <option value="meter">Medidor</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Estado</label>
                    <select name="status" value={form.status} onChange={handleChange}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                        <option value="maintenance">Mantenimiento</option>
                    </select>
                </div>
                <button type="submit" disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all">
                    {loading ? 'Registrando...' : 'Registrar Dispositivo'}
                </button>
            </form>
        </div>
    );
};