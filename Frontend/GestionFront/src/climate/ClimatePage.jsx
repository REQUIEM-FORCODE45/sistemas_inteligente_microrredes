import { useCallback, useEffect, useState } from 'react';
import GridAPI from '../api/grid-api';
import OniChart from './OniChart';
import IndicesPanel from './IndicesPanel';
import ClimaInsights from './ClimaInsights';

// Pagina /clima — modulo de primer nivel (§3.7): pagina completa, una columna
// fluida, secciones de ancho completo. NO modal, NO widget del diagrama.
// Criterio §7.6: sin backend -> "sin datos", nunca grafico vacio ni throw.
export default function ClimatePage() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      if (force) await GridAPI.post('/front/climate/refresh');
      const r = await GridAPI.get('/front/climate/context');
      setContext(r.data);
      setError(null);
    } catch (e) {
      setError(e.response?.status === 503 ? 'sin datos' : (e.message || 'sin datos'));
      setContext(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading) return <p className="text-muted-foreground">Cargando contexto climático…</p>;
  if (error || !context) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Clima · Pasto, Nariño · 2 600 msnm</h1>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <p className="font-semibold">Sin datos climáticos</p>
          <p className="text-sm text-muted-foreground mt-1">El servicio no responde y no hay versión guardada ({error}).</p>
          <button onClick={() => { setLoading(true); load(false); }} className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground">Reintentar</button>
        </div>
      </div>
    );
  }

  const m = context.modo_vigente;
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clima · Pasto, Nariño · 2 600 msnm</h1>
          <p className="text-muted-foreground text-sm">
            última actualización: {context.generado} · {context.meta?.fuente}
            {context.stale ? ` · STALE desde ${context.antiguedad ?? 'desconocido'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/20">
            {m.clasificacion === 'nino' ? 'El Niño' : m.clasificacion === 'nina' ? 'La Niña' : 'Neutral'} · RONI {m.roni ?? '—'}
          </span>
          <button onClick={() => load(true)} disabled={refreshing} className="px-3 py-1 text-sm font-semibold rounded-lg border hover:bg-accent">
            {refreshing ? '…' : '⟳'}
          </button>
        </div>
      </div>

      <section aria-label="Por que">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">▲ ¿Por qué?</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <OniChart indices={context.indices} />
          <IndicesPanel indices={context.indices} />
        </div>
      </section>

      <section aria-label="Que sabemos">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">● ¿Qué sabemos?</h2>
        <ClimaInsights context={context} />
      </section>

      <p className="text-[11px] text-muted-foreground">Figuras vivas desde el endpoint · hash {context.meta?.sha256} · mapas (A5/A6) en fase 2</p>
    </div>
  );
}
