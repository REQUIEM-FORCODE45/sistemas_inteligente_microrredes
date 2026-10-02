import { useMemo } from 'react';
import ClimateChart from './ClimateChart';
import { dataSpan, sliceSeries } from './window';

// A1: ONI y RONI superpuestos, recortados al tramo con dato (ventana adaptativa:
// 1950->hoy; nunca tramo vacio). Se ve la brecha; 15% meses en distinto modo.
export default function OniChart({ indices }) {
  const { data, span } = useMemo(() => {
    if (!indices?.mes) return { data: [], span: null };
    const span = dataSpan(indices.mes, indices, ['oni', 'roni']);
    const s = sliceSeries(indices.mes, indices, ['oni', 'roni'], span);
    return {
      span,
      data: [
        {
          x: s.mes, y: s.oni, type: 'scatter', mode: 'lines',
          name: 'ONI', line: { color: '#D32F2F', width: 2 }, connectgaps: false,
        },
        {
          x: s.mes, y: s.roni, type: 'scatter', mode: 'lines',
          name: 'RONI', line: { color: '#1565C0', width: 2 }, connectgaps: false,
        },
      ],
    };
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
  const ventana = span ? `${span.x0.slice(0, 7)} → ${span.x1.slice(0, 7)}` : '';
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-1">A1 · ONI y RONI ({ventana})</h3>
      <p className="text-xs text-muted-foreground mb-4">CPC/NOAA · bandas ±0.5 °C · ventana adaptada al dato</p>
      <ClimateChart data={data} layout={layout} height={300} testId="chart-a1-oni" />
    </div>
  );
}
