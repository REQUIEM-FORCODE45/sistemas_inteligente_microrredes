import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

// Grafica climatica a tamano completo (C3) con interaccion pro.
// De PlotlyMini reutiliza SOLO el patron purge -> newPlot -> resize.
// Minimos duras/C3 §3.7 y auditoria: >=380x260 en escritorio (>=640x480 el
// mapa); en movil (>=375 px) la altura baja y el ancho lo manda el contenedor.
// Sin modales, sin sparkline, con la barra de herramientas al hover.
const BAR = {
  displaylogo: false,
  displayModeBar: 'hover',
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines'],
  responsive: true,
};

function niceTick(dtick, fmt) {
  return dtick ? { dtick, tickformat: fmt } : { tickformat: fmt };
}

export default function ClimateChart({ data, layout = {}, height = 300, minWidth = 380, compact = false, testId }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !data || (Array.isArray(data) && data.length === 0)) return;
    const xaxis = { showgrid: true, gridcolor: 'rgba(148,163,184,0.18)', automargin: true, ...(layout.xaxis || {}) };
    const yaxis = { showgrid: true, gridcolor: 'rgba(148,163,184,0.18)', automargin: true, zeroline: true, zerolinecolor: 'rgba(148,163,184,0.4)', ...(layout.yaxis || {}) };
    // Eje temporal legible: el backend manda 'YYYY-MM-01'; los ticks se
    // formatean por ventana (anio en series largas, mes-anio en recientes).
    if (xaxis?.title === 'Mes') {
      const n = Array.isArray(data?.[0]?.x) ? data[0].x.length : 0;
      Object.assign(xaxis, niceTick(n > 120 ? 'M24' : n > 36 ? 'M12' : 'M6', n > 36 ? '%Y' : '%b %Y'));
    }
    const base = {
      margin: { l: 56, r: 16, t: 12, b: 64 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11, family: 'Inter, system-ui, sans-serif' },
      showlegend: true,
      legend: { orientation: 'h', y: -0.28, x: 0.5, xanchor: 'center', font: { size: 11 } },
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#0f172a', bordercolor: '#334155', font: { color: '#f1f5f9', size: 11 } },
      height,
      transition: { duration: 350, easing: 'cubic-in-out' },
      ...layout,
      xaxis,
      yaxis,
    };
    try {
      Plotly.purge(el);
      Plotly.newPlot(el, data, base, BAR);
    } catch (e) {
      console.error('[ClimateChart] fallo al graficar:', e);
    }
  }, [data, layout, height]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (el) Plotly.Plots.resize(el); });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      if (el) Plotly.purge(el);
    };
  }, []);

  return (
    <div ref={ref} data-testid={testId} className="w-full max-w-full overflow-hidden" style={{ minWidth: compact ? 0 : minWidth, minHeight: compact ? 240 : 260 }} />
  );
}
