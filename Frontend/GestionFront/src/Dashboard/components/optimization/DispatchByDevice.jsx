import { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Plotly from 'plotly.js-dist-min';
import { DEVICE_DEFINITIONS, getDispatchChartInfo } from '@/Dashboard/components/diagram/constants/deviceTypes';

const EXTRA_COLORS = {
  curtailment: '#f97316',
  ENS: '#dc2626',
  ens: '#dc2626',
};

export const DispatchByDevice = ({ dispatchPlan, diagramNodes, scenarios, totalHours = 24 }) => {
  const { t } = useTranslation();
  const chartRef = useRef(null);
  const TYPE_LABELS = {
    solar: t('deviceTypes.solar'), diesel: t('deviceTypes.diesel'), wind: t('deviceTypes.wind'),
    grid_import: t('deviceTypes.grid_import'), grid_export: t('deviceTypes.grid_export'),
    battery_charge: t('deviceTypes.battery_charge'), battery_discharge: t('deviceTypes.battery_discharge'),
    load: t('deviceTypes.load'), curtailment: t('deviceTypes.curtailment'), ENS: t('deviceTypes.ens'), ens: t('deviceTypes.ens'),
  };

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
          color: colors[primaryType] || EXTRA_COLORS[primaryType] || '#f59e0b',
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
      meta.grid = { label: t('deviceTypes.grid'), color: colors.grid_import || '#10b981' };
    }

    return meta;
  }, [dispatchPlan, diagramNodes, t]);

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
        if (entries.length === 0) return 0;
        let sum = 0;
        for (const e of entries) {
          sum += e.device_type === 'load' ? Math.abs(e.power_kw) : e.power_kw;
        }
        return Math.round(sum * 1000) / 1000;
      });

      return {
        x: hours,
        y,
        type: 'scatter',
        mode: 'lines+markers',
        name: meta.label,
        line: { color: meta.color, width: 2 },
        marker: { size: 5 },
        connectgaps: true,
      };
    });

    const layout = {
      xaxis: { title: t('charts.hour'), dtick: 1, automargin: true },
      yaxis: {
        title: t('charts.power'),
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

    if (chartRef.current._hasPlotted) {
      Plotly.react(chartRef.current, traces, layout, {
        responsive: false,
        displaylogo: false,
      });
    } else {
      Plotly.newPlot(chartRef.current, traces, layout, {
        responsive: false,
        displaylogo: false,
      });
      chartRef.current._hasPlotted = true;
    }

    const el = chartRef.current;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (el) Plotly.Plots.resize(el); });
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [dispatchPlan, deviceMeta, scenarios, totalHours, t]);

  if (!dispatchPlan || dispatchPlan.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">{t('charts.dispatchByDevice')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('charts.dispatchByDeviceEmpty')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm" style={{ overflowAnchor: 'none', contain: 'layout' }}>
      <h3 className="font-semibold text-lg mb-4">{t('charts.dispatchByDevice')}</h3>
      <div ref={chartRef} className="w-full" style={{ minHeight: 420 }} />
    </div>
  );
};
