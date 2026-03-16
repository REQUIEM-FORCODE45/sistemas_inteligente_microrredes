import { useRef, useEffect, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const KEY_LABELS = {
    v: { label: 'Voltaje', unit: 'V' },
    c: { label: 'Corriente', unit: 'A' },
    p: { label: 'Potencia', unit: 'W' },
    e: { label: 'Energía', unit: 'kWh' },
    f: { label: 'Frecuencia', unit: 'Hz' },
    pf: { label: 'Factor Potencia', unit: '' },
};

export const SingleLineChart = ({ data, dataKey, color }) => {
    const containerRef = useRef(null);
    const plotRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

    const meta = KEY_LABELS[dataKey] || { label: dataKey.toUpperCase(), unit: '' };

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

        const trace = {
            x: data.map(d => d.timestamp),
            y: data.map(d => d[dataKey]),
            type: 'scatter',
            mode: 'lines',
            name: meta.label,
            line: { color, width: 2 },
            fill: 'tozeroy',
            fillcolor: `${color}20`,
        };

        const isMobile = dimensions.width < 640;
        
        const layout = {
            width: dimensions.width,
            height: isMobile ? 180 : dimensions.height,
            autosize: false,
            margin: { l: 50, r: 10, t: 20, b: isMobile ? 50 : 30 },
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
                title: isMobile ? '' : meta.unit,
                tickfont: { size: 10 },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
            },
            showlegend: false,
        };

        const config = {
            responsive: false,
            displayModeBar: false,
        };

        Plotly.react(plotRef.current, [trace], layout, config);
    }, [data, dataKey, color, dimensions, meta]);

    return (
        <Card className="border shadow-sm">
            <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    {meta.label}
                    {meta.unit && <span className="text-xs text-muted-foreground font-normal">({meta.unit})</span>}
                </CardTitle>
            </CardHeader>
            <CardContent className="py-0 px-3 pb-3">
                <div ref={containerRef} style={{ width: '100%' }}>
                    <div ref={plotRef} />
                </div>
            </CardContent>
        </Card>
    );
};
