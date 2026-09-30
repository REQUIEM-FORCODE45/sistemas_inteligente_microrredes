import { useMemo } from 'react';
import ClimateChart from './ClimateChart';

// A1: ONI y RONI superpuestos 1950->hoy (se ve la brecha; 15% meses distinto modo).
export default function OniChart({ indices }) {
  const data = useMemo(() => {
    if (!indices?.mes) return [];
    return [
      {
        x: indices.mes, y: indices.oni, type: 'scatter', mode: 'lines',
        name: 'ONI', line: { color: '#D32F2F', width: 2 }, connectgaps: false,
      },
      {
        x: indices.mes, y: indices.roni, type: 'scatter', mode: 'lines',
        name: 'RONI', line: { color: '#1565C0', width: 2 }, connectgaps: false,
      },
    ];
  }, [indices]);
  const layout = useMemo(() => ({
    xaxis: { title: 'Mes', automargin: true },
    yaxis: { title: 'Anomalía (°C)', zeroline: true, automargin: true },
    shapes: [
      { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: 0.5, y1: 3, fillcolor: '#ffcdd2', opacity: 0.25, line: { width: 0 } },
      { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: -3, y1: -0.5, fillcolor: '#bbdefb', opacity: 0.25, line: { width: 0 } },
    ],
  }), []);
  if (!data.length) return null;
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-1">A1 · ONI y RONI (1950→hoy)</h3>
      <p className="text-xs text-muted-foreground mb-4">CPC/NOAA · bandas ±0.5 °C · null = sin dato</p>
      <ClimateChart data={data} layout={layout} height={300} testId="chart-a1-oni" />
    </div>
  );
}
