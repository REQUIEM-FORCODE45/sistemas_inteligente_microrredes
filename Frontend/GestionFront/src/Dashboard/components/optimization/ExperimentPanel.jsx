import { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { useExperimentData } from './hooks/useExperimentData';
import { ExperimentMetricsTable } from './ExperimentMetricsTable';
import { ExperimentCostChart } from './ExperimentCostChart';
import { ExperimentProfileChart } from './ExperimentProfileChart';
import { ExperimentTraceChart } from './ExperimentTraceChart';

export const ExperimentPanel = ({ variant = 'side' }) => {
  const { exp, fetchSummary, fetchTraces, fetchStatus, run } = useExperimentData();
  const [tab, setTab] = useState('metrics');
  const [loading, setLoading] = useState(false);
  const isFull = variant === 'full';

  useEffect(() => { fetchSummary(); fetchTraces('smpc'); fetchStatus(); }, [fetchSummary, fetchTraces, fetchStatus]);
  useEffect(() => {
    if (tab==='perfil' || tab==='trazas') {
      const hasAll = exp.traces && exp.traces['dmpc'] && exp.traces['mpc-pi'];
      if (!hasAll) fetchTraces();
    }
  }, [tab]);

  const handleRun = async () => {
    setLoading(true);
    try { await run(14); } catch {}
    setLoading(false);
  };
  const handleReload = async () => { await fetchSummary(); await fetchTraces(); };

  return (
    <div className={`bg-card border rounded-xl shadow-sm space-y-3 ${isFull ? 'p-6' : 'p-4'}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className={`font-semibold ${isFull ? 'text-base' : 'text-sm'}`}>Análisis Experimental (Exp A)</h3>
        <div className="flex gap-2">
          <button onClick={handleRun} disabled={loading || exp.running} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded flex items-center gap-1 disabled:opacity-50">
            <Play className="w-3 h-3" />{exp.running ? 'Ejecutando...' : 'Ejecutar (14d)'}
          </button>
          <button onClick={handleReload} className="text-xs px-3 py-1.5 border rounded flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />Recargar
          </button>
        </div>
      </div>
      {exp.running && <p className="text-xs text-amber-600">Experimento en ejecución (~10 min)...</p>}
      {exp.error && <p className="text-xs text-red-600">{exp.error}</p>}
      <div className="flex gap-1 text-xs border-b">
        {['metrics','costo','perfil','trazas'].map(t => (
          <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 capitalize ${tab===t ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>{t}</button>
        ))}
      </div>
      <div className={isFull ? 'min-h-[420px]' : ''}>
        {tab==='metrics' && <ExperimentMetricsTable metrics={exp.summary?.metrics} />}
        {tab==='costo' && <ExperimentCostChart cumulative={exp.summary?.cumulative} height={isFull?420:320} />}
        {tab==='perfil' && <ExperimentProfileChart traces={exp.traces} height={isFull?420:320} />}
        {tab==='trazas' && <ExperimentTraceChart traces={exp.traces} height={isFull?420:320} />}
      </div>
    </div>
  );
};
