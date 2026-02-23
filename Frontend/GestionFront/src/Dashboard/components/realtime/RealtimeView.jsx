import { useState, useEffect } from 'react';
import { RealtimeChart } from './RealtimeChart';
import { SensorSelector } from './SensorSelector';
import { SensorStatsCards } from './SensorStatsCards';
import { Card, CardContent } from '@/components/ui/card';

// Mock data - replace with real-time data fetching
const generateMockData = () => {
    const now = new Date();
    return Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(now.getTime() - (10 - i) * 1000).toLocaleTimeString(),
        v: (220 + Math.random() * 5).toFixed(2),
        c: (1.5 + Math.random() * 0.5).toFixed(2),
        p: (330 + Math.random() * 10).toFixed(2),
        e: (1.2 + Math.random() * 0.1).toFixed(3),
        f: (60 + Math.random() * 0.1).toFixed(2),
        pf: (0.95 + Math.random() * 0.02).toFixed(3),
    }));
};

export const RealtimeView = () => {
    const [selectedSensor, setSelectedSensor] = useState(null);
    const [data, setData] = useState([]);
    const dataKeys = ['v', 'c', 'p', 'e', 'f', 'pf'];

    useEffect(() => {
        if (selectedSensor) {
            // TODO: Replace with real-time data fetching (e.g., WebSocket or polling)
            const interval = setInterval(() => {
                setData(generateMockData());
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [selectedSensor]);

    const handleSensorSelect = (sensorId) => {
        setSelectedSensor(sensorId);
        setData([]); // Clear previous data
    };

    const lastPoint = data.length > 0 ? data[data.length - 1] : null;

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="p-6">
                    <SensorSelector selected={selectedSensor} onSelect={handleSensorSelect} />
                </CardContent>
            </Card>

            {selectedSensor ? (
                <div className="space-y-6">
                    <SensorStatsCards dataKeys={dataKeys} lastPoint={lastPoint} />
                    <RealtimeChart data={data} dataKeys={dataKeys} sensorId={selectedSensor} />
                </div>
            ) : (
                <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                        Seleccione un sensor para comenzar a visualizar datos.
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
