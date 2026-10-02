import { useMemo, useState } from 'react';
import ClimateChart from './ClimateChart';

// A5: mapa de calor de Narino. Rejilla ERA5 28 km servida por /front/climate/geo:
// celdas fuera del poligono GADM = null (hueco, nunca inventado).
// Dos capas conmutables: superficie de nubosidad y teleconexion Nino 4.
// Ventana y rango de color adaptativos al dato (nada fijo a mano).
const CAPAS = [
  { key: 'nubosidad', label: 'Nubosidad media', colorscale: 'Blues', reverse: true },
  { key: 'teleconexion_nino4', label: 'Teleconexión Niño 4 ↔ nubes (r)', colorscale: 'RdBu', zmid: 0 },
];

export default function ZoneMap({ geo, sitio }) {
  const [capa, setCapa] = useState('nubosidad');
  const def = CAPAS.find((c) => c.key === capa);
  const data = useMemo(() => {
    if (!geo?.lat) return [];
    const c = geo.capas?.[capa];
    if (!c) return [];
    const traces = [{
      x: geo.lon, y: geo.lat, z: c.valor, type: 'heatmap',
      colorscale: def.colorscale, reversescale: !!def.reverse,
      zmin: c.rango?.[0], zmax: c.rango?.[1],
      ...(def.zmid !== undefined ? { zmid: def.zmid } : {}),
      colorbar: { title: c.unidad },
      hovertemplate: 'lon %{x:.2f}<br>lat %{y:.2f}<br>' + `${def.label}: %{z}<extra></extra>`,
      name: def.label,
    }];
    // Borde: UN solo trace (anillos unidos con null) + encuadre al bbox.
    const bx = [], by = [];
    (geo.poligono || []).forEach((ring) => {
      ring.forEach((p) => { bx.push(p[0]); by.push(p[1]); });
      bx.push(null); by.push(null);
    });
    traces.push({
      x: bx, y: by, type: 'scatter', mode: 'lines',
      name: 'Nariño (GADM)', line: { color: '#212121', width: 1.5 },
      hoverinfo: 'skip',
    });
    if (sitio?.lat && sitio?.lon) {
      traces.push({
        x: [sitio.lon], y: [sitio.lat], type: 'scatter', mode: 'markers+text',
        name: 'Pasto (sitio)', marker: { color: '#D32F2F', size: 12, symbol: 'star' },
        text: ['Pasto'], textposition: 'top right',
        hovertemplate: `Pasto ${sitio.lat}, ${sitio.lon}<extra></extra>`,
      });
    }
    return traces;
  }, [geo, sitio, capa, def]);
  const layout = useMemo(() => {
    let xrange, yrange;
    if (geo?.poligono?.length) {
      const xs = geo.poligono.flat().map((p) => p[0]);
      const ys = geo.poligono.flat().map((p) => p[1]);
      const m = 0.35;
      xrange = [Math.min(...xs) - m, Math.max(...xs) + m];
      yrange = [Math.min(...ys) - m, Math.max(...ys) + m];
    }
    return {
      // constrain:'domain': con scaleanchor 1:1 el area se encajona en vez de
      // expandir los rangos (sin esto Plotly estira x a -85..-70).
      xaxis: { title: 'Longitud', constrain: 'domain', ...(xrange ? { range: xrange } : {}) },
      yaxis: { title: 'Latitud', scaleanchor: 'x', scaleratio: 1, constrain: 'domain', ...(yrange ? { range: yrange } : {}) },
      height: 480,
    };
  }, [geo]);
  if (!geo?.lat) return null;
  const periodo = geo.periodo_efectivo ? ` · ${geo.periodo_efectivo}` : '';
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="font-semibold text-lg">A5 · Mapa de calor de Nariño — {def.label}</h3>
        <div className="flex gap-2">
          {CAPAS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCapa(c.key)}
              className={`px-3 py-1 text-xs font-bold rounded-full border ${capa === c.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">ERA5 vía Open-Meteo · rejilla {geo.rejilla_grados}° · {geo.n_celdas} celdas{periodo}</p>
      <ClimateChart data={data} layout={layout} height={480} minWidth={640} testId="map-a5-narino" />
    </div>
  );
}
