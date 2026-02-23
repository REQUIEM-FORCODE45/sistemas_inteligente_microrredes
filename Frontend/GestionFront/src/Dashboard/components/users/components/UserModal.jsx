import React, { useState } from 'react';
import { X, Check, Eye, EyeOff, Key, Lock } from 'lucide-react';
import Field from './atoms/Field';
import Toggle from './atoms/Toggle';
import RoleBadge from './atoms/RoleBadge';
import { ROLES } from '../constants/roles';
import { SENSORS, SENSOR_GROUPS } from '../constants/sensors';
import { sha256, inputClass } from '../utils/helpers';
import { UserCheck } from 'lucide-react';

/**
 * Modal para crear o editar un usuario.
 * Props:
 *   user - objeto usuario existente (edición) o null (creación)
 *   onSave - callback({ ...campos, passwordHash? })
 *   onClose - callback para cerrar
 */
const UserModal = ({ user, onSave, onClose }) => {
    const isEditing = !!user?.id;

    const [form, setForm] = useState({
        name: user?.name || '',
        email: user?.email || '',
        role: user?.role || 'visor',
        active: user?.active ?? true,
        sensorAccess: user?.sensorAccess || [],
        password: '',
        confirmPassword: '',
    });
    const [showPass, setShowPass] = useState(false);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    // ── Helpers de formulario ──────────────────────────────────

    const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const toggleSensor = (id) =>
        set(
            'sensorAccess',
            form.sensorAccess.includes(id)
                ? form.sensorAccess.filter(s => s !== id)
                : [...form.sensorAccess, id],
        );

    // ── Validación ─────────────────────────────────────────────

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = 'Nombre requerido';
        if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = 'Email inválido';
        if (!isEditing && !form.password) e.password = 'Contraseña requerida';
        if (form.password && form.password.length < 8) e.password = 'Mínimo 8 caracteres';
        if (form.password && form.password !== form.confirmPassword)
            e.confirmPassword = 'Las contraseñas no coinciden';
        return e;
    };

    // ── Guardar ────────────────────────────────────────────────

    const handleSave = async () => {
        const e = validate();
        if (Object.keys(e).length) {
            setErrors(e);
            return;
        }

        setSaving(true);
        const payload = { ...form };

        if (form.password) {
            payload.passwordHash = await sha256(form.password);
        }
        if (isEditing) {
            payload.id = user.id;
        }

        delete payload.password;
        delete payload.confirmPassword;

        onSave(payload);
    };

    // ── Render ─────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)' }}
        >
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* ── Cabecera ── */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-xl">
                            <UserCheck size={20} className="text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">
                                {isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
                            </h2>
                            <p className="text-xs text-slate-400">Contraseña almacenada con SHA-256</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <X size={18} className="text-slate-400" />
                    </button>
                </div>

                {/* ── Cuerpo con scroll ── */}
                <div className="overflow-y-auto flex-1 p-6 space-y-6">
                    {/* Sección: Información básica */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Información Básica
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Nombre completo" error={errors.name}>
                                <input
                                    value={form.name}
                                    onChange={e => set('name', e.target.value)}
                                    placeholder="Juan García"
                                    className={inputClass(errors.name)}
                                />
                            </Field>
                            <Field label="Correo electrónico" error={errors.email}>
                                <input
                                    value={form.email}
                                    onChange={e => set('email', e.target.value)}
                                    placeholder="usuario@solargrid.co"
                                    className={inputClass(errors.email)}
                                />
                            </Field>
                        </div>
                    </section>

                    {/* Sección: Rol y estado */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Rol y Estado
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Rol del sistema">
                                <select
                                    value={form.role}
                                    onChange={e => set('role', e.target.value)}
                                    className={inputClass(false)}
                                >
                                    {Object.entries(ROLES).map(([key, r]) => (
                                        <option key={key} value={key}>
                                            {r.label}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <div className="flex items-center gap-3 pt-6">
                                <Toggle checked={form.active} onChange={v => set('active', v)} />
                                <span className="text-sm text-slate-600">
                                    {form.active ? 'Usuario activo' : 'Usuario inactivo'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500">
                                <span className="font-semibold text-slate-600">Permisos: </span>
                                {ROLES[form.role].permissions.join(', ')}
                            </p>
                        </div>
                    </section>

                    {/* Sección: Contraseña */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Key size={11} /> Contraseña
                            {isEditing && (
                                <span className="font-normal normal-case text-slate-400">
                                    (dejar vacío para no cambiar)
                                </span>
                            )}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Nueva contraseña" error={errors.password}>
                                <div className="relative">
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={e => set('password', e.target.value)}
                                        placeholder="Mín. 8 caracteres"
                                        className={`${inputClass(errors.password)} pr-10`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </Field>
                            <Field label="Confirmar contraseña" error={errors.confirmPassword}>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={form.confirmPassword}
                                    onChange={e => set('confirmPassword', e.target.value)}
                                    placeholder="Repetir contraseña"
                                    className={inputClass(errors.confirmPassword)}
                                />
                            </Field>
                        </div>

                        {form.password && (
                            <div className="mt-2 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-2">
                                <Lock size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-emerald-700">
                                    Se guardará cifrada con <span className="font-semibold">SHA-256</span>.
                                    Nunca se almacena la contraseña en texto plano.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Sección: Acceso a sensores */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Acceso a Sensores
                            </h3>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => set('sensorAccess', SENSORS.map(s => s.id))}
                                    className="text-xs text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors font-medium"
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => set('sensorAccess', [])}
                                    className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {SENSOR_GROUPS.map(group => (
                                <div key={group}>
                                    <p className="text-xs text-slate-400 font-semibold mb-1.5 pl-1">{group}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {SENSORS.filter(s => s.group === group).map(sensor => {
                                            const Icon = sensor.icon;
                                            const selected = form.sensorAccess.includes(sensor.id);
                                            return (
                                                <button
                                                    key={sensor.id}
                                                    type="button"
                                                    onClick={() => toggleSensor(sensor.id)}
                                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all duration-150
                            ${selected
                                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <Icon size={14} />
                                                    <span className="flex-1 text-xs font-medium">{sensor.label}</span>
                                                    {selected && <Check size={13} className="text-emerald-500 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* ── Footer ── */}
                <div className="flex items-center justify-between p-6 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                        {form.sensorAccess.length} de {SENSORS.length} sensores seleccionados
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving ? (
                                <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                                <Check size={14} />
                            )}
                            {isEditing ? 'Guardar cambios' : 'Crear usuario'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserModal;
