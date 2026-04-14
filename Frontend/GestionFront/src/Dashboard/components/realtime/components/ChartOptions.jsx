import { Card, CardContent } from '@/components/ui/card';
import { Layers, Combine, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { CHART_MODES } from '../hooks/useChartOptions';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const KEY_LABELS = {
    v: { label: 'Voltaje', unit: 'V' },
    c: { label: 'Corriente', unit: 'A' },
    p: { label: 'Potencia', unit: 'W' },
    e: { label: 'Energía', unit: 'kWh' },
    f: { label: 'Frecuencia', unit: 'Hz' },
    pf: { label: 'Factor Potencia', unit: '' },
};

export const ChartOptions = ({ 
    dataKeys, 
    chartMode, 
    onModeChange, 
    separatedKeys, 
    onToggleKey,
    onSelectAll,
    onClearAll 
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (dataKeys.length <= 1) return null;

    return (
        <Card className="border shadow-sm">
            <CardContent className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onModeChange(CHART_MODES.COMBINED)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                                chartMode === CHART_MODES.COMBINED
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80'
                            }`}
                        >
                            <Combine className="w-4 h-4" />
                            Combinada
                        </button>
                        <button
                            onClick={() => onModeChange(CHART_MODES.SEPARATED)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                                chartMode === CHART_MODES.SEPARATED
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80'
                            }`}
                        >
                            <Layers className="w-4 h-4" />
                            Separadas
                        </button>
                    </div>

                    {chartMode === CHART_MODES.SEPARATED && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                            {separatedKeys.length} / {dataKeys.length} seleccionadas
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    )}
                </div>

                {chartMode === CHART_MODES.SEPARATED && isExpanded && (
                    <div className="mt-3 pt-3 border-t">
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => onSelectAll(dataKeys)}
                                className="text-xs px-2 py-1 bg-muted rounded hover:bg-muted/80"
                            >
                                Seleccionar todas
                            </button>
                            <button
                                onClick={onClearAll}
                                className="text-xs px-2 py-1 bg-muted rounded hover:bg-muted/80"
                            >
                                Limpiar
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {dataKeys.map((key, i) => {
                                const meta = KEY_LABELS[key] || { label: key.toUpperCase(), unit: '' };
                                const isActive = separatedKeys.includes(key);
                                const color = COLORS[i % COLORS.length];

                                return (
                                    <button
                                        key={key}
                                        onClick={() => onToggleKey(key)}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                                            isActive 
                                                ? 'border-2' 
                                                : 'bg-muted hover:bg-muted/80 border border-transparent'
                                        }`}
                                        style={isActive ? { borderColor: color, backgroundColor: `${color}15` } : {}}
                                    >
                                        <div 
                                            className="w-2 h-2 rounded-full" 
                                            style={{ backgroundColor: color }}
                                        />
                                        {meta.label}
                                        {isActive && <Check className="w-3 h-3" style={{ color }} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
