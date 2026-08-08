import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

export const BatterySOCChart = ({ socEvolution, totalHours = 24 }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !socEvolution || Object.keys(socEvolution).length === 0) return;

    const hours = Array.from({ length: totalHours }, (_, i) => i + 1);
    const traces = [];

    Object.entries(socEvolution).forEach(([batId, entries], bi) => {
      const colors = ['#8b5cf6', '#06b6d4', '#f59e0b'];
      entries.forEach((entry) => {
        traces.push({
          x: hours,
          y: entry.soc_kwh,
          type: 'scatter',
          mode: 'lines+markers',
          name: `${batId} (${entry.scenario})`,
          line: { color: colors[bi % colors.length], width: 2 },
          marker: { size: 5 },
        });
      });
    });

    const layout = {
      // sin title interno: el <h3> React titula (evita colision leyenda/titulo)
      xaxis: { title: 'Hora', dtick: 1, automargin: true },
      yaxis: { title: 'SOC (kWh)', automargin: true },
      margin: { l: 60, r: 20, t: 30, b: 75 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      legend: {
        orientation: 'h',
        y: -0.28,
        x: 0.5,
        xanchor: 'center',
        font: { size: 11 },
      },
      height: 320,
    };

    Plotly.react(chartRef.current, traces, layout, {
      responsive: true,
      displaylogo: false,
    });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, [socEvolution, totalHours]);

  if (!socEvolution || Object.keys(socEvolution).length === 0) {
    return null;
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Estado de Carga — Baterias</h3>
      <div ref={chartRef} className="w-full" />
    </div>
  );
};
