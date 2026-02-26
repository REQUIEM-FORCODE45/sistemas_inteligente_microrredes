import { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const KEY_LABELS = {
    v: 'Voltaje', c: 'Corriente', p: 'Potencia',
    e: 'Energía', f: 'Frecuencia', pf: 'Factor Potencia',
};

export const RealtimeChart = ({ data, dataKeys, sensorId }) => {
    const containerRef = useRef(null);
    const [chartWidth, setChartWidth] = useState(600);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            setChartWidth(entries[0].contentRect.width);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <Card className="border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-base font-bold">Gráfica en Tiempo Real</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Sensor: <span className="font-mono text-primary">{sensorId}</span>
                    </p>
                </div>
                <Badge variant="success" className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                    En vivo
                </Badge>
            </CardHeader>
            <CardContent>
                <div ref={containerRef} style={{ width: '100%' }}>
                    <LineChart width={chartWidth} height={300} data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend formatter={(value) => KEY_LABELS[value] || value} />
                        {dataKeys.map((key, i) => (
                            <Line
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={COLORS[i % COLORS.length]}
                                dot={false}
                                strokeWidth={2}
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                </div>
            </CardContent>
        </Card>
    );
};