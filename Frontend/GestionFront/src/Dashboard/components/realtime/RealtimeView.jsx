import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { RealtimeChart } from './RealtimeChart';
import { SensorSelector } from './SensorSelector';
import { SensorStatsCards } from './SensorStatsCards';
import { Card, CardContent } from '@/components/ui/card';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const MAX_POINTS = 20;
const EXCLUDED_KEYS = ['createAt', '_id', 'sensorId', 'timestamp'];

export const RealtimeView = () => {
    const [selectedIds, setSelectedIds] = useState([]);
    const [sensors, setSensors] = useState({});
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

            {selectedIds.map(sensorId => {
                const sensor = sensors[sensorId];
                if (!sensor) return null;
                const { data, dataKeys, activeKeys } = sensor;
                const lastPoint = data.length > 0 ? data[data.length - 1] : null;

                return (
                    <div key={sensorId} className="space-y-3">
                        <SensorStatsCards
                            dataKeys={dataKeys}
                            lastPoint={lastPoint}
                            activeKeys={activeKeys}
                            onToggleKey={(key) => handleToggleKey(sensorId, key)}
                        />
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