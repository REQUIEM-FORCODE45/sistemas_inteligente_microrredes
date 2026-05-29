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

    const totalEntries = dispatchPlan.length;
    const uniqueDeviceIds = [...new Set(dispatchPlan.map((d) => d.device_id))].length;

    const layout = {
      barmode: 'stack',
      title: `Plan de Despacho 24h — ${uniqueDeviceIds} equipos, ${totalEntries} registros`,
      xaxis: { title: 'Hora', dtick: 1 },
      yaxis: { title: 'Potencia (kW)' },
      margin: { l: 50, r: 20, t: 40, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b' },
      legend: { orientation: 'h', y: 1.12 },
      bargap: 0.15,
      height: 380,
    };

    Plotly.purge(chartRef.current);
    Plotly.newPlot(chartRef.current, traces, layout, { responsive: true });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      if (chartRef.current) Plotly.purge(chartRef.current);
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
