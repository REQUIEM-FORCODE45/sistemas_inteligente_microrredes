
import { Badge } from "@/components/ui/badge";
import { useDevices } from "../../../../Hooks/useDevices";


export const SensorSelector = ({ selected, onSelect }) => {
    const { devices, loading } = useDevices();

    if (loading) return <p className="text-sm text-muted-foreground">Cargando sensores...</p>;

    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Selecciona un sensor
            </p>
            <div className="flex flex-wrap gap-2">
                {devices.map(d => (
                    <button
                        key={d._id}
                        onClick={() => onSelect(d._id)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border
                            ${selected === d._id
                                ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                            }`}
                    >
                        {d.name}
                        <Badge
                            variant={d.status === 'active' ? 'success' : 'warning'}
                            className="ml-2"
                        >
                            {d.status}
                        </Badge>
                    </button>
                ))}
                {devices.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No hay sensores registrados.</p>
                )}
            </div>
        </div>
    );
};