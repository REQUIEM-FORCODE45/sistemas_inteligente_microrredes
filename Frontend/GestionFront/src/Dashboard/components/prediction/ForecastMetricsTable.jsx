import { CONTENDER_COLORS } from './forecastColors';

export const ForecastMetricsTable = ({ detalle, horizon, variable }) => {
  if (!detalle || detalle.length === 0) return <p className="text-sm text-muted-foreground">Sin datos de comparativa.</p>;
  const rows = detalle.filter(r => String(r.horizonte_h) === String(horizon) && r.variable === variable);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin filas para ese horizonte/variable.</p>;
  const sorted = [...rows].sort((a, b) => parseFloat(a.mae) - parseFloat(b.mae));
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground border-b">
          <th className="py-1 pr-2">Contendiente</th>
          <th className="py-1 pr-2 text-right">MAE</th>
          <th className="py-1 pr-2 text-right">RMSE</th>
          <th className="py-1 text-right">Bias</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.contendiente} className="border-b last:border-0">
            <td className="py-1 pr-2 font-medium">
              <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: CONTENDER_COLORS[r.contendiente] || '#6b7280' }} />
              {i === 0 ? '★ ' : ''}{r.contendiente}
            </td>
            <td className="py-1 pr-2 text-right">{parseFloat(r.mae).toFixed(2)}</td>
            <td className="py-1 pr-2 text-right">{parseFloat(r.rmse).toFixed(2)}</td>
            <td className="py-1 text-right">{parseFloat(r.bias).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
