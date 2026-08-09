import { useState, useRef, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { X, Activity, GripHorizontal, LineChart as LineChartIcon } from 'lucide-react';
import { closeDispatchModal } from '@/Dashboard/store/diagram/diagramSlice';
import NodeDispatchSparkline from './components/NodeDispatchSparkline';
import GridAPI from '@/api/grid-api';
import Plotly from 'plotly.js-dist-min';
import ErrorBoundary from '@/Dashboard/components/ErrorBoundary';
import { DEVICE_DEFINITIONS, getDeviceDispatchTypes } from './constants/deviceTypes';

const SENSOR_TYPE_BY_DEVICE = {
  solar_panel: 'solar',
  solar_panel_ac: 'solar',
  load: 'load',
  battery: 'bess',
  wind_turbine: 'wind',
};

function SensorPredictionSection({ nodeId, deviceType }) {
  const sensorMappings = useSelector((state) => state.diagram.sensorMappings);
  const sensorId = sensorMappings?.[nodeId];
  const tipo = SENSOR_TYPE_BY_DEVICE[deviceType];
  const isWind = deviceType === 'wind_turbine';
  const [pred, setPred] = useState(null);
  const [loading, setLoading] = useState(Boolean(sensorId && tipo));

  useEffect(() => {
    if (!sensorId || !tipo) return;
    let alive = true;
    const fetchSensor = GridAPI.get('/front/prediction/sensor', {
      params: { sensor_id: sensorId, type: tipo, hours: 24 },
    });
    // Para eolica: el viento pronosticado (m/s) del MISMO forecast que usa la
    // fisica (wind_speed_100m) para que se vea la causalidad potencia~viento.
    const fetchWind = isWind
      ? GridAPI.get('/front/prediction/weather', { params: { hours: 24 } })
        .then((res) => {
          const values = res.data?.values || [];
          return values.map((v, i) => ({
            hour: i + 1,
            wind_ms: v.wind_speed_100m != null ? Number(v.wind_speed_100m) : null,
          }));
        })
        .catch(() => null)
      : Promise.resolve(null);

    Promise.all([fetchSensor, fetchWind])
      .then(([sensorRes, windData]) => {
        if (!alive) return;
        const values = sensorRes?.data?.values || [];
        const base = values.map((v, i) => ({ hour: i + 1, ...v }));
        const data = windData ? base.map((d, i) => ({ ...d, ...(windData[i] || {}) })) : base;
        setPred({
          unit: sensorRes?.data?.unit || 'kW',
          windMs: Boolean(windData),
          data,
        });
      })
      .catch(() => {
        if (alive) setPred(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [sensorId, tipo, isWind]);

  if (!sensorId) {
    return (
      <div className="mt-3 rounded-lg border border-dashed bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground">
        Sin sensor mapeado. Lígalo desde el panel del diagrama para ver la predicción calibrada de este activo.
      </div>
    );
  }
  if (!tipo) {
    return (
      <div className="mt-3 rounded-lg border border-dashed bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground">
        Este bloque no tiene modelo de predicción de sensor (diesel/red).
      </div>
    );
  }

  const bandColor = (deviceType === 'solar_panel' || deviceType === 'solar_panel_ac')
    ? '#f59e0b' : '#14b8a6';

  return (
    <div className="mt-3 rounded-lg border bg-muted/10 p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[10px] font-semibold text-foreground flex items-center gap-1">
          <LineChartIcon className="w-3 h-3 text-chart-5" />
          {pred?.windMs
            ? 'Predicción del sensor (24h · banda kW + viento m/s)'
            : 'Predicción del sensor (24h · modelo calibrado)'}
        </p>
        <span className="text-[9px] text-muted-foreground font-mono">{sensorId.slice(-10)}</span>
      </div>
      {loading && (
        <p className="text-[10px] text-muted-foreground px-1 py-4">
          Cargando predicción (si es la primera vez, calibra el modelo del sensor)...
        </p>
      )}
      {!loading && !pred && (
        <p className="text-[10px] text-muted-foreground px-1 py-4">
          Predicción no disponible (¿servicio Python en :8000?).
        </p>
      )}
      {!loading && pred && (
        <>
          <ErrorBoundary compact>
            <PredictionChart data={pred.data} bandColor={bandColor} unit={pred.unit} windMs={pred.windMs} />
          </ErrorBoundary>
          <div className="flex justify-between px-1 pt-1 text-[9px] text-muted-foreground">
            <span>{pred.windMs ? '— banda P10-P90 · - - viento (m/s)' : 'banda P10-P90'}</span>
            <span>pico P50: {Math.max(...pred.data.map((d) => d.P50)).toFixed(1)} {pred.unit}</span>
          </div>
        </>
      )}
    </div>
  );
}

function PredictionChart({ data, bandColor, unit, windMs }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data || data.length === 0) return;
    const hours = data.map((d) => d.hour);

    const hexToRgba = (hex, a) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };

    const traces = [
      {
        x: hours,
        y: data.map((d) => d.P10),
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        fill: 'tozeroy',
        fillcolor: hexToRgba(bandColor, 0.12),
        hoverinfo: 'skip',
      },
      {
        x: hours,
        y: data.map((d) => d.P90),
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        fill: 'tonexty',
        fillcolor: hexToRgba(bandColor, 0.12),
        hoverinfo: 'skip',
      },
      {
        x: hours,
        y: data.map((d) => d.P50),
        type: 'scatter',
        mode: 'lines',
        name: `P50 (${unit})`,
        line: { color: bandColor, width: 2 },
        hovertemplate: `%{x}h · %{y:.1f} ${unit}<extra></extra>`,
      },
    ];
    if (windMs) {
      traces.push({
        x: hours,
        y: data.map((d) => d.wind_ms),
        type: 'scatter',
        mode: 'lines',
        name: 'Viento (m/s)',
        yaxis: 'y2',
        line: { color: '#0ea5e9', width: 1.5, dash: 'dot' },
        hovertemplate: `%{x}h · %{y:.1f} m/s<extra></extra>`,
      });
    }

    const layout = {
      showlegend: false,
      xaxis: { title: 'Hora', dtick: 4, tickfont: { size: 9 }, showgrid: false },
      yaxis: {
        title: unit, tickfont: { size: 9 }, showgrid: true, gridcolor: 'rgba(148,163,184,0.15)',
      },
      // OJO: no incluir la clave con valor undefined (plotly crash: cleanLayout
      // 'can't access property anchor'). Solo existe cuando hay viento (y2).
      ...(windMs
        ? {
            yaxis2: {
              title: 'm/s', tickfont: { size: 9 }, showgrid: false, overlaying: 'y', side: 'right',
            },
          }
        : {}),
      margin: { l: 36, r: windMs ? 34 : 8, t: 6, b: 30 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 9 },
      height: 130,
    };

    try {
      Plotly.react(chartRef.current, traces, layout, { responsive: true, displayModeBar: false });
    } catch (err) {
      console.warn('[PredictionChart] plotly error:', err);
    }

    const observer = new ResizeObserver(() => {
      if (chartRef.current) Plotly.Plots.resize(chartRef.current);
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [data, bandColor, unit, windMs]);

  return <div ref={chartRef} className="w-full" />;
}

export default function NodeDispatchModal() {
  const dispatch = useDispatch();
  const dispatchModalNodeId = useSelector((state) => state.diagram.dispatchModalNodeId);
  const nodes = useSelector((state) => state.diagram.nodes);
  const latestResult = useSelector((state) => state.optimization.latestResult);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const dragStart = useRef(null);

  const handleMouseDown = useCallback((e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const handleMove = (ev) => {
      setPos({ x: ev.clientX - dragStart.current.x, y: ev.clientY - dragStart.current.y });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [pos]);

  const handleClose = useCallback(() => {
    dispatch(closeDispatchModal());
  }, [dispatch]);

  if (!dispatchModalNodeId) return null;
  if (!latestResult?.dispatch_plan || latestResult.dispatch_plan.length === 0) return null;

  const node = nodes.find((n) => n.id === dispatchModalNodeId);
  if (!node) return null;

  const nodeType = node.data?.deviceType;

  let nodeEntries = latestResult.dispatch_plan.filter((d) => d.device_id === dispatchModalNodeId);
  let lookupId = dispatchModalNodeId;

  if (nodeEntries.length === 0) {
    const dt = getDeviceDispatchTypes(nodeType);
    for (const entry of dt) {
      const fallback = latestResult.dispatch_plan.filter((d) => d.device_id === entry.type);
      if (fallback.length > 0) {
        lookupId = entry.type;
        nodeEntries = fallback;
        break;
      }
    }
  }

  if (nodeEntries.length === 0) {
    const def = DEVICE_DEFINITIONS[nodeType];
    if (def?.solverType) {
      const fallback = latestResult.dispatch_plan.filter((d) => d.device_id === def.solverType);
      if (fallback.length > 0) {
        lookupId = def.solverType;
        nodeEntries = fallback;
      }
    }
  }

  if (nodeEntries.length === 0) return null;

  const def = DEVICE_DEFINITIONS[node.data?.deviceType];
  const label = node.data?.label || def?.label || 'Equipo';

  const totalKw = nodeEntries.reduce((sum, d) => sum + Math.abs(d.power_kw), 0);
  const avgKw = totalKw / nodeEntries.length;
  const peakKw = Math.max(...nodeEntries.map((d) => Math.abs(d.power_kw)));

  return (
    <div
      className="fixed z-40 w-[380px] bg-card border rounded-xl shadow-2xl"
      style={{ left: `calc(50% + ${pos.x}px)`, top: `calc(60% + ${pos.y}px)` }}
    >
      <div
        ref={dragRef}
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
          <div className="p-1.5 rounded-md" style={{ backgroundColor: '#6366f115' }}>
            <Activity className="w-4 h-4 text-chart-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Despacho: {label}</p>
            <p className="text-[10px] text-muted-foreground">{def?.label || node.data?.deviceType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {totalKw.toFixed(1)} kW/dia
          </span>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="rounded-lg border bg-muted/20 overflow-hidden" key={lookupId}>
          <NodeDispatchSparkline
            key={lookupId}
            dispatchPlan={latestResult.dispatch_plan}
            nodeId={lookupId}
            totalHours={latestResult.total_hours || 24}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
          <div className="bg-muted/50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-muted-foreground">Media</p>
            <p className="font-semibold tabular-nums">{avgKw.toFixed(1)} kW</p>
          </div>
          <div className="bg-muted/50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-muted-foreground">Pico</p>
            <p className="font-semibold tabular-nums text-amber-500">{peakKw.toFixed(1)} kW</p>
          </div>
          <div className="bg-muted/50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-muted-foreground">Horas activo</p>
            <p className="font-semibold tabular-nums">{nodeEntries.filter((d) => Math.abs(d.power_kw) > 0.5).length}h</p>
          </div>
        </div>

        <SensorPredictionSection nodeId={dispatchModalNodeId} deviceType={node.data?.deviceType} />
      </div>
    </div>
  );
}
