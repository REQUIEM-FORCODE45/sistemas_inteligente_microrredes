import { useRef, useEffect, useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import { DEVICE_DEFINITIONS, getDispatchChartInfo } from '@/Dashboard/components/diagram/constants/deviceTypes';

const GENERATION_TYPES = new Set(['solar', 'diesel', 'grid_import', 'battery_discharge']);
const CONSUMPTION_TYPES = new Set(['grid_export', 'battery_charge', 'load']);

// nombre legible por device_type cuando el id del plan no coincide con un nodo
const TYPE_LABELS = {
  solar: 'Solar', diesel: 'Diésel', wind: 'Eólica',
  grid_import: 'Red (import)', grid_export: 'Red (export)',
  battery_charge: 'Batería (carga)', battery_discharge: 'Batería (descarga)',
  load: 'Carga',
};

export const DispatchByDevice = ({ dispatchPlan, diagramNodes, scenarios, totalHours = 24 }) => {
  const chartRef = useRef(null);

  // Colores/labels POR device_id del plan: se resuelven desde el device_type
  // primario de sus entradas (no desde el id del nodo del diagrama, que puede
  // no coincidir -> era la causa del "todo gris").
  const deviceMeta = useMemo(() => {
    const { colors } = getDispatchChartInfo();
    const meta = {};

    if (dispatchPlan) {
      for (const did of [...new Set(dispatchPlan.map((d) => d.device_id))]) {
        const entries = dispatchPlan.filter((d) => d.device_id === did);
        const counts = {};
        for (const e of entries) counts[e.device_type] = (counts[e.device_type] || 0) + 1;
        const primaryType = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        meta[did] = {
          label: TYPE_LABELS[primaryType] || did,
          color: colors[primaryType] || '#f59e0b',
        };
      }
    }

    // si el id coincide con un nodo del diagrama, usa su nombre/color
    if (diagramNodes) {
      for (const n of diagramNodes) {
        const def = DEVICE_DEFINITIONS[n.data?.deviceType];
        const primary = def?.dispatchTypes?.[0];
        if (meta[n.id]) {
          meta[n.id].label = n.data?.label || meta[n.id].label;
          if (primary?.color) meta[n.id].color = primary.color;
        }
      }
    }

    if (!meta.grid) {
      meta.grid = { label: 'Red Eléctrica', color: colors.grid_import || '#10b981' };
    }

    return meta;
  }, [dispatchPlan, diagramNodes]);

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
      const meta = deviceMeta[did] || { label: did, color: '#f59e0b' };

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
      // sin title interno: el <h3> React titula (evita colision con la leyenda)
      xaxis: { title: 'Hora', dtick: 1, automargin: true },
      yaxis: {
        title: 'Potencia (kW)',
        zeroline: true,
        zerolinecolor: '#64748b',
        zerolinewidth: 1,
        automargin: true,
      },
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
      height: 420,
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
