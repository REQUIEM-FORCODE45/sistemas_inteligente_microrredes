import { Card, CardContent } from '@/components/ui/card';
import { ListFilter, X, Layers, Combine, Check, ChevronDown, ChevronUp } from 'lucide-react';
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

export const SensorPanel = ({ 
    dataKeys, 
    lastPoint, 
    activeKeys, 
    onToggleKey,
    chartMode,
    onModeChange,
    separatedKeys,
    onSelectAllSeparated,
    onClearAll
}) => {
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    
    if (!lastPoint || dataKeys.length === 0) return null;

    const getActiveKeys = () => {
        return chartMode === CHART_MODES.SEPARATED ? separatedKeys : activeKeys;
    };

    const currentActiveKeys = getActiveKeys();

    const renderDesktopCards = () => (
        <div className="hidden sm:flex flex-wrap gap-1.5">
            {dataKeys.map((key, i) => {
                const meta = KEY_LABELS[key] || { label: key.toUpperCase(), unit: '' };
                const isActive = currentActiveKeys?.includes(key) ?? true;
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

    const renderModeSelector = () => (
        dataKeys.length > 1 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
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
                {chartMode === CHART_MODES.SEPARATED && (
                    <>
                        <button
                            onClick={() => onSelectAllSeparated(dataKeys)}
                            className="text-xs px-2 py-1 bg-muted rounded hover:bg-muted/80 ml-auto"
                        >
                            Todas
                        </button>
                        <button
                            onClick={onClearAll}
                            className="text-xs px-2 py-1 bg-muted rounded hover:bg-muted/80"
                        >
                            Ninguna
                        </button>
                    </>
                )}
            </div>
        )
    );

    const renderMobileContent = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold">Variables</h3>
                <button onClick={() => setShowMobileMenu(false)}>
                    <X className="w-5 h-5" />
                </button>
            </div>

            {dataKeys.length > 1 && (
                <div className="flex gap-2">
                    <button
                        onClick={() => onModeChange(CHART_MODES.COMBINED)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm ${
                            chartMode === CHART_MODES.COMBINED
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                        }`}
                    >
                        <Combine className="w-4 h-4" />
                        Combinada
                    </button>
                    <button
                        onClick={() => onModeChange(CHART_MODES.SEPARATED)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm ${
                            chartMode === CHART_MODES.SEPARATED
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        Separadas
                    </button>
                </div>
            )}

            <div className="space-y-2">
                {dataKeys.map((key, i) => {
                    const meta = KEY_LABELS[key] || { label: key.toUpperCase(), unit: '' };
                    const isActive = currentActiveKeys?.includes(key) ?? true;
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
    );

    return (
        <Card className="border shadow-sm">
            <CardContent className="p-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground mb-2"
                >
                    <span className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4" />
                        Variables ({currentActiveKeys?.length || 0}/{dataKeys.length})
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isExpanded && (
                    <>
                        {renderDesktopCards()}
                        {renderModeSelector()}
                    </>
                )}

                <div className="sm:hidden mt-3">
                    <button
                        onClick={() => setShowMobileMenu(true)}
                        className="w-full flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                    >
                        <span className="flex items-center gap-2">
                            <ListFilter className="w-4 h-4" />
                            Configurar variables
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {currentActiveKeys?.length || 0} activas
                        </span>
                    </button>

                    {showMobileMenu && (
                        <div className="fixed inset-0 z-50">
                            <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
                            <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-lg p-4 max-h-[70vh] overflow-y-auto">
                                {renderMobileContent()}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
