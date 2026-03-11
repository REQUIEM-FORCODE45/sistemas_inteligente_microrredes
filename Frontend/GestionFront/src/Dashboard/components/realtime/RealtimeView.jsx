import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { RealtimeChart } from './RealtimeChart';
import { SensorSelector } from './SensorSelector';
import { SensorStatsCards } from './SensorStatsCards';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Menu, X } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const MAX_POINTS = 20;
const EXCLUDED_KEYS = ['createAt', '_id', 'sensorId', 'timestamp'];

export const RealtimeView = () => {
    const [selectedIds, setSelectedIds] = useState([]);
    const [sensors, setSensors] = useState({});
    const [collapsedSensors, setCollapsedSensors] = useState({});
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeSensorMobile, setActiveSensorMobile] = useState(null);
    const socketRef = useRef(null);
    const selectedIdsRef = useRef([]);

    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);

    useEffect(() => {
        socketRef.current = io(SOCKET_URL);

        const globalListener = (payload) => {
            // ✅ Normalizar _id del payload a string para comparar correctamente
            const sensorId = String(payload._id);

            if (!selectedIdsRef.current.includes(sensorId)) return;

            const timestamp = new Date().toLocaleTimeString();
            const parsed = Object.fromEntries(
                Object.entries(payload)
                    .filter(([k]) => !EXCLUDED_KEYS.includes(k))
                    .map(([k, v]) => [k, isNaN(v) ? v : Number(v)])
            );

            setSensors(prev => {
                const sensor = prev[sensorId];
                if (!sensor) return prev;

                const keys = sensor.dataKeys.length > 0
                    ? sensor.dataKeys
                    : Object.keys(parsed);

                const activeKeys = sensor.activeKeys.length > 0
                    ? sensor.activeKeys
                    : keys;

                const newPoint = { timestamp, ...parsed };
                const updated = [...sensor.data, newPoint];

                return {
                    ...prev,
                    [sensorId]: {
                        data: updated.length > MAX_POINTS ? updated.slice(-MAX_POINTS) : updated,
                        dataKeys: keys,
                        activeKeys,
                    }
                };
            });
        };

        socketRef.current.on('sensor_update', globalListener);

        return () => {
            socketRef.current.off('sensor_update', globalListener);
            socketRef.current.disconnect();
        };
    }, []);

    const handleToggleSensor = (sensorId) => {
        // ✅ Normalizar _id del device a string al momento de seleccionar
        const id = String(sensorId);
        const isSelected = selectedIds.includes(id);

        if (isSelected) {
            socketRef.current.emit('leave_sensor_room', id);
            setSelectedIds(prev => prev.filter(s => s !== id));
            setSensors(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        } else {
            socketRef.current.emit('join_sensor_room', id);
            setSelectedIds(prev => [...prev, id]);
            setSensors(prev => ({
                ...prev,
                [id]: { data: [], dataKeys: [], activeKeys: [] }
            }));
        }
    };

    const handleToggleKey = (sensorId, key) => {
        setSensors(prev => {
            const sensor = prev[sensorId];
            if (!sensor) return prev;
            const activeKeys = sensor.activeKeys.includes(key)
                ? sensor.activeKeys.filter(k => k !== key)
                : [...sensor.activeKeys, key];
            return { ...prev, [sensorId]: { ...sensor, activeKeys } };
        });
    };

    const toggleSensorCollapse = (sensorId) => {
        setCollapsedSensors(prev => ({
            ...prev,
            [sensorId]: !prev[sensorId]
        }));
    };

    const handleSelectSensorMobile = (sensorId) => {
        setActiveSensorMobile(sensorId);
        setMobileMenuOpen(false);
        const element = document.getElementById(`sensor-${sensorId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="p-6">
                    <SensorSelector selectedIds={selectedIds} onToggle={handleToggleSensor} />
                </CardContent>
            </Card>

            {selectedIds.length === 0 && (
                <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                        Seleccione uno o más sensores para comenzar a visualizar datos.
                    </CardContent>
                </Card>
            )}

            {selectedIds.length > 1 && (
                <div className="lg:hidden">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="w-full flex items-center justify-between p-3 bg-card border rounded-md"
                    >
                        <span className="flex items-center gap-2">
                            <Menu className="w-4 h-4" />
                            Ver sensor
                        </span>
                        <span className="text-sm text-muted-foreground">
                            {activeSensorMobile || selectedIds[0]}
                        </span>
                    </button>

                    {mobileMenuOpen && (
                        <div className="fixed inset-0 z-50 lg:hidden">
                            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
                            <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-lg p-4 max-h-[60vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold">Sensors</h3>
                                    <button onClick={() => setMobileMenuOpen(false)}>
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {selectedIds.map(id => (
                                        <button
                                            key={id}
                                            onClick={() => handleSelectSensorMobile(id)}
                                            className={`w-full text-left p-3 rounded-md ${
                                                activeSensorMobile === id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                            }`}
                                        >
                                            {id}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedIds.map(sensorId => {
                const sensor = sensors[sensorId];
                if (!sensor) return null;
                const { data, dataKeys, activeKeys } = sensor;
                const lastPoint = data.length > 0 ? data[data.length - 1] : null;
                const isCollapsed = collapsedSensors[sensorId];

                return (
                    <div key={sensorId} id={`sensor-${sensorId}`} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => toggleSensorCollapse(sensorId)}
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                            >
                                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                <span className="font-mono">{sensorId}</span>
                            </button>
                        </div>
                        
                        {!isCollapsed && (
                            <SensorStatsCards
                                dataKeys={dataKeys}
                                lastPoint={lastPoint}
                                activeKeys={activeKeys}
                                onToggleKey={(key) => handleToggleKey(sensorId, key)}
                            />
                        )}
                        <RealtimeChart
                            data={data}
                            dataKeys={activeKeys}
                            sensorId={sensorId}
                        />
                    </div>
                );
            })}
        </div>
    );
};