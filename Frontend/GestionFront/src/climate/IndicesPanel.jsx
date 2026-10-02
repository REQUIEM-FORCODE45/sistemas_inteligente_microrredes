import { useMemo, useState } from 'react';
import ClimateChart from './ClimateChart';
import { dataSpan, recentSpan, sliceSeries } from './window';

// A2+A3 con ventana adaptativa (nunca tramo vacio).
// A2: cajas Nino 1+2/3/3.4/4, 1950->hoy.
// A3: panel reciente (ultimos 36 meses con dato, como la referencia), no 1854->.
const CAJAS = [
  { key: 'nino12', label: 'Niño 1+2', color: '#ef6c00' },
  { key: 'nino3', label: 'Niño 3', color: '#d32f2f' },
  { key: 'nino34', label: 'Niño 3.4', color: '#7b1fa2' },
  { key: 'nino4', label: 'Niño 4 ★ predictor local', color: '#1565c0' },
];
const RESTO = [
  { key: 'soi', label: 'SOI', unidad: 'índice', color: '#00838f', rol: 'contexto' },
  { key: 'pdo', label: 'PDO', unidad: 'índice', color: '#546e7a', rol: 'contexto' },
  { key: 'mei', label: 'MEI v2', unidad: 'índice', color: '#6a1b9a', rol: 'contexto' },
  { key: 'tni', label: 'TNI (Niño1+2 − Niño4)', unidad: '°C', color: '#2e7d32', rol: 'derivado' },
  { key: 'ep_cp', label: 'EP−CP (Niño3 − Niño4)', unidad: '°C', color: '#795548', rol: 'derivado' },
];

const CAJAS_KEYS = CAJAS.map((c) => c.key);

export default function IndicesPanel({ indices }) {
  const [sel, setSel] = useState('soi');
  const [modo, setModo] = useState('todo');
  const def = RESTO.find((c) => c.key === sel) || RESTO[0];
  const { cajas, serie, ventA2, ventA3 } = useMemo(() => {
    if (!indices?.mes) return { cajas: [], serie: [], ventA2: null, ventA3: null };
    const d = RESTO.find((c) => c.key === sel) || RESTO[0];
    const span2 = dataSpan(indices.mes, indices, CAJAS_KEYS);
    const s2 = sliceSeries(indices.mes, indices, CAJAS_KEYS, span2);
    const span3 = modo === 'todo'
      ? dataSpan(indices.mes, indices, [d.key])
      : recentSpan(indices.mes, indices, [d.key], 36);
    const s3 = sliceSeries(indices.mes, indices, [d.key], span3);
    const n = s3[d.key]?.filter((v) => v !== null && v !== undefined).length ?? 0;
    return {
      ventA2: span2, ventA3: { ...span3, n },
      cajas: CAJAS.map((c) => ({
        x: s2.mes, y: s2[c.key], type: 'scatter', mode: 'lines',
        name: c.label, line: { color: c.color, width: 1.8 }, connectgaps: false,
      })),
      serie: [{
        x: s3.mes, y: s3[d.key], type: 'scatter', mode: 'lines',
        name: d.label, line: { color: d.color, width: 2 }, connectgaps: false,
      }],
    };
  }, [indices, sel, modo]);
  if (!indices?.mes) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-1">A2 · Pacífico: cajas Niño 1+2/3/3.4/4 ({ventA2?.x0.slice(0, 7)} → {ventA2?.x1.slice(0, 7)})</h3>
        <p className="text-xs text-muted-foreground mb-4">ERSSTv5 · anomalías · Niño 4 manda en Pasto (r=−0.23)</p>
        <ClimateChart data={cajas} layout={{ xaxis: { title: 'Mes' }, yaxis: { title: 'Anomalía (°C)', zeroline: true } }} height={300} testId="chart-a2-nino" />
      </div>
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="font-semibold text-lg">A3 · {def.label}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="select-a3"
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="px-3 py-1 text-sm font-semibold rounded-lg border bg-background hover:bg-accent"
            >
              {RESTO.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <div data-testid="toggle-a3" className="flex gap-1">
              {[{ k: 'todo', t: 'Todo' }, { k: 'reciente', t: 'Reciente' }].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setModo(o.k)}
                  className={`px-3 py-1 text-xs font-bold rounded-full border ${modo === o.k ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">rol: {def.rol} · {ventA3?.x0.slice(0, 7)} → {ventA3?.x1.slice(0, 7)} · {ventA3?.n} meses</p>
        <ClimateChart data={serie} layout={{ xaxis: { title: 'Mes' }, yaxis: { title: `${def.label} (${def.unidad})`, zeroline: true } }} height={300} testId="chart-a3-indices" />
      </div>
    </div>
  );
}
