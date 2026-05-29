import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { X, Trash2, UserPlus2 } from 'lucide-react';

export const ShareSensorModal = ({
    sensor,
    sharedWith = [],
    onClose,
    onShare,
    onUnshare
}) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);

    const handleShare = async () => {
        const trimmed = email.trim();
        if (!trimmed) {
            setStatus({ type: 'error', message: 'Ingresa un correo válido' });
            return;
        }
        setLoading(true);
        const result = await onShare(sensor._id, { email: trimmed });
        setLoading(false);
        if (result.success) {
            setEmail('');
            setStatus({ type: 'success', message: 'Sensor compartido correctamente' });
        } else {
            setStatus({ type: 'error', message: result.message });
        }
    };

    const handleUnshare = async (targetId) => {
        setLoading(true);
        const result = await onUnshare(sensor._id, targetId);
        setLoading(false);
        if (result.success) {
            setStatus({ type: 'success', message: 'Acceso revocado' });
        } else {
            setStatus({ type: 'error', message: result.message });
        }
    };

    const statusColor = status?.type === 'success' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-900/70" onClick={onClose} aria-hidden />
            <Card className="relative w-full max-w-xl z-10">
                <CardHeader className="flex items-start justify-between pb-0">
                    <div>
                        <CardTitle className="text-lg">Compartir sensor</CardTitle>
                        <CardDescription className="text-sm text-slate-500">
                            {sensor.name} · Estado: {sensor.status} · Tipo: {sensor.type}
                        </CardDescription>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full border border-input p-2 hover:bg-slate-100"
                        aria-label="Cerrar modal"
                    >
                        <X size={16} />
                    </button>
                </CardHeader>
                <CardContent className="space-y-6">
                    {status && (
                        <div className={`rounded-xl px-4 py-2 text-sm font-semibold ${statusColor}`}>
                            {status.message}
                        </div>
                    )}

                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Enviar invitación</p>
                        <div className="flex gap-2">
                            <input
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                type="email"
                                placeholder="correo@ejemplo.com"
                                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                            <Button onClick={handleShare} disabled={loading} className="px-4 py-2 h-10">
                                <UserPlus2 size={16} />
                                Compartir
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Se enviará un permiso temporal. El usuario podrá ver la telemetría hasta que se retire explícitamente.</p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Usuarios con acceso ({sharedWith.length})</p>
                            <span className="text-xs text-muted-foreground">{sensor.owner?.name || 'Creador'}</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            {sharedWith.length === 0 && (
                                <p className="text-sm text-slate-500">Nadie más tiene acceso aún.</p>
                            )}
                            {sharedWith.map(user => (
                                <div key={user._id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                                        <p className="text-xs text-slate-500">{user.email} · {user.role}</p>
                                    </div>
                                    <button
                                        onClick={() => handleUnshare(user._id)}
                                        disabled={loading}
                                        className="text-red-500 hover:text-red-600"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
