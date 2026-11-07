import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Plotly from 'plotly.js-dist-min';
import { getDispatchChartInfo } from '@/Dashboard/components/diagram/constants/deviceTypes';

export const DispatchSchedule = ({ dispatchPlan, scenarios, totalHours = 24 }) => {
  const { t } = useTranslation();
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !dispatchPlan || dispatchPlan.length === 0) return;

    const hours = Array.from({ length: totalHours }, (_, i) => i + 1);

    const scenarioNames = scenarios && scenarios.length > 0
      ? scenarios.map((s) => s.name)
      : [...new Set(dispatchPlan.map((d) => d.scenario))];
    const activeScenario = scenarioNames[0] || 'Soleado';

    const scenarioPlan = dispatchPlan.filter((d) => d.scenario === activeScenario);

    // La carga es demanda a suplir, no suministro: fuera del stack (no
    // infla la pila) y se dibuja aparte como barra azul translucida en un
    // eje espejo, para compararla contra la altura de los demas potencias.
    const { colors, labels } = getDispatchChartInfo();
    const deviceTypes = [...new Set(
      scenarioPlan.map((d) => d.device_type).filter((t) => t !== 'load'))];
    const loadTrace = (() => {
      const y = hours.map((h) => scenarioPlan
        .filter((d) => d.hour === h && d.device_type === 'load')
        .reduce((sum, d) => sum + Math.abs(d.power_kw), 0));
      const anyLoad = y.some((v) => v > 0.001);
      return anyLoad ? {
        x: hours, y,
        type: 'bar', name: labels['load'] || 'Carga',
        marker: { color: 'rgba(59, 130, 246, 0.35)' },
        // Subplot propio (x2,y2) superpuesto: el stack solo apila los
        // suministros del subplot principal; la carga queda encima sin
        // sumarse ni desapilar a los demas.
        xaxis: 'x2', yaxis: 'y2', width: 0.6,
      } : null;
    })();
    const seriesByType = {};
    const traces = deviceTypes.map((type) => {
      const y = hours.map((h) => {
        return scenarioPlan
          .filter((d) => d.hour === h && d.device_type === type)
          .reduce((sum, d) => sum + Math.abs(d.power_kw), 0);
      });
      seriesByType[type] = y;

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

    // Misma escala en los dos ejes: el maximo comun (pila vs carga) con
    // 8 % de margen; sin esto el eje de la carga se auto-ajusta y parece
    // que falta energia aunque la pila la cubra.
    const loadY = loadTrace ? loadTrace.y : hours.map(() => 0);
    const stackY = hours.map((_, i) => deviceTypes
      .reduce((sum, t) => sum + (seriesByType[t]?.[i] || 0), 0));
    const maxY = Math.max(1, ...stackY, ...loadY) * 1.08;
    const layout = {
      barmode: 'stack',
      xaxis: { title: t('charts.hour'), dtick: 1, automargin: true },
      yaxis: { title: t('charts.power'), automargin: true, range: [0, maxY] },
      // Espejo para la carga: MISMO rango fijo que el principal, sin
      // ticklabels; overlay no infla y la comparacion es 1:1.
      xaxis2: { overlaying: 'x', matches: 'x', showticklabels: false,
                showgrid: false, zeroline: false, automargin: false,
                showline: false },
      yaxis2: { overlaying: 'y', side: 'right', showticklabels: false,
                showgrid: false, zeroline: false, automargin: false,
                range: [0, maxY], title: null, showline: false },
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
      bargap: 0.15,
      height: 380,
    };

    const allTraces = loadTrace ? [...traces, loadTrace] : traces;
    // barmode stack SIEMPRE: la carga vive en su subplot (x2,y2), no apila.
    if (chartRef.current._hasPlotted) {
      Plotly.react(chartRef.current, allTraces,
        { ...layout, barmode: 'stack' },
        { responsive: false, displaylogo: false });
    } else {
      Plotly.newPlot(chartRef.current, allTraces,
        { ...layout, barmode: 'stack' },
        { responsive: false, displaylogo: false });
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
      if (el) Plotly.purge(el);
    };
  }, [dispatchPlan, scenarios, totalHours, t]);

  if (!dispatchPlan || dispatchPlan.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">{t('charts.dispatchSchedule')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('charts.dispatchScheduleEmpty')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm" style={{ overflowAnchor: 'none', contain: 'layout' }}>
      <h3 className="font-semibold text-lg mb-4">{t('charts.dispatchSchedule')}</h3>
      <div ref={chartRef} className="w-full" style={{ minHeight: 380 }} />
    </div>
  );
};
