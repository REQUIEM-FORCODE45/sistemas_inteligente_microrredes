import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { CONTENDER_COLORS } from './forecastColors';

export const ForecastMaeChart = ({ detalle, height = 320 }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !detalle || detalle.length === 0) return;
    const conts = [...new Set(detalle.map(r => r.contendiente))];
    const traces = conts.map(c => {
      const rows = detalle.filter(r => r.contendiente === c && r.variable === 'shortwave_radiation')
        .sort((a, b) => parseFloat(a.horizonte_h) - parseFloat(b.horizonte_h));
      return {
        x: rows.map(r => r.horizonte_h),
        y: rows.map(r => parseFloat(r.mae)),
        type: 'scatter',
        mode: 'lines+markers',
        name: c,
        line: { color: CONTENDER_COLORS[c] || '#6b7280' },
        marker: { size: 5 },
      };
    });
    Plotly.purge(ref.current);
    Plotly.newPlot(ref.current, traces, {
      xaxis: { title: 'Horizonte (h)', automargin: true },
      yaxis: { title: 'MAE GHI', automargin: true },
      margin: { l: 60, r: 20, t: 20, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      height,
      legend: { orientation: 'h', y: -0.25, x: 0.5, xanchor: 'center' },
    }, { responsive: true, displaylogo: false });
  }, [detalle, height]);
  if (!detalle || detalle.length === 0) return <p className="text-sm text-muted-foreground">Sin datos.</p>;
  return <div ref={ref} className="w-full" />;
};
