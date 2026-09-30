import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

// Grafica climatica a tamano completo (C3).
// De PlotlyMini reutiliza SOLO el patron purge -> newPlot -> resize.
// Minimos duros §3.7: lineas >=380x260. Nada en modales, nada con sparkline.
export default function ClimateChart({ data, layout = {}, height = 300, minWidth = 380, testId }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !data || (Array.isArray(data) && data.length === 0)) return;
    const merged = {
      margin: { l: 56, r: 16, t: 12, b: 64 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      showlegend: true,
      legend: { orientation: 'h', y: -0.28, x: 0.5, xanchor: 'center', font: { size: 11 } },
      height,
      ...layout,
    };
    try {
      Plotly.purge(el);
      Plotly.newPlot(el, data, merged, { displaylogo: false, displayModeBar: false, responsive: true });
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

  return <div ref={ref} data-testid={testId} className="w-full" style={{ minWidth, minHeight: 260 }} />;
}
