import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { getDispatchChartInfo } from '@/Dashboard/components/diagram/constants/deviceTypes';

export const DispatchSchedule = ({ dispatchPlan, scenarios, totalHours = 24 }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !dispatchPlan || dispatchPlan.length === 0) return;

    const hours = Array.from({ length: totalHours }, (_, i) => i + 1);

    const scenarioNames = scenarios && scenarios.length > 0
      ? scenarios.map((s) => s.name)
      : [...new Set(dispatchPlan.map((d) => d.scenario))];
    const activeScenario = scenarioNames[0] || 'Soleado';

    const scenarioPlan = dispatchPlan.filter((d) => d.scenario === activeScenario);

    const deviceTypes = [...new Set(scenarioPlan.map((d) => d.device_type))];
    const { colors, labels } = getDispatchChartInfo();

    const traces = deviceTypes.map((type) => {
      const y = hours.map((h) => {
        return scenarioPlan
          .filter((d) => d.hour === h && d.device_type === type)
          .reduce((sum, d) => sum + Math.abs(d.power_kw), 0);
      });

      return {
        x: hours,
        y,
        type: 'bar',
        name: labels[type] || type,
        marker: {
          color: colors[type] || '#9ca3af',
        },
      };
    });

    const layout = {
      barmode: 'stack',
      // sin title interno (el <h3> React ya titula): evita doble titulo y la
      // colision leyenda/titulo con margin.t pequeno.
      xaxis: { title: 'Hora', dtick: 1, automargin: true },
      yaxis: { title: 'Potencia (kW)', automargin: true },
      margin: { l: 60, r: 20, t: 30, b: 75 },   // b: espacio para la leyenda abajo
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
      bargap: 0.15,
      height: 380,
    };

    Plotly.purge(chartRef.current);
    Plotly.newPlot(chartRef.current, traces, layout, {
      responsive: true,
      displaylogo: false,
    });

    const el = chartRef.current;
    const observer = new ResizeObserver(() => {
      if (el) Plotly.Plots.resize(el);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (el) Plotly.purge(el);
    };
  }, [dispatchPlan, scenarios, totalHours]);

  if (!dispatchPlan || dispatchPlan.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">Plan de Despacho</h3>
        <p className="text-muted-foreground text-sm">
          Ejecuta una optimizacion para ver el plan de despacho de las proximas 24 horas.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Plan de Despacho 24h</h3>
      <div ref={chartRef} className="w-full" />
    </div>
  );
};
