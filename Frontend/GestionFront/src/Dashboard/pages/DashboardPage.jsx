import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GridAPI from '@/api/grid-api';
import { setOptimizationResult, setMpcStatus } from '../store/optimization/optimizationSlice';
import { DispatchSchedule } from '../components/optimization/DispatchSchedule';
import { DispatchByDevice } from '../components/optimization/DispatchByDevice';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  Activity, Database, CloudSun, Gauge, BatteryCharging,
} from 'lucide-react';
import PlotlyMini from '../components/charts/PlotlyMini';

const PROVIDERS = [
  { id: 'openmeteo', label: 'Open-Meteo (NWP)' },
  { id: 'timesfm', label: 'TimesFM 2.5' },
  { id: 'patchtst', label: 'PatchTST' },
];

// Meta por tipo de equipo del diagrama (DEVICE_TYPE de deviceTypes.js).
// Esta sección refleja el diagrama: 1 tarjeta por nodo con su sensor ligado.
const DEVICE_SENSOR_META = {
  solar_panel: { label: 'Solar PV', unit: 'kW', key: 'power_kw' },
  solar_panel_ac: { label: 'Solar PV AC', unit: 'kW', key: 'power_kw' },
  wind_turbine: { label: 'Eólica', unit: 'kW', key: 'power_kw' },
  diesel_generator: { label: 'Generador Diesel', unit: 'kW', key: 'power_kw' },
  load: { label: 'Carga', unit: 'kW', key: 'power_kw' },
  battery: { label: 'Batería', unit: '%', key: 'soc_pct' },
  grid: { label: 'Red', unit: 'kW', key: 'power_kw' },
  inverter: { label: 'Inversor', unit: 'kW', key: 'power_kw' },
  sensor_iot: { label: 'Sensor IoT', unit: '', key: 'value' },
  // NOTA: el CLIMA no es un sensor (entrada externa Open-Meteo/TimesFM);
  // se muestra en la tarjeta "Pronostico del clima", no aqui.
};

function StatCard({ title, val, unit, trend, color, positive = true, icon }) {
  const Icon = icon;
  return (
    <div className="p-6 bg-card border rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
      <div className="flex items-center justify-between mb-2 text-muted-foreground">
        <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
        <Icon size={16} className={color} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{val}</span>
        <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
      <p className={`text-[10px] font-bold mt-2 ${positive ? 'text-green-500' : 'text-muted-foreground'}`}>
        {trend}
      </p>
    </div>
  );
}

