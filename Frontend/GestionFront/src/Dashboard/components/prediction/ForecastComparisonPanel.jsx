import { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { useForecastComparison } from './hooks/useForecastComparison';
import { ForecastMetricsTable } from './ForecastMetricsTable';
import { ForecastMaeChart } from './ForecastMaeChart';
import { ForecastSkillChart } from './ForecastSkillChart';
import { ForecastOverlayChart } from './ForecastOverlayChart';

const VARIABLES = ['shortwave_radiation', 'direct_normal_irradiance', 'diffuse_radiation',
  'temperature_2m', 'relative_humidity_2m', 'cloud_cover',
  'wind_speed_100m', 'wind_speed_10m', 'surface_pressure', 'precipitation'];
const HORIZONS = ['1', '6', '12', '24', '48', '72'];

export const ForecastComparisonPanel = ({ variant = 'side' }) => {
  const { fc, fetchSummary, fetchSeries, fetchStatus, run } = useForecastComparison();
  const [tab, setTab] = useState('metrics');
  const [horizon, setHorizon] = useState('24');
  const [variable, setVariable] = useState('shortwave_radiation');
  const [loading, setLoading] = useState(false);
  const isFull = variant === 'full';

  useEffect(() => { fetchSummary(); fetchSeries(); fetchStatus(); }, [fetchSummary, fetchSeries, fetchStatus]);

  const handleRun = async () => {
    setLoading(true);
    try { await run(20); } catch (e) { console.error('[ForecastComparisonPanel] run:', e?.message || e); }
    setLoading(false);
  };
  const handleReload = async () => { await fetchSummary(); await fetchSeries(); };

  const detalle = fc.summary?.detalle || [];
  const series = fc.series || null;
  const hasSeries = !!series?.available;
  const tabs = hasSeries ? ['metrics', 'curvas', 'barras', 'overlay'] : ['metrics', 'curvas', 'barras'];
  const activeTab = tabs.includes(tab) ? tab : 'metrics';

  return (
    <div className={`bg-card border rounded-xl shadow-sm space-y-3 ${isFull ? 'p-6' : 'p-4'}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className={`font-semibold ${isFull ? 'text-base' : 'text-sm'}`}>Comparativa de Forecast (MOS vs resto)</h3>
        <div className="flex gap-2">
          <button onClick={handleRun} disabled={loading || fc.running} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded flex items-center gap-1 disabled:opacity-50">
            <Play className="w-3 h-3" />{fc.running ? 'Ejecutando...' : 'Ejecutar'}
          </button>
          <button onClick={handleReload} className="text-xs px-3 py-1.5 border rounded flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />Recargar
          </button>
        </div>
      </div>
      {fc.running && <p className="text-xs text-amber-600">Comparativa en ejecución (puede tardar horas)...</p>}
      {fc.error && <p className="text-xs text-red-600">{fc.error}</p>}
      {!fc.summary?.available && !fc.error && (
        <p className="text-xs text-muted-foreground">Sin datos de comparativa todavía (corre el script o pulsa Ejecutar).</p>
      )}
      <p className="text-[11px] text-muted-foreground italic">
        NWP corregido con ML — ERA5 (verdad) y ECMWF (entrada) son de la misma familia; el MAE del MOS es optimista.
      </p>
      {fc.summary?.stale && (
        <p className="text-[11px] text-amber-600 border border-amber-300 rounded px-2 py-1">
          Datos previos al fix del proxy (commit <code>{fc.summary.dataCommit}</code>) — re-correr la comparativa para números vigentes.
        </p>
      )}
      <div className="flex gap-2 text-xs flex-wrap">
        <select value={horizon} onChange={e => setHorizon(e.target.value)} className="border rounded px-2 py-1">
          {HORIZONS.map(h => <option key={h} value={h}>h={h}</option>)}
        </select>
        <select value={variable} onChange={e => setVariable(e.target.value)} className="border rounded px-2 py-1">
          {VARIABLES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="flex gap-1 text-xs border-b">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 capitalize ${activeTab === t ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>{t}</button>
        ))}
      </div>
      <div className={isFull ? 'min-h-[420px]' : ''}>
        {activeTab === 'metrics' && <ForecastMetricsTable detalle={detalle} horizon={horizon} variable={variable} />}
        {activeTab === 'curvas' && <ForecastMaeChart detalle={detalle} height={isFull ? 420 : 320} />}
        {activeTab === 'barras' && <ForecastSkillChart detalle={detalle} horizon={horizon} height={isFull ? 420 : 320} />}
        {activeTab === 'overlay' && hasSeries && <ForecastOverlayChart series={series} variable={variable} height={isFull ? 420 : 320} />}
      </div>
    </div>
  );
};
