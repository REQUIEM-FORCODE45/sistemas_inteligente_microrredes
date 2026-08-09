import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { RealtimeChart } from './RealtimeChart';
import { SensorSelector } from './SensorSelector';
import { SensorPanel, SingleLineChart } from './components';
import { CHART_MODES } from './hooks/useChartOptions';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Menu, X } from 'lucide-react';
import GridAPI from '@/api/grid-api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const DEFAULT_HISTORY = 20;
const HISTORY_OPTIONS = [20, 50, 100, 200, 500];
const EXCLUDED_KEYS = ['createAt', '_id', 'sensorId', 'timestamp'];

export const RealtimeView = () => {
    const [selectedIds, setSelectedIds] = useState([]);
    const [sensors, setSensors] = useState({});
    const [chartOptions, setChartOptions] = useState({});
    const [historyLimits, setHistoryLimits] = useState({});
    const [collapsedSensors, setCollapsedSensors] = useState({});
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeSensorMobile, setActiveSensorMobile] = useState(null);
    const socketRef = useRef(null);
    const selectedIdsRef = useRef([]);


    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);

    useEffect(() => {
        console.log('Connecting to socket at:', SOCKET_URL);
        const token = localStorage.getItem('sensor_token');
        socketRef.current = io(SOCKET_URL, { auth: { token } });

        const globalListener = (payload) => {
            // ✅ Normalizar _id del payload a string para comparar correctamente
            const sensorId = String(payload._id);

            if (!selectedIdsRef.current.includes(sensorId)) return;

            const timestamp = new Date();
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
                // Buffer dinamico: cada sensor conserva SU historial elegido
                // (bufferSize); si no se definio, usa el default.
                const cap = sensor.bufferSize || DEFAULT_HISTORY;

                return {
                    ...prev,
                    [sensorId]: {
                        ...sensor,
                        data: updated.length > cap ? updated.slice(-cap) : updated,
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

    const handleToggleSensor = async (sensorId) => {
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

            let initialData = [];
            let dataKeys = [];

            const historyLimit = historyLimits[id] || DEFAULT_HISTORY;

            try {
                const response = await GridAPI.get(`/front/sensors_data/${id}/${historyLimit}`);
                if (response.data.success && response.data.data.length > 0) {
                    const historicalData = response.data.data.reverse();
                    initialData = historicalData.map(item => {
                        // Fecha COMPLETA como Date: con historiales de varios
                        // dias el eje X no debe superponer horas de dias distintos.
                        const timestamp = item.createAt
                            ? new Date(item.createAt)
                            : new Date();
                        const parsed = Object.fromEntries(
                            Object.entries(item)
                                .filter(([k]) => !EXCLUDED_KEYS.includes(k))
                                .map(([k, v]) => [k, isNaN(v) ? v : Number(v)])
                        );
                        return { timestamp, ...parsed };
                    });
                    dataKeys = Object.keys(initialData[0] || {}).filter(k => k !== 'timestamp');
                }
            } catch (error) {
                console.error('Error loading historical data:', error);
            }

            setSensors(prev => ({
                ...prev,
                [id]: {
                    data: initialData,
                    dataKeys,
                    activeKeys: dataKeys,
                    bufferSize: historyLimit,
                }
            }));

            setChartOptions(prev => ({
                ...prev,
                [id]: {
                    chartMode: CHART_MODES.COMBINED,
                    separatedKeys: dataKeys,
                }
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

    const handleHistoryChange = async (sensorId, limit) => {
        const id = String(sensorId);
        setHistoryLimits(prev => ({ ...prev, [id]: limit }));
        try {
            const response = await GridAPI.get(`/front/sensors_data/${id}/${limit}`);
            if (response.data.success && response.data.data.length > 0) {
                const historicalData = response.data.data.reverse();
                const newData = historicalData.map(item => {
                    // Fecha COMPLETA como Date (igual que la carga inicial).
                    const timestamp = item.createAt
                        ? new Date(item.createAt)
                        : new Date();
                    const parsed = Object.fromEntries(
                        Object.entries(item)
                            .filter(([k]) => !EXCLUDED_KEYS.includes(k))
                            .map(([k, v]) => [k, isNaN(v) ? v : Number(v)])
                    );
                    return { timestamp, ...parsed };
                });
                setSensors(prev => {
                    const sensor = prev[id];
                    if (!sensor) return prev;
                    return { ...prev, [id]: { ...sensor, data: newData, bufferSize: limit } };
                });
            }
        } catch (error) {
            console.error('Error cargando historial:', error);
        }
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
                                            className={`w-full text-left p-3 rounded-md ${activeSensorMobile === id ? 'bg-primary text-primary-foreground' : 'bg-muted'
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

                const options = chartOptions[sensorId] || {
                    chartMode: CHART_MODES.COMBINED,
                    separatedKeys: dataKeys || [],
                };

                const handleSetChartMode = (mode) => {
                    setChartOptions(prev => {
                        const current = prev[sensorId] || { separatedKeys: dataKeys || [], chartMode: CHART_MODES.COMBINED };
                        if (mode === CHART_MODES.SEPARATED && (!current.separatedKeys || current.separatedKeys.length === 0)) {
                            return {
                                ...prev,
                                [sensorId]: { ...current, chartMode: mode, separatedKeys: dataKeys }
                            };
                        }
                        return {
                            ...prev,
                            [sensorId]: { ...current, chartMode: mode }
                        };
                    });
                };

                const handleToggleSeparatedKey = (key) => {
                    setChartOptions(prev => {
                        const current = prev[sensorId] || { separatedKeys: dataKeys || [] };
                        const keys = current.separatedKeys || dataKeys || [];
                        const newKeys = keys.includes(key)
                            ? keys.filter(k => k !== key)
                            : [...keys, key];
                        return {
                            ...prev,
                            [sensorId]: { ...current, separatedKeys: newKeys }
                        };
                    });
                };

                const handleSelectAllSeparated = (keys) => {
                    setChartOptions(prev => ({
                        ...prev,
                        [sensorId]: { ...(prev[sensorId] || { separatedKeys: dataKeys || [] }), separatedKeys: keys }
                    }));
                };

                const handleClearSeparated = () => {
                    setChartOptions(prev => ({
                        ...prev,
                        [sensorId]: { ...(prev[sensorId] || { separatedKeys: dataKeys || [] }), separatedKeys: [] }
                    }));
                };

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
                            {!isCollapsed && (
                                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span>Historial:</span>
                                    <select
                                        value={historyLimits[sensorId] || DEFAULT_HISTORY}
                                        onChange={(e) => handleHistoryChange(sensorId, Number(e.target.value))}
                                        className="px-2 py-1 text-[11px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                                    >
                                        {HISTORY_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>{opt} pts</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>

                        {!isCollapsed && (
                            <>
                                <SensorPanel
                                    dataKeys={dataKeys}
                                    lastPoint={lastPoint}
                                    activeKeys={activeKeys}
                                    onToggleKey={(key) => {
                                        if (options.chartMode === CHART_MODES.SEPARATED) {
                                            handleToggleSeparatedKey(key);
                                        } else {
                                            handleToggleKey(sensorId, key);
                                        }
                                    }}
                                    chartMode={options.chartMode}
                                    onModeChange={handleSetChartMode}
                                    separatedKeys={options.separatedKeys}
                                    onToggleSeparatedKey={handleToggleSeparatedKey}
                                    onSelectAllSeparated={handleSelectAllSeparated}
                                    onClearAll={handleClearSeparated}
                                />
                                {options.chartMode === CHART_MODES.COMBINED ? (
                                    <RealtimeChart
                                        data={data}
                                        dataKeys={activeKeys}
                                        sensorId={sensorId}
                                    />
                                ) : (
                                    <div className="grid gap-3">
                                        {options.separatedKeys.map((key, index) => {
                                            const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
                                            return (
                                                <SingleLineChart
                                                    key={key}
                                                    data={data}
                                                    dataKey={key}
                                                    sensorId={sensorId}
                                                    color={COLORS[index % COLORS.length]}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
