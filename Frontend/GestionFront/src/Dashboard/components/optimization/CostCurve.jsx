import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

export const CostCurve = ({ costBreakdown }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !costBreakdown?.hourly || costBreakdown.hourly.length === 0) return;

    const hourly = costBreakdown.hourly;

    const scenarioNames = [...new Set(hourly.map((h) => h.scenario))];
    const activeScenario = scenarioNames[0] || 'Soleado';

    const scenarioData = hourly.filter((h) => h.scenario === activeScenario);

    const hours = scenarioData.map((h) => h.hour);
    const costs = scenarioData.map((h) => h.cost);
    const weighted = scenarioData.map((h) => h.weighted_cost);

    const traces = [
      {
        x: hours,
        y: costs,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Costo horario',
        line: { color: '#3b82f6', width: 2 },
        marker: { size: 6 },
      },
      {
        x: hours,
        y: weighted,
        type: 'scatter',
        mode: 'lines',
        name: 'Costo ponderado',
        line: { color: '#f59e0b', width: 1.5, dash: 'dot' },
      },
    ];

    const totalCost = costs.reduce((a, b) => a + b, 0);

    const layout = {
      title: `Costo Total de Operacion: $${totalCost.toFixed(2)}`,
      xaxis: { title: 'Hora', dtick: 1 },
      yaxis: { title: 'Costo (u.m.)' },
      margin: { l: 50, r: 20, t: 45, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b' },
      legend: { orientation: 'h', y: 1.12 },
      height: 320,
    };

    Plotly.react(chartRef.current, traces, layout, { responsive: true });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, [costBreakdown]);

  if (!costBreakdown?.hourly || costBreakdown.hourly.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">Costo de Operacion</h3>
        <p className="text-muted-foreground text-sm">
          Sin datos de costo. Ejecuta una optimizacion.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Costo de Operacion</h3>
      <div ref={chartRef} className="w-full" />
    </div>
  );
};
