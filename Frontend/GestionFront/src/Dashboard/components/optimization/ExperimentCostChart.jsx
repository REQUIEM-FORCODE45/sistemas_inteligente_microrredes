import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

export const ExperimentCostChart = ({ cumulative }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !cumulative || cumulative.length === 0) return;
    const keys = Object.keys(cumulative[0] || {}).filter(k => k !== '' && k !== 'undefined');
    const colors = { smpc: '#2563eb', dmpc: '#16a34a', heur: '#dc2626', oracle: '#9333ea' };
    const x = cumulative.map(r => r[''] || r['index'] || '');
    const traces = keys.map(k => ({
      x,
      y: cumulative.map(r => parseFloat(String(r[k]).replace(/,/g, '')) || 0),
      type: 'scatter',
      mode: 'lines+markers',
      name: k,
      line: { color: colors[k] || '#6b7280' },
      marker: { size: 4 },
    }));
    Plotly.purge(ref.current);
    Plotly.newPlot(ref.current, traces, {
      xaxis: { title: 'Día', automargin: true },
      yaxis: { title: 'Costo acumulado (COP)', automargin: true },
      margin: { l: 60, r: 20, t: 20, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      height: 320,
      legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
    }, { responsive: true, displaylogo: false });
  }, [cumulative]);
  if (!cumulative || cumulative.length === 0) return <p className="text-sm text-muted-foreground">Sin datos de costo acumulado.</p>;
  return <div ref={ref} className="w-full" />;
};
