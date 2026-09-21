import { CONTENDER_COLORS } from './forecastColors';

// N/A explícitos (Cambio 03): el 0.00 del MOS en cloud/precip es pass-through
// del NWP comparado contra sí mismo (se lee como "modelo perfecto"); las filas
// ausentes del crudo (DNI/DHI/precip) se marcan "—".
const MOS_PASS_THROUGH = new Set(['cloud_cover', 'precipitation']);
const isNaCell = (contendiente, variable) =>
  contendiente === 'mos' && MOS_PASS_THROUGH.has(variable);

const ALL_CONTENDERS = ['mos', 'patchtst', 'ecmwf_crudo', 'persistence', 'climatology', 'arima'];

export const ForecastMetricsTable = ({ detalle, horizon, variable }) => {
  if (!detalle || detalle.length === 0) return <p className="text-sm text-muted-foreground">Sin datos de comparativa.</p>;
  const rows = detalle.filter(r => String(r.horizonte_h) === String(horizon) && r.variable === variable);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin filas para ese horizonte/variable.</p>;
  // Combinaciones sin filas (p.ej. crudo sin DNI/DHI/precip): "—" explícito.
  const present = new Set(rows.map(r => r.contendiente));
  rows.push(...ALL_CONTENDERS.filter(c => !present.has(c) && detalle.some(r => r.contendiente === c))
    .map(c => ({ contendiente: c, __missing: true })));
  const sorted = [...rows]
    .filter(r => !isNaCell(r.contendiente, r.variable))
    .sort((a, b) => parseFloat(a.mae) - parseFloat(b.mae));
  const naRows = rows.filter(r => isNaCell(r.contendiente, r.variable));
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
        {rows.filter(r => r.__missing).map((r) => (
          <tr key={r.contendiente} className="border-b last:border-0 text-muted-foreground">
            <td className="py-1 pr-2 font-medium" title="Sin datos para esta combinación">
              <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: CONTENDER_COLORS[r.contendiente] || '#6b7280' }} />
              {r.contendiente}
            </td>
            <td className="py-1 pr-2 text-right">—</td>
            <td className="py-1 pr-2 text-right">—</td>
            <td className="py-1 text-right">—</td>
          </tr>
        ))}
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
        {naRows.map((r) => (
          <tr key={r.contendiente} className="border-b last:border-0 text-muted-foreground">
            <td className="py-1 pr-2 font-medium" title="pass-through del NWP; no evaluable en este backtest">
              <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: CONTENDER_COLORS[r.contendiente] || '#6b7280' }} />
              {r.contendiente}
            </td>
            <td className="py-1 pr-2 text-right" title="pass-through del NWP; no evaluable en este backtest">N/A</td>
            <td className="py-1 pr-2 text-right">—</td>
            <td className="py-1 text-right">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
