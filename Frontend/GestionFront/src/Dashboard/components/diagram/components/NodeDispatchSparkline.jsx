import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { getDispatchChartInfo } from '@/Dashboard/components/diagram/constants/deviceTypes';

export default function NodeDispatchSparkline({ dispatchPlan, nodeId, totalHours = 24, scenario = '' }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !dispatchPlan || dispatchPlan.length === 0) return;

    const hours = Array.from({ length: totalHours }, (_, i) => i + 1);

    const scenarioPlan = scenario
      ? dispatchPlan.filter((d) => d.scenario === scenario)
      : dispatchPlan;

    const nodeEntries = scenarioPlan.filter((d) => d.device_id === nodeId);

    if (nodeEntries.length === 0) return;

    const deviceTypes = [...new Set(nodeEntries.map((d) => d.device_type))];
    const { colors, labels } = getDispatchChartInfo();

    const traces = deviceTypes.map((type) => {
      const y = hours.map((h) => {
        const entry = nodeEntries.find((d) => d.hour === h && d.device_type === type);
        // 0 (no null): horas sin entrada se dibujan como cero, no como hueco.
        return entry ? Math.abs(entry.power_kw) : 0;
      });

      return {
        x: hours,
        y,
        type: 'scatter',
        mode: 'lines+markers',
        name: labels[type] || type,
        line: { color: colors[type] || '#94a3b8', width: 2 },
        marker: { size: 4 },
        connectgaps: false,
      };
    });

    const layout = {
      showlegend: deviceTypes.length > 1,
      legend: { orientation: 'h', y: -0.3, font: { size: 9 } },
      xaxis: { title: 'Hora', dtick: 4, tickfont: { size: 9 } },
      yaxis: { title: 'kW', tickfont: { size: 9 } },
      margin: { l: 40, r: 10, t: 10, b: 35 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b' },
      height: 180,
    };

    Plotly.react(chartRef.current, traces, layout, { responsive: true });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, [dispatchPlan, nodeId, totalHours, scenario]);

  if (!dispatchPlan || dispatchPlan.length === 0) return null;

  return (
    <div className="w-full">
      <div ref={chartRef} />
    </div>
  );
}
