import { useCallback, useEffect, useState } from 'react';
import GridAPI from '../api/grid-api';
import OniChart from './OniChart';
import IndicesPanel from './IndicesPanel';
import ClimaInsights from './ClimaInsights';
import ZoneMap from './ZoneMap';

// Pagina /clima — modulo de primer nivel (§3.7): pagina completa, una columna
// fluida, secciones de ancho completo. NO modal, NO widget del diagrama.
// Criterio §7.6: sin backend -> "sin datos", nunca grafico vacio ni throw.
// Cambio 17: hero con el modo vigente, skeletons de carga, estados reales del
// mapa (disponible/reintentar, inexistente/generar, error), sin codigos A# en
// la UI (quedan en testIds y en la spec).
function haceCuanto(iso) {
  if (!iso) return 'fecha desconocida';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'fecha desconocida';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const nombreModo = (c) => (c === 'nino' ? 'El Niño' : c === 'nina' ? 'La Niña' : 'Neutral');

function Skeleton() {
  return (
    <div className="flex flex-col gap-6 w-full" aria-busy="true" aria-label="Cargando clima">
      <div className="bg-card border rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-7 w-64 bg-muted rounded-md" />
        <div className="h-4 w-96 max-w-full bg-muted rounded-md mt-2" />
        <div className="flex gap-3 mt-4">
          <div className="h-24 flex-1 bg-muted rounded-lg" />
          <div className="h-24 flex-1 bg-muted rounded-lg" />
          <div className="h-24 flex-1 bg-muted rounded-lg hidden md:block" />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="bg-card border rounded-xl p-6 shadow-sm animate-pulse">
          <div className="h-5 w-48 bg-muted rounded-md mb-4" />
          <div className="h-[300px] bg-muted rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function ClimatePage() {
  const [context, setContext] = useState(null);
  const [geo, setGeo] = useState(null);
  const [geoEstado, setGeoEstado] = useState('cargando'); // cargando | listo | generar | reintentar | error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [progresoBuild, setProgresoBuild] = useState(null);

  const cargarGeo = useCallback(async (disponible) => {
    setGeoEstado('cargando');
    try {
      const g = await GridAPI.get('/front/climate/geo');
      setGeo(g.data.geo);
      setGeoEstado('listo');
    } catch (e) {
      setGeo(null);
      const code = e.response?.status;
      const flag = e.response?.data?.necesita_generacion;
      if (disponible === false || flag || code === 503) setGeoEstado('generar');
      else setGeoEstado('reintentar');
    }
  }, []);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      if (force) await GridAPI.post('/front/climate/refresh');
      const r = await GridAPI.get('/front/climate/context');
      setContext(r.data);
      setError(null);
      await cargarGeo(r.data?.climatologia_geo?.disponible);
    } catch (e) {
      setError(e.response?.status === 503 ? 'sin datos' : (e.message || 'sin datos'));
      setContext(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cargarGeo]);

  const generarMapa = useCallback(async () => {
    setGenerando(true);
    setProgresoBuild('iniciando…');
    try {
      const r = await GridAPI.post('/front/climate/geo/build');
      if (r.data?.started === false) {
        setProgresoBuild('ya hay una generación en curso…');
      } else {
        setProgresoBuild('generando (tarda varios minutos)…');
      }
      const id = setInterval(async () => {
        try {
          const s = await GridAPI.get('/front/climate/geo/build/status');
          if (s.data?.state === 'success') {
            clearInterval(id);
            setGenerando(false);
            setProgresoBuild(null);
            await cargarGeo(true);
          } else if (s.data?.state === 'failed') {
            clearInterval(id);
            setGenerando(false);
            setProgresoBuild('falló la generación; reintenta más tarde');
          }
        } catch { /* el siguiente tick reintenta */ }
      }, 15000);
    } catch (e) {
      setGenerando(false);
      setProgresoBuild(e.response?.data?.message || 'no se pudo iniciar');
    }
  }, [cargarGeo]);

  useEffect(() => { load(false); }, [load]);

  if (loading) return <Skeleton />;
  if (error || !context) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl overflow-x-hidden">
        <h1 className="text-2xl font-bold tracking-tight">Clima · Pasto, Nariño · 2 600 msnm</h1>
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <p className="font-semibold">Sin datos climáticos</p>
          <p className="text-sm text-muted-foreground mt-1">El servicio no responde y no hay versión guardada ({error}).</p>
          <button onClick={() => { setLoading(true); load(false); }} className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90">Reintentar</button>
        </div>
      </div>
    );
  }

  const m = context.modo_vigente;
  const nombre = nombreModo(m.clasificacion);
  return (
    <div className="flex flex-col gap-6 w-full overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clima · Pasto, Nariño · 2 600 msnm</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Datos hasta {context.indices?.mes?.at(-1)?.slice(0, 7) ?? '—'} · sincronizado {haceCuanto(context.generado)} · {context.meta?.fuente}
            {context.stale ? ` · STALE desde ${context.antiguedad ?? 'desconocido'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/20">
            {nombre} · {m.periodo ?? ''} · RONI {m.roni ?? '—'}
          </span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            title="Buscar datos nuevos"
            className="px-3 py-1 text-sm font-semibold rounded-lg border hover:bg-accent disabled:opacity-50"
          >
            {refreshing ? 'Actualizando…' : '⟳ Actualizar'}
          </button>
        </div>
      </div>

      <section aria-label="Modo vigente" className="bg-card border rounded-xl p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Modo vigente del Pacífico</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1">
          <p className="text-3xl font-bold tracking-tight">{nombre}</p>
          <p className="text-sm text-muted-foreground">RONI {m.roni ?? '—'} · ONI {m.oni ?? '—'} · clasificado por {m.fuente_clasificacion ?? '—'}</p>
        </div>
        <p className="text-sm mt-2">
          El Niño = menos nube y más sol en Pasto: <b>−1.96 pts</b> de nubosidad · GHI <b className="text-emerald-600">↗ +4.4 %</b>. Manda el Pacífico central (Niño 4), no el costero.
        </p>
      </section>

      <section aria-label="Diagnostico">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Diagnóstico del Pacífico</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <OniChart indices={context.indices} />
          <IndicesPanel indices={context.indices} />
        </div>
      </section>

      <section aria-label="Mapa">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Mapa de Nariño</h2>
        {geoEstado === 'listo' && geo ? (
          <ZoneMap geo={geo} sitio={context.sitio} />
        ) : geoEstado === 'generar' ? (
          <div className="bg-card border rounded-xl p-6 shadow-sm">
            <p className="font-semibold">Mapa de calor en construcción</p>
            <p className="text-sm text-muted-foreground mt-1">
              El mapa de nubosidad de Nariño aún no está generado. Se construye solo en el servidor (tarda varios minutos).
            </p>
            <button
              onClick={generarMapa}
              disabled={generando}
              className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {generando ? 'Generando…' : 'Generar mapa'}
            </button>
            {progresoBuild && <p className="text-xs text-muted-foreground mt-2">{progresoBuild}</p>}
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Detalles técnicos</summary>
              <p className="mt-1">Equivalente a <code>python3 -m climate.build_clima_geo</code> desde <code>optimization/</code> (rejilla ERA5 0.25°, lotes de 8, backoff).</p>
            </details>
          </div>
        ) : geoEstado === 'reintentar' ? (
          <div className="bg-card border rounded-xl p-6 shadow-sm">
            <p className="font-semibold">El mapa está disponible pero no cargó</p>
            <p className="text-sm text-muted-foreground mt-1">Parece un problema de red momentáneo, no de datos.</p>
            <button onClick={() => cargarGeo(true)} className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg border hover:bg-accent">Reintentar</button>
          </div>
        ) : (
          <div className="bg-card border rounded-xl p-6 shadow-sm animate-pulse" aria-busy="true">
            <div className="h-5 w-48 bg-muted rounded-md mb-4" />
            <div className="h-[360px] bg-muted rounded-lg" />
          </div>
        )}
      </section>

      <section aria-label="Impacto">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Qué significa para Pasto</h2>
        <ClimaInsights context={context} />
      </section>

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">Datos técnicos</summary>
        <p className="mt-1">Figuras vivas desde el endpoint · hash {context.meta?.sha256} · mapa literal (A6) en fase 2</p>
      </details>
    </div>
  );
}
