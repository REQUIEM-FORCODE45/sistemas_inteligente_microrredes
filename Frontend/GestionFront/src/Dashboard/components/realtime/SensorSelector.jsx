import { Badge } from "@/components/ui/badge";
import { useDevices } from "../../../../Hooks/useDevices";

export const SensorSelector = ({ selectedIds, onToggle }) => {
    const { devices, loading } = useDevices();
    // NOTA: el clima no es un sensor (entrada externa Open-Meteo/TimesFM);
    // pasto_weather se excluye del selector de monitoreo en tiempo real.
    const plantDevices = (devices || []).filter((d) => String(d._id) !== 'pasto_weather');

    if (loading) return <p className="text-sm text-muted-foreground">Cargando sensores...</p>;

    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Selecciona sensores
            </p>
            <div className="flex flex-wrap gap-2">
                {plantDevices.map(d => {
                    const isSelected = selectedIds.includes(d._id);
                    return (
                        <button
                            key={d._id}
                            onClick={() => onToggle(d._id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border
                                ${isSelected
                                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                    : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                                }`}
                        >
                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                                ${isSelected ? 'border-primary-foreground bg-primary-foreground/20' : 'border-current'}`}>
                                {isSelected && (
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                )}
                            </span>
                            {d.name}
                            <Badge variant={d.status === 'active' ? 'success' : 'warning'} className="ml-1">
                                {d.status}
                            </Badge>
                        </button>
                    );
                })}
                {plantDevices.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No hay sensores registrados.</p>
                )}
            </div>
        </div>
    );
};