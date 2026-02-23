import { Card, CardContent } from '@/components/ui/card';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Etiquetas legibles para las claves del JSON
const KEY_LABELS = {
    v: { label: 'Voltaje', unit: 'V' },
    c: { label: 'Corriente', unit: 'A' },
    p: { label: 'Potencia', unit: 'W' },
    e: { label: 'Energía', unit: 'kWh' },
    f: { label: 'Frecuencia', unit: 'Hz' },
    pf: { label: 'Factor Potencia', unit: '' },
};

export const SensorStatsCards = ({ dataKeys, lastPoint }) => {
    if (!lastPoint || dataKeys.length === 0) return null;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {dataKeys.map((key, i) => {
                const meta = KEY_LABELS[key] || { label: key.toUpperCase(), unit: '' };
                return (
                    <Card key={key} className="border shadow-sm">
                        <CardContent className="p-4 text-center">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">
                                {meta.label}
                            </p>
                            <p className="text-2xl font-black" style={{ color: COLORS[i % COLORS.length] }}>
                                {lastPoint[key]}
                            </p>
                            {meta.unit && (
                                <p className="text-[10px] text-muted-foreground font-medium">{meta.unit}</p>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};