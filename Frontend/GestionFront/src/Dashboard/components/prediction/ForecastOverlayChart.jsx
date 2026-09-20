import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { CONTENDER_COLORS } from './forecastColors';

// Overlay temporal: real vs cada contendiente (variable elegida).
export const ForecastOverlayChart = ({ series, variable = 'shortwave_radiation', height = 320 }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !series || !series.time) return;
    const traces = [{
      x: series.time,
      y: (series.real?.[variable] || []),
      type: 'scatter',
      mode: 'lines',
      name: 'real (ERA5)',
      line: { color: '#111827', width: 2 },
    }];
    Object.entries(series.contendientes || {}).forEach(([c, vars]) => {
      if (!vars?.[variable]) return;
      traces.push({
        x: series.time,
        y: vars[variable],
        type: 'scatter',
        mode: 'lines',
        name: c,
        line: { color: CONTENDER_COLORS[c] || '#6b7280', width: 1.5 },
      });
    });
    Plotly.purge(ref.current);
    Plotly.newPlot(ref.current, traces, {
      xaxis: { title: 'Hora', automargin: true, tickfont: { size: 9 } },
      yaxis: { title: variable, automargin: true },
      margin: { l: 60, r: 20, t: 20, b: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      height,
      legend: { orientation: 'h', y: -0.3, x: 0.5, xanchor: 'center' },
    }, { responsive: true, displaylogo: false });
  }, [series, variable, height]);
  if (!series || !series.time) return <p className="text-sm text-muted-foreground">Sin serie de ejemplo.</p>;
  return <div ref={ref} className="w-full" />;
};
