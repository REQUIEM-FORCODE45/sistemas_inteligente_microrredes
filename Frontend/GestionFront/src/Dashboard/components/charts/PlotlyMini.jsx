import { useEffect, useMemo, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

// Mini-grafica Plotly reutilizable (dashboard).
// REGLA DE ORO: un solo grafico por div -> antes de cada dibujo se hace
// Plotly.purge(el). Asi NUNCA se acumulan graficas "montadas" sobre el mismo
// contenedor (sintoma reportado: muchas graficas apiladas).
const DEFAULT_LAYOUT = {
  margin: { l: 30, r: 4, t: 8, b: 4 },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#64748b', size: 9 },
  xaxis: { showticklabels: false, showgrid: false },
  yaxis: { tickfont: { size: 8 }, showgrid: false },
  showlegend: false,
  autosize: true,
};

export default function PlotlyMini({ data, layout = {}, height = 110 }) {
  const ref = useRef(null);
  const merged = useMemo(() => ({ ...DEFAULT_LAYOUT, height, ...layout }), [layout, height]);

  // dibujo: purge + newPlot SIEMPRE (elimina cualquier acumulacion previa)
  useEffect(() => {
    const el = ref.current;
    if (!el || !data || (Array.isArray(data) && data.length === 0)) return;
    try {
      Plotly.purge(el);
      Plotly.newPlot(el, data, merged, { displaylogo: false, responsive: true });
      console.log(`[PlotlyMini] graficado: ${Array.isArray(data) ? data.length : 0} traza(s)`);
    } catch (e) {
      console.error('[PlotlyMini] fallo al graficar:', e);
    }
  }, [data, merged]);

  // responsive + limpieza final al desmontar
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el) Plotly.Plots.resize(el);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (el) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} className="w-full" style={{ minHeight: height }} />;
}
