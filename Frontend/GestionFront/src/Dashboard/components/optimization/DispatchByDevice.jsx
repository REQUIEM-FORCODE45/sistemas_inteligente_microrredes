import { useRef, useEffect, useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import { DEVICE_DEFINITIONS, getDispatchChartInfo } from '@/Dashboard/components/diagram/constants/deviceTypes';

const GENERATION_TYPES = new Set(['solar', 'diesel', 'grid_import', 'battery_discharge']);
const CONSUMPTION_TYPES = new Set(['grid_export', 'battery_charge', 'load']);

export const DispatchByDevice = ({ dispatchPlan, diagramNodes, scenarios, totalHours = 24 }) => {
  const chartRef = useRef(null);

  const deviceMeta = useMemo(() => {
    const { colors } = getDispatchChartInfo();
    const meta = {};

    if (diagramNodes) {
      for (const n of diagramNodes) {
        const def = DEVICE_DEFINITIONS[n.data?.deviceType];
        const primary = def?.dispatchTypes?.[0];
        meta[n.id] = {
          label: n.data?.label || n.id,
          color: primary?.color || colors.solar || '#f59e0b',
        };
      }
    }

    if (!meta.grid) {
      meta.grid = { label: 'Red Eléctrica', color: colors.grid_import || '#10b981' };
    }

    return meta;
  }, [diagramNodes]);

  useEffect(() => {
    if (!chartRef.current || !dispatchPlan || dispatchPlan.length === 0) return;

    const hours = Array.from({ length: totalHours }, (_, i) => i + 1);

    const scenarioNames = scenarios && scenarios.length > 0
      ? scenarios.map((s) => s.name)
      : [...new Set(dispatchPlan.map((d) => d.scenario))];
    const activeScenario = scenarioNames[0] || 'Soleado';

    const scenarioPlan = dispatchPlan.filter((d) => d.scenario === activeScenario);

    const deviceIds = [...new Set(scenarioPlan.map((d) => d.device_id))];

    const traces = deviceIds.map((did) => {
      const meta = deviceMeta[did] || { label: did, color: '#94a3b8' };

      const y = hours.map((h) => {
        const entries = scenarioPlan.filter((d) => d.hour === h && d.device_id === did);
        if (entries.length === 0) return null;

        let net = 0;
        for (const e of entries) {
          if (GENERATION_TYPES.has(e.device_type)) {
            net += Math.abs(e.power_kw);
          } else if (CONSUMPTION_TYPES.has(e.device_type)) {
            net -= Math.abs(e.power_kw);
          } else {
            net += Math.abs(e.power_kw);
          }
        }
        return Math.round(net * 1000) / 1000;
      });

      return {
        x: hours,
        y,
        type: 'scatter',
        mode: 'lines+markers',
        name: meta.label,
        line: { color: meta.color, width: 2 },
        marker: { size: 5 },
        connectgaps: false,
      };
    });

    const layout = {
      title: 'Plan Despacho por Generador',
      xaxis: { title: 'Hora', dtick: 1 },
      yaxis: { title: 'Potencia (kW)', zeroline: true, zerolinecolor: '#64748b', zerolinewidth: 1 },
      margin: { l: 50, r: 20, t: 40, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b' },
      legend: { orientation: 'h', y: 1.15, font: { size: 9 } },
      height: 420,
    };

    Plotly.react(chartRef.current, traces, layout, { responsive: true });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);

    return () => observer.disconnect();
  }, [dispatchPlan, deviceMeta, scenarios, totalHours]);

  if (!dispatchPlan || dispatchPlan.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">Plan Despacho por Generador</h3>
        <p className="text-muted-foreground text-sm">
          Ejecuta una optimizacion para ver el despacho individual de cada generador.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Plan Despacho por Generador</h3>
      <div ref={chartRef} className="w-full" />
    </div>
  );
};
