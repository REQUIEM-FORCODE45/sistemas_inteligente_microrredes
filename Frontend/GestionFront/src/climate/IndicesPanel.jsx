import { useMemo } from 'react';
import ClimateChart from './ClimateChart';

// A2+A3: cajas Nino 1+2/3/3.4/4 + panel de 11 series con roles.
const CAJAS = [
  { key: 'nino12', label: 'Niño 1+2', color: '#ef6c00' },
  { key: 'nino3', label: 'Niño 3', color: '#d32f2f' },
  { key: 'nino34', label: 'Niño 3.4', color: '#7b1fa2' },
  { key: 'nino4', label: 'Niño 4 ★ predictor local', color: '#1565c0' },
];
const RESTO = [
  { key: 'soi', label: 'SOI', color: '#00838f' },
  { key: 'pdo', label: 'PDO', color: '#546e7a' },
  { key: 'mei', label: 'MEI v2', color: '#6a1b9a' },
  { key: 'tni', label: 'TNI (derivado)', color: '#2e7d32' },
  { key: 'ep_cp', label: 'EP−CP (derivado)', color: '#795548' },
];

export default function IndicesPanel({ indices }) {
  const cajas = useMemo(() => {
    if (!indices?.mes) return [];
    return CAJAS.map((c) => ({
      x: indices.mes, y: indices[c.key], type: 'scatter', mode: 'lines',
      name: c.label, line: { color: c.color, width: 1.8 }, connectgaps: false,
    }));
  }, [indices]);
  const resto = useMemo(() => {
    if (!indices?.mes) return [];
    return RESTO.map((c) => ({
      x: indices.mes, y: indices[c.key], type: 'scatter', mode: 'lines',
      name: c.label, line: { color: c.color, width: 1.5 }, connectgaps: false,
    }));
  }, [indices]);
  if (!indices?.mes) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-1">A2 · Pacífico: cajas Niño 1+2/3/3.4/4</h3>
        <p className="text-xs text-muted-foreground mb-4">ERSSTv5 · anomalías · Niño 4 manda en Pasto (r=−0.23)</p>
        <ClimateChart data={cajas} layout={{ xaxis: { title: 'Mes' }, yaxis: { title: 'Anomalía (°C)', zeroline: true } }} height={300} testId="chart-a2-nino" />
      </div>
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-1">A3 · 11 índices + roles</h3>
        <p className="text-xs text-muted-foreground mb-4">etiqueta: RONI · predictor local: Niño 4 · resto: contexto</p>
        <ClimateChart data={resto} layout={{ xaxis: { title: 'Mes' }, yaxis: { title: 'Índice', zeroline: true } }} height={300} testId="chart-a3-indices" />
      </div>
    </div>
  );
}
