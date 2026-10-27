import { useEffect, useMemo, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

// Mini-grafica Plotly reutilizable (dashboard).
// Cambio 19 (C1): diffing con Plotly.react en cada actualizacion; purge SOLO
// al desmontar (antes: purge + newPlot siempre -> parpadeo y micro-cortes).
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

  // dibujo: diffing via Plotly.react (sin destruir el canvas)
  useEffect(() => {
    const el = ref.current;
    if (!el || !data || (Array.isArray(data) && data.length === 0)) return;
    try {
      Plotly.react(el, data, merged, {
        displaylogo: false,
        displayModeBar: false,
        responsive: true,
      });
    } catch (e) {
      console.error('[PlotlyMini] fallo al graficar:', e);
    }
  }, [data, merged]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
  }, []);

  return <div ref={ref} className="w-full" style={{ minHeight: height }} />;
}
