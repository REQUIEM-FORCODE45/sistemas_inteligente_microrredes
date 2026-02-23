import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    LineChart, Line, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const KEY_LABELS = {
    v: 'Voltaje', c: 'Corriente', p: 'Potencia',
    e: 'Energía', f: 'Frecuencia', pf: 'Factor Potencia',
};

export const RealtimeChart = ({ data, dataKeys, sensorId }) => {
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
                {data.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground italic text-sm">
                        Esperando datos del sensor...
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '8px',
                                    border: '1px solid hsl(var(--border))',
                                    backgroundColor: 'hsl(var(--card))',
                                    color: 'hsl(var(--foreground))'
                                }}
                            />
                            <Legend
                                formatter={(value) => KEY_LABELS[value] || value}
                            />
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
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
};