import { useRef, useEffect, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const KEY_LABELS = {
    v: 'Voltaje', c: 'Corriente', p: 'Potencia',
    e: 'Energía', f: 'Frecuencia', pf: 'Factor Potencia',
};

export const RealtimeChart = ({ data, dataKeys, sensorId }) => {
    const containerRef = useRef(null);
    const plotRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 600, height: 300 });

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const { width } = entries[0].contentRect;
            setDimensions(prev => ({ ...prev, width }));
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!plotRef.current || !data || data.length === 0) return;

        const traces = dataKeys.map((key, i) => ({
            x: data.map(d => d.timestamp),
            y: data.map(d => d[key]),
            type: 'scatter',
            mode: 'lines',
            name: KEY_LABELS[key] || key,
            line: { color: COLORS[i % COLORS.length], width: 2 },
        }));

        const isMobile = dimensions.width < 640;
        
        const layout = {
            width: dimensions.width,
            height: isMobile ? 250 : dimensions.height,
            autosize: false,
            margin: { l: 50, r: 10, t: isMobile ? 20 : 50, b: isMobile ? 60 : 40 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: {
                title: isMobile ? '' : 'Tiempo',
                tickfont: { size: 10 },
                gridcolor: '#e2e8f0',
                tickmode: 'linear',
                dtick: Math.ceil(data.length / 4),
            },
            yaxis: {
                title: isMobile ? '' : 'Valor',
                tickfont: { size: 10 },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
            },
            showlegend: true,
            legend: {
                orientation: 'h',
                y: isMobile ? -0.4 : 1.1,
                x: 0.5,
                xanchor: 'center',
            },
        };

        const config = {
            responsive: false,
            displayModeBar: false,
        };

        Plotly.react(plotRef.current, traces, layout, config);
    }, [data, dataKeys, dimensions]);

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
                    <div ref={plotRef} />
                </div>
            </CardContent>
        </Card>
    );
};
