import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { CONTENDER_COLORS } from './forecastColors';

// Barras agrupadas: MAE por variable a 24 h (o el horizonte dado).
export const ForecastSkillChart = ({ detalle, horizon = 24, height = 320 }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !detalle || detalle.length === 0) return;
    const rows = detalle.filter(r => String(r.horizonte_h) === String(horizon));
    const variables = [...new Set(rows.map(r => r.variable))];
    const conts = [...new Set(rows.map(r => r.contendiente))];
    const data = conts.map((c, i) => ({
      x: variables,
      y: variables.map(v => {
        const r = rows.find(q => q.contendiente === c && q.variable === v);
        return r ? parseFloat(r.mae) : 0;
      }),
      type: 'bar',
      name: c,
      marker: { color: CONTENDER_COLORS[c] || '#6b7280' },
      offsetgroup: i,
    }));
    Plotly.purge(ref.current);
    Plotly.newPlot(ref.current, data, {
      barmode: 'group',
      xaxis: { title: `MAE por variable (h=${horizon})`, automargin: true, tickangle: -25, tickfont: { size: 9 } },
      yaxis: { title: 'MAE', automargin: true },
      margin: { l: 60, r: 20, t: 20, b: 90 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      height,
      legend: { orientation: 'h', y: -0.35, x: 0.5, xanchor: 'center' },
    }, { responsive: true, displaylogo: false });
  }, [detalle, horizon, height]);
  if (!detalle || detalle.length === 0) return <p className="text-sm text-muted-foreground">Sin datos.</p>;
  return <div ref={ref} className="w-full" />;
};
