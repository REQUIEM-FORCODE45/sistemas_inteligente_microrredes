import { Card, CardContent } from '@/components/ui/card';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const KEY_LABELS = {
    v: { label: 'Voltaje', unit: 'V' },
    c: { label: 'Corriente', unit: 'A' },
    p: { label: 'Potencia', unit: 'W' },
    e: { label: 'Energía', unit: 'kWh' },
    f: { label: 'Frecuencia', unit: 'Hz' },
    pf: { label: 'Factor Potencia', unit: '' },
};

export const SensorStatsCards = ({ dataKeys, lastPoint, activeKeys, onToggleKey }) => {
    console.log('onToggleKey:', onToggleKey);
    if (!lastPoint || dataKeys.length === 0) return null;

    return (
        <div className="hidden sm:flex flex-wrap gap-1.5">
            {dataKeys.map((key, i) => {
                const meta = KEY_LABELS[key] || { label: key.toUpperCase(), unit: '' };
                const isActive = activeKeys?.includes(key) ?? true;
                const color = COLORS[i % COLORS.length];

                return (
                    <Card
                        key={key}
                        onClick={() => onToggleKey(key)}
                        className={`shadow-sm cursor-pointer transition-all duration-200 select-none w-20
                        ${isActive ? 'opacity-100' : 'opacity-40 grayscale'}`}
                        style={{ borderColor: isActive ? color : undefined }}
                    >
                        <CardContent className="p-1 text-center">
                            <p className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">
                                {meta.label}
                            </p>
                            <p className="text-base font-black" style={{ color: isActive ? color : '#94a3b8' }}>
                                {lastPoint[key]}
                            </p>
                            {meta.unit && (
                                <p className="text-[8px] text-muted-foreground font-medium">{meta.unit}</p>
                            )}
                            <div
                                className="mt-1 h-0.5 rounded-full mx-auto w-4 transition-all"
                                style={{ backgroundColor: isActive ? color : '#e2e8f0' }}
                            />
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};