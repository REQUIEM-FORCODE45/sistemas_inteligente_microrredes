// Ventana adaptativa: recorta cada grafico al tramo donde SI hay dato,
// para que nunca quede una parte vacia (regla del modulo /clima).
// La fuente (endpoint) sigue trayendo los null historicos: son la verdad.
export function dataSpan(mes, series, keys) {
  let i0 = mes.length, i1 = -1;
  for (const k of keys) {
    const v = series[k];
    if (!v) continue;
    const first = v.findIndex((x) => x !== null && x !== undefined);
    let last = -1;
    for (let i = v.length - 1; i >= 0; i--) {
      if (v[i] !== null && v[i] !== undefined) { last = i; break; }
    }
    if (first !== -1) { i0 = Math.min(i0, first); i1 = Math.max(i1, last); }
  }
  if (i1 < 0) return { i0: 0, i1: mes.length - 1, x0: mes[0], x1: mes[mes.length - 1] };
  return { i0, i1, x0: mes[i0], x1: mes[i1] };
}

// Ventana reciente adaptativa: ultimos N meses con dato en al menos una serie.
export function recentSpan(mes, series, keys, months = 36) {
  const full = dataSpan(mes, series, keys);
  const i1 = full.i1;
  let count = 0, i0 = i1;
  for (let i = i1; i >= 0 && count < months; i--) {
    if (keys.some((k) => series[k]?.[i] !== null && series[k]?.[i] !== undefined)) count++;
    i0 = i;
  }
  const lo = dataSpan(mes, series, keys).i0;
  i0 = Math.max(i0, lo);
  return { i0, i1, x0: mes[i0], x1: mes[i1] };
}

// Recorta x + cada serie a [i0, i1].
export function sliceSeries(mes, series, keys, span) {
  const out = { mes: mes.slice(span.i0, span.i1 + 1) };
  for (const k of keys) {
    out[k] = series[k] ? series[k].slice(span.i0, span.i1 + 1) : null;
  }
  return out;
}
