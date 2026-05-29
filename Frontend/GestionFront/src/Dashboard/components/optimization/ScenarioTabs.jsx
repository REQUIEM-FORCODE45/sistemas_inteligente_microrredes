import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

export const ScenarioTabs = ({ scenarioResults }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !scenarioResults || Object.keys(scenarioResults).length === 0) return;

    const names = Object.keys(scenarioResults);
    const probabilities = names.map((n) => scenarioResults[n].probability * 100);
    const powers = names.map((n) => scenarioResults[n].total_power_kw);

    const traces = [
      {
        x: names,
        y: probabilities,
        type: 'bar',
        name: 'Probabilidad (%)',
        marker: { color: '#3b82f6' },
        yaxis: 'y',
      },
      {
        x: names,
        y: powers,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Potencia total (kW)',
        marker: { color: '#f59e0b', size: 10 },
        line: { color: '#f59e0b', width: 2 },
        yaxis: 'y2',
      },
    ];

    const layout = {
      title: 'Escenarios Estocasticos',
      xaxis: { title: 'Escenario' },
      yaxis: { title: 'Probabilidad (%)', side: 'left' },
      yaxis2: { title: 'Potencia (kW)', overlaying: 'y', side: 'right' },
      margin: { l: 50, r: 60, t: 40, b: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b' },
      legend: { orientation: 'h', y: 1.12 },
      height: 300,
    };

    Plotly.react(chartRef.current, traces, layout, { responsive: true });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, [scenarioResults]);

  if (!scenarioResults || Object.keys(scenarioResults).length === 0) {
    return null;
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Escenarios Estocasticos</h3>
      <div ref={chartRef} className="w-full" />
    </div>
  );
};
