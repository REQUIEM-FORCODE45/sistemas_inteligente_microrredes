import { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Play, RefreshCw } from 'lucide-react';
import GridAPI from '@/api/grid-api';
import { setExperimentSummary, setExperimentTraces, setExperimentRunning, setExperimentError } from '@/Dashboard/store/optimization/optimizationSlice';
import { ExperimentMetricsTable } from './ExperimentMetricsTable';
import { ExperimentCostChart } from './ExperimentCostChart';
import { ExperimentProfileChart } from './ExperimentProfileChart';
import { ExperimentTraceChart } from './ExperimentTraceChart';

export const ExperimentPanel = () => {
  const dispatch = useDispatch();
  const exp = useSelector(s => s.optimization.experimentA);
  const [tab, setTab] = useState('metrics');
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/experiment/summary');
      if (res.data?.success) dispatch(setExperimentSummary(res.data.summary));
    } catch (e) { dispatch(setExperimentError(e.message)); }
  }, [dispatch]);

  const fetchTraces = useCallback(async () => {
    const strategies = ['smpc','dmpc','heur','oracle'];
    const all = {};
    for (const s of strategies) {
      try {
        const res = await GridAPI.get(`/front/optimization/experiment/traces/${s}`);
        if (res.data?.success) all[s] = res.data.rows;
      } catch {}
    }
    dispatch(setExperimentTraces(all));
  }, [dispatch]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/experiment/status');
      if (res.data?.success) dispatch(setExperimentRunning(!!res.data.running));
    } catch {}
  }, [dispatch]);

  useEffect(() => { fetchSummary(); fetchTraces(); fetchStatus(); }, [fetchSummary, fetchTraces, fetchStatus]);

  const handleRun = async () => {
    setLoading(true);
    try {
      await GridAPI.post('/front/optimization/experiment/run', { days: 14 });
      dispatch(setExperimentRunning(true));
    } catch (e) { dispatch(setExperimentError(e.response?.data?.message || e.message)); }
    setLoading(false);
  };

  const handleReload = async () => { await fetchSummary(); await fetchTraces(); };

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Análisis Experimental (Exp A)</h3>
        <div className="flex gap-2">
          <button onClick={handleRun} disabled={loading || exp.running} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded flex items-center gap-1 disabled:opacity-50">
            <Play className="w-3 h-3" />{exp.running ? 'Ejecutando...' : 'Ejecutar (14d)'}
          </button>
          <button onClick={handleReload} className="text-xs px-3 py-1.5 border rounded flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />Recargar
          </button>
        </div>
      </div>
      {exp.running && <p className="text-xs text-amber-600">Experimento en ejecución (~10 min, ver logs del servidor)...</p>}
      {exp.error && <p className="text-xs text-red-600">{exp.error}</p>}
      <div className="flex gap-1 text-xs border-b">
        {['metrics','costo','perfil','trazas'].map(t => (
          <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 capitalize ${tab===t ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>{t}</button>
        ))}
      </div>
      {tab==='metrics' && <ExperimentMetricsTable metrics={exp.summary?.metrics} />}
      {tab==='costo' && <ExperimentCostChart cumulative={exp.summary?.cumulative} />}
      {tab==='perfil' && <ExperimentProfileChart traces={exp.traces} />}
      {tab==='trazas' && <ExperimentTraceChart traces={exp.traces} />}
    </div>
  );
};