function WeatherCard() {
  const [provider, setProvider] = useState('openmeteo');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let alive = true;
    GridAPI.get('/front/prediction/weather', {
      params: { hours: 48, provider },
    })
      .then((res) => {
        if (!alive) return;
        // diagnostico visible en consola (F12) para el navegador del usuario
        console.log('[WeatherCard] respuesta:', {
          status: res.data?.status,
          provider: res.data?.provider,
          filas: Array.isArray(res.data?.values) ? res.data.values.length : 'no-array',
          error: res.data?.error || null,
        });
        // HTTP 200 con status:'error' (ej. TimesFM sin instalar) -> mensaje real
        if (res.data?.status === 'error' || res.data?.error) {
          setError(res.data.error || `Proveedor ${provider} no disponible`);
          setLoading(false);
          return;
        }
        const values = Array.isArray(res.data?.values) ? res.data.values : [];
        if (values.length === 0) {
          setError('Sin datos de pronóstico para este proveedor');
          setLoading(false);
          return;
        }
        const series = values
          .filter((v) => Number.isFinite(Number(v.shortwave_radiation))
            && Number.isFinite(Number(v.temperature_2m)))
          .map((v) => ({
            iso: v.time,   // timestamp ISO para el eje x de Plotly (eje fecha,
                           // lineal y SIN duplicados -> antes las etiquetas
                           // locales repetidas causaban el garabato apilado)
            time: new Date(v.time).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
            ghi: Number.isFinite(Number(v.shortwave_radiation)) ? Number(v.shortwave_radiation) : 0,
            temp: Number.isFinite(Number(v.temperature_2m)) ? Number(v.temperature_2m) : 0,
            wind: Number.isFinite(Number(v.wind_speed_100m)) ? Number(v.wind_speed_100m) : 0,
            hum: Number.isFinite(Number(v.relative_humidity_2m)) ? Number(v.relative_humidity_2m) : 0,
            precip: Number.isFinite(Number(v.precipitation)) ? Number(v.precipitation) : 0,
          }));
        if (series.length === 0) {
          setError('El pronóstico no trajo variables utilizables');
          setLoading(false);
          return;
        }
        setData({ provider: res.data?.provider || provider, series });
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('[WeatherCard] fallo:', err.message,
          err.response ? `HTTP ${err.response.status}` : '(sin respuesta del servidor)');
        setError(err.response?.data?.message
          || (err.code === 'ECONNABORTED' ? 'Tiempo de espera agotado (30 s)' : 'Sin respuesta del servicio de predicción'));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [provider, retryTick]);

  // mini-grafica Plotly con el ULTIMO VALOR visible en grande
  const last = (key) => (data?.series?.length ? data.series[data.series.length - 1][key] : 0);

  // trazas MEMOIZADAS: solo se reconstruyen cuando cambia data.series (si se
  // recrean en cada render, PlotlyMini redibuja constantemente -> parpadeo)
  const traces = useMemo(() => {
    const series = data?.series || [];
    if (series.length === 0) return {};
    // eje x con ISO (fecha): Plotly lo interpreta como eje temporal lineal,
    // sin duplicados de hora localizada (causa del "garabato apilado").
    const iso = series.map((s) => s.iso);
    const col = (key) => series.map((s) => s[key]);
    const line = (key, color, fill = false) => ({
      x: iso,
      y: col(key),
      type: 'scatter',
      mode: 'lines',
      line: { color, width: 2, shape: 'spline', smoothing: 0.8 },
      fill: fill ? 'tozeroy' : 'none',
      fillcolor: fill ? 'rgba(245,158,11,0.10)' : undefined,
      hovertemplate: '%{x|%a %d %H:%M}<br>%{y:.1f}<extra></extra>',
    });
    return {
      ghi: [line('ghi', '#f59e0b', true)],
      temp: [line('temp', '#ef4444')],
      wind: [line('wind', '#14b8a6')],
      hum: [line('hum', '#3b82f6')],
      precip: [{ x: iso, y: col('precip'), type: 'bar',
                 marker: { color: '#8b5cf6' }, opacity: 0.85,
                 hovertemplate: '%{x|%a %d %H:%M}<br>%{y:.1f} mm<extra></extra>' }],
    };
  }, [data]);

  const mini = (title, value, unit, color, traces) => (
    <div className="rounded-lg border bg-muted/10 p-2">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className="text-xs font-bold tabular-nums" style={{ color }}>
          {Number(value).toFixed(1)} <span className="text-[9px] text-muted-foreground">{unit}</span>
        </p>
      </div>
      <PlotlyMini data={traces} height={100} />
    </div>
  );

  return (
    <div className="bg-card border rounded-xl shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-sky-500/10"><CloudSun className="w-4 h-4 text-sky-500" /></div>
          <div>
            <p className="text-sm font-semibold">Pronóstico del clima (48 h)</p>
            <p className="text-[10px] text-muted-foreground">Fuente: {data?.provider || provider}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/20 p-0.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                provider === p.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-[11px] text-muted-foreground py-8 text-center">Cargando pronóstico del clima...</p>}
      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-[11px] text-red-500 max-w-[420px]">{error}</p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="px-3 py-1.5 rounded-lg border border-input text-[11px] font-medium hover:bg-muted transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && data && (
        <>
          <div className="flex items-center justify-between mb-2 px-0.5">
            <p className="text-[10px] text-muted-foreground font-mono">
              {data.provider} · {data.series.length} h · desde {data.series[0]?.time}
            </p>
            <p className="text-[10px] text-muted-foreground">5 variables</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {mini('Irradiancia', last('ghi'), 'W/m²', '#f59e0b', traces.ghi || [])}
            {mini('Temperatura', last('temp'), '°C', '#ef4444', traces.temp || [])}
            {mini('Viento 100 m', last('wind'), 'm/s', '#14b8a6', traces.wind || [])}
            {mini('Humedad', last('hum'), '%', '#3b82f6', traces.hum || [])}
            {mini('Precipitación', last('precip'), 'mm', '#8b5cf6', traces.precip || [])}
          </div>
          <p className="text-[9px] text-muted-foreground mt-2">
            Con TimesFM 2.5 instalado, el selector usa el modelo zero-shot (contexto 512 h). Este pronóstico alimenta los modelos calibrados del bucle.
          </p>
        </>
      )}
    </div>
  );
}

