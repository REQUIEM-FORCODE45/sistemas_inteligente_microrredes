import { Card, CardContent } from '@/components/ui/card';
import { ListFilter, X } from 'lucide-react';
import { useState } from 'react';

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
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    
    if (!lastPoint || dataKeys.length === 0) return null;

    return (
        <>
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

            <div className="sm:hidden">
                <button
                    onClick={() => setShowMobileMenu(true)}
                    className="w-full flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                >
                    <span className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4" />
                        Variables
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {activeKeys?.length || 0} activas
                    </span>
                </button>

                {showMobileMenu && (
                    <div className="fixed inset-0 z-50">
                        <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
                        <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-lg p-4 max-h-[60vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-semibold">Variables</h3>
                                <button onClick={() => setShowMobileMenu(false)}>
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-2">
                                {dataKeys.map((key, i) => {
                                    const meta = KEY_LABELS[key] || { label: key.toUpperCase(), unit: '' };
                                    const isActive = activeKeys?.includes(key) ?? true;
                                    const color = COLORS[i % COLORS.length];

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => onToggleKey(key)}
                                            className={`w-full flex items-center justify-between p-3 rounded-md ${
                                                isActive ? 'bg-primary/10 border border-primary' : 'bg-muted'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: color }}
                                                />
                                                <div className="text-left">
                                                    <p className="font-medium">{meta.label}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {lastPoint[key]} {meta.unit}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                                isActive ? 'border-primary bg-primary' : 'border-muted-foreground'
                                            }`}>
                                                {isActive && <div className="w-2 h-2 bg-white rounded-sm" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};