function GenerationBandCard({ label, color, sensorId, tipo }) {
  const [pred, setPred] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  // layout y trazas estables (memo): el redibujo solo ocurre si cambia pred
  const bandLayout = useMemo(() => ({
    margin: { l: 40, r: 8, t: 8, b: 22 },
    xaxis: { title: { text: 'Hora', font: { size: 9 } }, tickfont: { size: 9 },
             showgrid: true, gridcolor: 'var(--border)', dtick: 4 },
    yaxis: { title: { text: 'kW', font: { size: 9 } }, tickfont: { size: 9 }, showgrid: true },
    hovermode: 'x unified',
  }), []);

  const bandTraces = useCallback((rows) => [
    { x: rows.map((d) => d.hour), y: rows.map((d) => d.P90),
      type: 'scatter', mode: 'lines', line: { color, width: 0 },
      fill: 'tonexty', fillcolor: `${color}2e`, name: 'P90' },
    { x: rows.map((d) => d.hour), y: rows.map((d) => d.P10),
      type: 'scatter', mode: 'lines', line: { color, width: 0 }, name: 'P10' },
    { x: rows.map((d) => d.hour), y: rows.map((d) => d.P50),
      type: 'scatter', mode: 'lines', line: { color, width: 2 }, name: 'P50' },
  ], [color]);

  useEffect(() => {
    let alive = true;
    GridAPI.get('/front/prediction/sensor', {
      params: { sensor_id: sensorId, type: tipo, hours: 24 },
    })
      .then((res) => {
        if (!alive) return;
        if (res.data?.status === 'error' || res.data?.error) {
          setError(res.data.error || 'Modelo del sensor no disponible');
          setLoading(false);
          return;
        }
        const values = Array.isArray(res.data?.values) ? res.data.values : [];
        if (values.length === 0) {
          setError('Sin predicción disponible para el sensor');
          setLoading(false);
          return;
        }
        setPred({
          provider: res.data?.provider,
          data: values
            .map((v, i) => ({
              hour: i + 1,
              P10: Number.isFinite(Number(v.P10)) ? Number(v.P10) : 0,
              P50: Number.isFinite(Number(v.P50)) ? Number(v.P50) : 0,
              P90: Number.isFinite(Number(v.P90)) ? Number(v.P90) : 0,
            })),
        });
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || 'Sin modelo calibrado');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [sensorId, tipo, retryTick]);

  const peak = pred?.data?.length ? Math.max(...pred.data.map((d) => d.P50)) : 0;
  const energy = pred?.data?.length ? pred.data.reduce((s, d) => s + d.P50, 0) : 0;

  return (
    <div className="bg-card border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}1a` }}>
            <Gauge className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-[10px] text-muted-foreground">P10/P50/P90 · modelo ajustado del sensor</p>
          </div>
        </div>
        <div className="flex gap-3 text-right">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">Pico P50</p>
            <p className="text-sm font-bold" style={{ color }}>{peak.toFixed(1)} kW</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase">Energía 24h</p>
            <p className="text-sm font-bold">{energy.toFixed(1)} kWh</p>
          </div>
        </div>
      </div>
      {loading && <p className="text-[11px] text-muted-foreground py-8 text-center">Cargando banda calibrada...</p>}
      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-[11px] text-red-500 max-w-[420px]">{error}</p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="px-3 py-1.5 rounded-lg border border-input text-[11px] font-medium hover:bg-muted transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && pred && (
        <PlotlyMini
          height={180}
          layout={bandLayout}
          data={bandTraces(pred.data)}
        />
      )}
    </div>
  );
}

// Variables conocidas: etiqueta + unidad (los sensores pueden traer otras;
// las desconocidas se grafican con su nombre crudo y sin unidad).
const VAR_META = {
  power_kw: { label: 'Potencia', unit: 'kW' },
  power_truth_kw: { label: 'Potencia real', unit: 'kW' },
  wind_speed_ms: { label: 'Viento', unit: 'm/s' },
  soc_pct: { label: 'SOC', unit: '%' },
  battery_power_kw: { label: 'Pot. batería', unit: 'kW' },
  p_unmet_kw: { label: 'No abastecida', unit: 'kW' },
  temperature: { label: 'Temperatura', unit: '°C' },
  irradiance_ghi: { label: 'Irradiancia', unit: 'W/m²' },
};

// Pista de variable principal POR TIPO (no es fuente de verdad: si el sensor
// no trae esa clave, se usa la primera clave numerica real del documento).
const PRIMARY_KEY_HINT = {
  solar_panel: ['power_kw', 'irradiance_ghi', 'power_truth_kw'],
  solar_panel_ac: ['power_kw', 'irradiance_ghi', 'power_truth_kw'],
  wind_turbine: ['wind_speed_ms', 'power_kw'],
  battery: ['soc_pct', 'battery_power_kw'],
  load: ['power_kw'],
  diesel_generator: ['power_kw'],
  grid: ['power_kw'],
  inverter: ['power_kw'],
  sensor_iot: [],
};

const SENSOR_ROW_EXCLUDED = new Set(['_id', 'createAt', 'timestamp', 'sensorId']);
const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // > 2h sin datos = desactualizado

const fmtShortDate = (d) => {
  if (!d || Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
};

function SensorsRow() {
  const diagramNodes = useSelector((state) => state.diagram.nodes);
  const sensorMappings = useSelector((state) => state.diagram.sensorMappings);
  const [series, setSeries] = useState({});

  const mappedNodes = useMemo(
    () => (diagramNodes || []).map((node) => ({
      node,
      sensorId: String(sensorMappings?.[node.id] || ''),
      meta: DEVICE_SENSOR_META[node.data?.deviceType]
        || { label: node.data?.label || 'Equipo', unit: 'kW', key: 'power_kw' },
    })),
    [diagramNodes, sensorMappings],
  );

  useEffect(() => {
    let alive = true;

    const loadAll = () => {
      mappedNodes.forEach(({ node, sensorId }) => {
        if (!sensorId) return;
        GridAPI.get(`/front/sensors_data/${sensorId}/24`)
          .then((res) => {
            if (!alive) return;
            const docs = res.data?.data || [];
            if (docs.length === 0) return;

            // Fecha REAL del ultimo dato (solo lectura; no modifica nada).
            const lastDoc = docs[0];
            const lastAt = lastDoc.createAt ? new Date(lastDoc.createAt) : null;

            // Claves numericas REALES del sensor (no asumir nombres fijos).
            const numericKeys = Object.keys(lastDoc).filter((k) =>
              !SENSOR_ROW_EXCLUDED.has(k)
              && typeof lastDoc[k] === 'number'
              && Number.isFinite(lastDoc[k])
            );

            const hints = PRIMARY_KEY_HINT[node.data?.deviceType] || [];
            const primary = hints.find((k) => numericKeys.includes(k)) || numericKeys[0];
            const secondary = numericKeys.find((k) => k !== primary) || null;

            const pts = docs.map((it) => {
              const t = it.createAt ? new Date(it.createAt) : null;
              return {
                v: Number(it[primary] ?? 0),
                s: secondary ? Number(it[secondary] ?? 0) : null,
                // timestamp REAL del punto: si es invalido se filtra abajo
                // (Plotly + fecha invalida -> tooltip Dec 1969 / Jan 2010).
                t: t && !Number.isNaN(t.getTime()) ? t : null,
              };
            }).filter((p) => p.t !== null);

            const pm = VAR_META[primary] || { label: primary, unit: '' };
            const sm = secondary ? (VAR_META[secondary] || { label: secondary, unit: '' }) : null;

            setSeries((prev) => ({
              ...prev,
              [sensorId]: { primary, secondary, pm, sm, pts: pts.reverse(), lastAt },
            }));
          })
          .catch(() => {});
      });
    };

    loadAll();
    // Refresco periodico (solo relee los datos, no los crea ni modifica).
    const interval = setInterval(loadAll, 60000);
    return () => { alive = false; clearInterval(interval); };
  }, [mappedNodes]);

  if (mappedNodes.length === 0) {
    return (
      <div className="bg-card border border-dashed rounded-xl p-5 text-center text-[11px] text-muted-foreground">
        Arma tu diagrama unifilar para ver aquí sus sensores en vivo.
        Esta sección refleja el diagrama: al agregar o quitar nodos, cambia automáticamente.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {mappedNodes.map(({ node, sensorId, meta }) => {
        const s = series[sensorId];
        const last = s?.pts?.length ? s.pts[s.pts.length - 1].v : 0;
        const stale = !!s?.lastAt && (Date.now() - s.lastAt.getTime()) > STALE_AFTER_MS;

        if (!sensorId) {
          return (
            <div
              key={node.id}
              className="bg-muted/40 border border-dashed rounded-xl p-4 opacity-70"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold">{node.data?.label}</p>
                <span className="text-[9px] text-muted-foreground">{meta.label}</span>
              </div>
              <p className="text-lg font-bold tabular-nums opacity-50">—</p>
              <p className="text-[9px] text-muted-foreground mt-1">Sin sensor ligado</p>
            </div>
          );
        }

        return (
          <div
            key={node.id}
            className={`bg-card border rounded-xl shadow-sm p-4 ${stale ? 'border-amber-500/40 opacity-80' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold">{node.data?.label}</p>
              <span className="text-[9px] text-muted-foreground font-mono">
                {s?.pm?.label || meta.label}
              </span>
            </div>
            <p className="text-lg font-bold tabular-nums">
              {last.toFixed(1)} <span className="text-[10px] font-medium text-muted-foreground">{s?.pm?.unit || meta.unit}</span>
            </p>
            {s?.sm && (
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {s.sm.label}: {Number(s.pts?.[s.pts.length - 1]?.s ?? 0).toFixed(1)} {s.sm.unit}
              </p>
            )}
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">
              último: {s?.lastAt ? fmtShortDate(s.lastAt) : '—'}
            </p>
            {stale && (
              <p className="text-[9px] font-medium text-amber-500 mt-0.5">
                Sin datos recientes
              </p>
            )}
            <PlotlyMini
              height={40}
              layout={{
                margin: { l: 0, r: 0, t: 2, b: 2 },
                xaxis: { type: 'date', showticklabels: false, showgrid: false },
                hovermode: 'x',
              }}
              data={[{
                x: (s?.pts || []).map((p) => p.t),
                y: (s?.pts || []).map((p) => p.v),
                type: 'scatter',
                mode: 'lines',
                line: { color: '#f59e0b', width: 1.5 },
                fill: 'tozeroy',
                fillcolor: 'rgba(245,158,11,0.12)',
                hovertemplate: '%{x|%d/%m %H:%M}<br>%{y:.2f}<extra></extra>',
              }]}
            />
          </div>
        );
      })}
    </div>
  );
}

function CalibrationCard() {
  const sensorMappings = useSelector((state) => state.diagram?.sensorMappings || {});
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    GridAPI.get('/front/optimization/calibration')
      .then((res) => alive && setData(res.data))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // COHERENCIA: solo mostrar artefactos de los sensores USADOS en el diagrama
  // (sensorMappings), no todos los calibrados del sistema.
  const models = useMemo(() => {
    const mapped = new Set(Object.values(sensorMappings || {}));
    return (data?.models || []).filter((m) => mapped.has(m.sensor_id));
  }, [data, sensorMappings]);

  return (
    <div className="bg-card border rounded-xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-emerald-500/10"><BatteryCharging className="w-4 h-4 text-emerald-500" /></div>
        <div>
          <p className="text-sm font-semibold">Ajuste de modelos (calibración)</p>
          <p className="text-[10px] text-muted-foreground">Artefactos por sensor · cascada N1/N2 · solo sensores del diagrama</p>
        </div>
      </div>
      {!data && <p className="text-[11px] text-muted-foreground py-4 text-center">Cargando...</p>}
      {data && models.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-4 text-center">
          Aún no hay modelos calibrados. Liga un sensor en el diagrama y ejecuta la optimización.
        </p>
      )}
      {data && models.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {models.map((m) => (
            <div key={m.sensor_id} className="rounded-lg border bg-muted/10 p-3">
              <p className="text-[10px] font-semibold">{m.sensor_id} <span className="text-muted-foreground">({m.type})</span></p>
              <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
                {m.k != null && <p>K = {Number(m.k).toFixed(3)}</p>}
                {m.rmse_calibrado_kw != null && <p>RMSE = {Number(m.rmse_calibrado_kw).toFixed(2)} kW</p>}
                {m.rmse_soc_final_pct != null && <p>RMSE SOC = {Number(m.rmse_soc_final_pct).toFixed(2)} %</p>}
                {m.params?.losses_pct != null && (
                  <p>params: losses {Number(m.params.losses_pct).toFixed(1)} · η {Number(m.params.inverter_eta).toFixed(2)} · γ {Number(m.params.temp_coeff_pct_per_c).toFixed(2)}</p>
                )}
                {m.q10 != null && <p>banda residuo: {Number(m.q10).toFixed(2)} … {Number(m.q90).toFixed(2)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const dispatch = useDispatch();
  const optimization = useSelector((state) => state.optimization);
  const diagramNodes = useSelector((state) => state.diagram?.nodes || []);
  const sensorMappings = useSelector((state) => state.diagram?.sensorMappings || {});

  // Tarjetas de "Generacion calibrada" COHERENTES con el diagrama: solo para
  // bloques de generacion (solar/solar_panel_ac/wind) con sensor ligado.
  // Sin bloque solar no aparece "solar"; con eolica aparece la eolica.
  const generationCards = useMemo(() => {
    const GEN_META = {
      solar_panel: { label: 'Generación solar calibrada (24 h)', color: '#f59e0b', tipo: 'solar' },
      solar_panel_ac: { label: 'Generación solar calibrada (24 h)', color: '#f59e0b', tipo: 'solar' },
      wind_turbine: { label: 'Generación eólica calibrada (24 h)', color: '#14b8a6', tipo: 'wind' },
    };
    return (diagramNodes || [])
      .filter((n) => GEN_META[n.data?.deviceType] && sensorMappings?.[n.id])
      .map((n) => ({ key: n.id, sensorId: sensorMappings[n.id], ...GEN_META[n.data.deviceType] }));
  }, [diagramNodes, sensorMappings]);

  // Refetch del ultimo resultado de optimizacion + estado MPC al montar.
  useEffect(() => {
    GridAPI.get('/front/optimization/results/latest')
      .then((res) => {
        if (res.data?.success && res.data.data) dispatch(setOptimizationResult(res.data.data));
      })
      .catch(() => {});
    GridAPI.get('/front/optimization/mpc-status')
      .then((res) => {
        if (res.data?.success && res.data.mpc) dispatch(setMpcStatus(res.data.mpc));
      })
      .catch(() => {});
  }, [dispatch]);

  const statusLabel = optimization.status === 'complete' || optimization.status === 'optimal'
    ? 'Óptimo' : optimization.status === 'running' ? 'Activa' : 'Idle';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight capitalize">Dashboard</h1>
        <p className="text-muted-foreground">
          Bucle completo: clima → modelos ajustados → predicción → optimización.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Costo Total"
          val={optimization.latestResult?.objective_value != null
            ? `${(optimization.latestResult.objective_value / 1000).toFixed(1)}k` : '--'}
          unit="u.m."
          trend={optimization.latestResult?.objective_value != null ? 'optimizado' : 'pendiente'}
          color="text-yellow-500" positive={false} icon={Activity}
        />
        <StatCard
          title="Potencia Pico Total"
          val={optimization.latestResult?.dispatch_plan
            ? `${optimization.latestResult.dispatch_plan.reduce((max, d) => d.power_kw > max ? d.power_kw : max, 0).toFixed(1)}` : '--'}
          unit="kW"
          trend="predicha"
          color="text-orange-500" positive icon={Gauge}
        />
        <StatCard
          title="Estado Optimización"
          val={statusLabel}
          unit=""
          trend={optimization.mpc.running ? 'MPC activo' : 'MPC detenido'}
          color="text-green-500" positive icon={Activity}
        />
        <StatCard
          title="Escenarios"
          val={optimization.latestResult?.scenario_results
            ? String(Object.keys(optimization.latestResult.scenario_results).length) : '3'}
          unit=""
          trend="estocástico"
          color="text-blue-500" positive icon={Database}
        />
      </div>

      <ErrorBoundary compact>
        <WeatherCard />
      </ErrorBoundary>
      {generationCards.map((card) => (
        <ErrorBoundary compact key={card.key}>
          <GenerationBandCard
            label={card.label}
            color={card.color}
            sensorId={card.sensorId}
            tipo={card.tipo}
          />
        </ErrorBoundary>
      ))}

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Sensores</p>
        <ErrorBoundary compact>
          <SensorsRow />
        </ErrorBoundary>
      </div>

      <ErrorBoundary compact>
        <CalibrationCard />
      </ErrorBoundary>

      {optimization.latestResult?.dispatch_plan ? (
        <div className="flex flex-col gap-6">
          <ErrorBoundary compact>
            <DispatchSchedule
              dispatchPlan={optimization.latestResult.dispatch_plan}
              scenarios={optimization.latestResult?.scenario_results
                ? Object.keys(optimization.latestResult.scenario_results).map((k) => ({ name: k, ...optimization.latestResult.scenario_results[k] }))
                : null}
              totalHours={optimization.latestResult?.total_hours || 24}
            />
          </ErrorBoundary>
          <ErrorBoundary compact>
            <DispatchByDevice
              dispatchPlan={optimization.latestResult.dispatch_plan}
              diagramNodes={diagramNodes}
              scenarios={optimization.latestResult?.scenario_results
                ? Object.keys(optimization.latestResult.scenario_results).map((k) => ({ name: k, ...optimization.latestResult.scenario_results[k] }))
                : null}
              totalHours={optimization.latestResult?.total_hours || 24}
            />
          </ErrorBoundary>
        </div>
      ) : (
        <div className="bg-card border rounded-xl p-6 min-h-[300px] flex items-center justify-center text-muted-foreground border-dashed bg-muted/20">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="p-4 bg-background rounded-full border shadow-sm">
              <Database size={40} className="text-primary/40" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Analítica de Datos</p>
              <p className="text-sm max-w-[280px]">Arma tu red en el Diagrama Unifilar y ejecuta la optimización para ver el despacho aquí.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
