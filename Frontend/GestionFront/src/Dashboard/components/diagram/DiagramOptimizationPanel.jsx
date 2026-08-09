import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import {
  Zap, Play, RefreshCw, AlertCircle, CheckCircle2, Clock, X, Sparkles,
} from 'lucide-react';
import GridAPI from '@/api/grid-api';
import {
  setOptimizationStatus,
  setOptimizationResult,
  setOptimizationError,
  setMpcStatus,
} from '@/Dashboard/store/optimization/optimizationSlice';
import { DEVICE_TYPE, DEVICE_DEFINITIONS, SOLVER_CATEGORY } from './constants/deviceTypes';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const TOPOLOGY_MAPPERS = {
  [DEVICE_TYPE.SOLAR_PANEL]: (_node, params) => ({
    type: 'solar',
    max_kw: (params.maxCapacity || 5000) / 1000, min_kw: 0,
    efficiency: params.efficiency || 0.21,
    cost_a: 0, cost_b: 0, cost_c: 0, fuel_cost: 0,
  }),
  [DEVICE_TYPE.SOLAR_PANEL_AC]: (_node, params) => ({
    type: 'solar',
    max_kw: (params.maxCapacity || 5000) / 1000, min_kw: 0,
    efficiency: (params.efficiency || 0.21) * (params.invEfficiency != null ? params.invEfficiency : 0.95),
    cost_a: 0, cost_b: 0, cost_c: 0, fuel_cost: 0,
  }),
  [DEVICE_TYPE.DIESEL_GENERATOR]: (_node, params) => ({
    type: 'diesel',
    max_kw: (params.maxCapacity || 300000) / 1000,
    min_kw: (params.minCapacity || 50000) / 1000,
    efficiency: 1.0,
    cost_a: params.costA != null ? params.costA : 0.001,
    cost_b: params.costB != null ? params.costB : 0.5,
    cost_c: params.costC != null ? params.costC : 0.5,
    fuel_cost: params.fuelCost != null ? params.fuelCost : 100,
  }),
  [DEVICE_TYPE.WIND_TURBINE]: (_node, params) => ({
    type: 'wind',
    max_kw: (params.maxCapacity || 100000) / 1000,
    min_kw: 0,
    efficiency: params.efficiency || 0.4,
    cost_a: 0, cost_b: 0, cost_c: 0, fuel_cost: 0,
  }),
  [DEVICE_TYPE.GRID]: (_node, params) => ({
    max_import_kw: params.maxCapacity ? params.maxCapacity / 1000 : 400,
    max_export_kw: params.maxCapacity ? (params.maxCapacity * 0.75) / 1000 : 300,
    min_import_kw: -(params.maxCapacity ? (params.maxCapacity * 0.75) / 1000 : 300),
    cost_fixed: 40, cost_variable: 60,
  }),
  [DEVICE_TYPE.BATTERY]: (_node, params) => {
    const c = (params.capacity || 10000) / 1000;
    return {
      type: 'battery', max_kw: c, min_kw: 0, capacity_kwh: c,
      max_charge_kw: c * 0.5, max_discharge_kw: c * 0.5,
      soc_min: 0.2, soc_max: 0.95,
      initial_soc: (params.chargeLevel || 80) / 100,
      charge_efficiency: 0.95, discharge_efficiency: 0.95,
      degradation_cost_per_kwh: 0.02,
    };
  },
  [DEVICE_TYPE.LOAD]: (_node, params) => {
    // fuente de Carga: 'mat' (perfil modular Consumo.mat) o 'static' (fija).
    const fixedW = (params.consumption && params.consumption > 0)
      ? params.consumption : (params.maxLoad || 3000);
    return {
      type: 'load',
      max_kw: (params.maxLoad || 3000) / 1000, min_kw: 0,
      fixed_kw: fixedW / 1000,
      load_source: params.loadSource === 'mat' ? 'mat' : 'static',
    };
  },
};

function diagramToOptimization(nodes) {
  const sources = [];
  const storage = [];
  const loads = [];
  const gridDefault = { max_import_kw: 400, max_export_kw: 300, min_import_kw: -300, cost_fixed: 40, cost_variable: 60 };
  let grid = null;

  for (const node of nodes) {
    const mapper = TOPOLOGY_MAPPERS[node.type];
    if (!mapper) continue;
    const params = node.data?.params || {};
    const mapped = mapper(node, params);
    if (!mapped) continue;

    if (node.type === DEVICE_TYPE.GRID) {
      grid = mapped;
    } else {
      const def = DEVICE_DEFINITIONS[node.type];
      const entry = { id: node.id, ...mapped };
      if (def?.solverCategory === SOLVER_CATEGORY.SOURCES) sources.push(entry);
      else if (def?.solverCategory === SOLVER_CATEGORY.STORAGE) storage.push(entry);
      else if (def?.solverCategory === SOLVER_CATEGORY.LOADS) loads.push(entry);
    }
  }

  return { sources, storage, loads, converters: [], grid: grid || gridDefault };
}

export default function DiagramOptimizationPanel({ onClose }) {
  const dispatch = useDispatch();
  const diagramNodes = useSelector((state) => state.diagram.nodes);
  const sensorMappings = useSelector((state) => state.diagram.sensorMappings);
  const optimization = useSelector((state) => state.optimization);
  const socketRef = useRef(null);
  const [triggering, setTriggering] = useState(false);
  const [mpcBusy, setMpcBusy] = useState(false);
  const [sensorStatus, setSensorStatus] = useState({});

  const fetchMpcStatus = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/mpc-status');
      if (res.data?.success && res.data.mpc) {
        dispatch(setMpcStatus(res.data.mpc));
        if (res.data.latest_result) dispatch(setOptimizationResult(res.data.latest_result));
      }
    } catch { /* silencioso */ }
  }, [dispatch]);

  const toggleMpc = useCallback(async (event) => {
    const wanted = event.target.checked;
    setMpcBusy(true);
    try {
      if (wanted) await GridAPI.post('/front/optimization/mpc/start');
      else await GridAPI.post('/front/optimization/mpc/stop');
      await fetchMpcStatus();
    } catch (err) {
      dispatch(setOptimizationError(err.response?.data?.message || err.message));
    } finally {
      setMpcBusy(false);
    }
  }, [dispatch, fetchMpcStatus]);

  useEffect(() => {
    const token = localStorage.getItem('sensor_token');
    socketRef.current = io(SOCKET_URL, { auth: { token } });

    socketRef.current.on('optimization_started', () => {
      dispatch(setOptimizationStatus({ status: 'queued' }));
    });
    socketRef.current.on('optimization_queued', (data) => {
      dispatch(setOptimizationStatus({ status: 'queued', jobId: data?.jobId }));
    });
    socketRef.current.on('optimization_progress', (data) => {
      dispatch(setOptimizationStatus({ status: data?.status || 'running', jobId: data?.jobId }));
    });
    socketRef.current.on('optimization_result', (data) => {
      dispatch(setOptimizationResult(data));
    });
    // Bucle (Opcion A): etapas de calibracion y prediccion
    socketRef.current.on('calibration_started', (data) => {
      dispatch(setOptimizationStatus({ status: 'calibrating', jobId: data?.sensorId }));
      if (data?.sensorId) setSensorStatus((prev) => ({ ...prev, [data.sensorId]: { phase: 'calibrando' } }));
    });
    socketRef.current.on('calibration_done', (data) => {
      if (data?.sensorId) {
        setSensorStatus((prev) => ({
          ...prev,
          [data.sensorId]: data?.ok === false
            ? { phase: 'error', error: data.error || 'Fallo la calibracion' }
            : { phase: 'ok' },
        }));
      }
      if (data?.ok === false) {
        dispatch(setOptimizationError(`Calibracion fallo para ${data?.sensorId}`));
      }
    });
    socketRef.current.on('prediction_ready', (data) => {
      dispatch(setOptimizationStatus({ status: 'predicting' }));
      const sensors = data?.sensors || [];
      if (sensors.length) {
        setSensorStatus((prev) => {
          const next = { ...prev };
          for (const s of sensors) next[s.sensor_id || s] = { phase: 'prediciendo' };
          return next;
        });
      }
    });
    socketRef.current.on('prediction_done', (data) => {
      const sensors = data?.sensors || [];
      if (sensors.length) {
        setSensorStatus((prev) => {
          const next = { ...prev };
          for (const s of sensors) next[s.sensor_id || s] = { phase: 'ok' };
          return next;
        });
      }
    });
    socketRef.current.on('optimization_complete', (data) => {
      dispatch(setOptimizationStatus({ status: 'complete', jobId: data?.jobId }));
      // Fallback defensivo: si algun sensor quedo en fases intermedias,
      // el job termino bien -> pasa a OK.
      setSensorStatus((prev) => {
        const next = { ...prev };
        for (const [sid, st] of Object.entries(next)) {
          if (st?.phase === 'prediciendo' || st?.phase === 'calibrando') next[sid] = { phase: 'ok' };
        }
        return next;
      });
    });
    socketRef.current.on('optimization_error', (data) => {
      dispatch(setOptimizationError(data?.message || 'Error'));
      setSensorStatus((prev) => {
        const next = { ...prev };
        for (const [sid, st] of Object.entries(next)) {
          if (st?.phase === 'prediciendo' || st?.phase === 'calibrando') next[sid] = { phase: 'error', error: data?.message };
        }
        return next;
      });
    });

    fetchMpcStatus();

    return () => {
      socketRef.current.disconnect();
    };
  }, [dispatch, fetchMpcStatus]);

  const handleTrigger = useCallback(async () => {
    if (diagramNodes.length === 0) return;
    setTriggering(true);
    setSensorStatus({});
    try {
      const topology = diagramToOptimization(diagramNodes);
      const res = await GridAPI.post('/front/optimization/trigger', {
        topology,
        sensor_mappings: sensorMappings,
        horizon: 24, time_step_minutes: 60,
      });
      if (!res.data.success) {
        dispatch(setOptimizationError(res.data.message || 'Error'));
      }
    } catch (err) {
      dispatch(setOptimizationError(err.response?.data?.message || err.message));
    } finally {
      setTriggering(false);
    }
  }, [diagramNodes, sensorMappings, dispatch]);

  const statusBadge = () => {
    switch (optimization.status) {
      case 'queued':
      case 'pending':
        return { icon: Clock, text: 'En cola', cls: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' };
      case 'calibrating':
        return { icon: RefreshCw, text: 'Calibrando modelos...', cls: 'text-purple-500 bg-purple-500/10 border-purple-500/20' };
      case 'predicting':
        return { icon: Sparkles, text: 'Prediciendo sensores...', cls: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' };
      case 'running':
        return { icon: RefreshCw, text: 'Optimizando...', cls: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
      case 'complete':
      case 'optimal':
        return { icon: CheckCircle2, text: 'Completado', cls: 'text-green-500 bg-green-500/10 border-green-500/20' };
      case 'infeasible':
        return { icon: AlertCircle, text: 'Infactible', cls: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
      case 'error':
        return { icon: AlertCircle, text: 'Error', cls: 'text-red-500 bg-red-500/10 border-red-500/20' };
      default:
        return { icon: Clock, text: 'En espera', cls: 'text-muted-foreground bg-muted border' };
    }
  };

  const badge = statusBadge();
  const BadgeIcon = badge.icon;
  const result = optimization.latestResult;

  const getDeviceCounts = () => {
    const entries = [];
    for (const def of Object.values(DEVICE_DEFINITIONS)) {
      if (!def.solverCategory) continue;
      const count = diagramNodes.filter((n) => n.type === def.type).length;
      if (count > 0) {
        const primary = def.dispatchTypes?.[0];
        entries.push({
          label: primary?.label || def.label,
          color: primary?.color || '#6b7280',
          count,
        });
      }
    }
    return entries;
  };

  const deviceCounts = getDeviceCounts();

  const loadBlocks = diagramNodes.filter((n) => n.type === DEVICE_TYPE.LOAD);
  const loadsSourceSummary = loadBlocks.length
    ? loadBlocks.map((n) => {
        const p = n.data?.params || {};
        const isMat = p.loadSource === 'mat';
        const fixedW = (p.consumption && p.consumption > 0) ? p.consumption : (p.maxLoad || 3000);
        return `${n.id.slice(-5)}: ${isMat ? '.mat (Consumo.mat)' : `estática ${(fixedW / 1000).toFixed(1)}kW`}`;
      }).join('  ·  ')
    : null;

  return (
    <div className="w-[300px] h-full flex flex-col bg-card border-l border-border overflow-y-auto">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Optimizacion</h3>
        </div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${badge.cls}`}>
            <BadgeIcon className={`w-3 h-3 ${optimization.status === 'running' ? 'animate-spin' : ''}`} />
            {badge.text}
          </span>
          {result?.status === 'optimal' && result.objective_value != null && (
            <span className="text-[10px] text-muted-foreground font-mono">
              ${result.objective_value.toLocaleString?.() ?? result.objective_value}
            </span>
          )}
        </div>

        <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 cursor-pointer select-none">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-foreground">Ciclo automático (15 min)</p>
            <p className="text-[9px] text-muted-foreground truncate">
              {optimization.mpc.running
                ? 'Corre con tu último diagrama cada 15 min'
                : 'Apagado: solo corre con "Ejecutar optimizacion"'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={!!optimization.mpc.running}
            disabled={mpcBusy}
            onChange={toggleMpc}
            className="w-4 h-4 accent-primary disabled:opacity-50"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          {deviceCounts.map((d) => (
            <span key={d.label} className="px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${d.color}18`, color: d.color }}>
              {d.count} {d.label}
            </span>
          ))}
          {diagramNodes.length === 0 && <span className="text-muted-foreground col-span-2">Sin equipos</span>}
        </div>

        {loadsSourceSummary && (
          <div className="text-[10px] font-mono text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5">
            Carga: {loadsSourceSummary}
          </div>
        )}

        {Object.keys(sensorMappings).length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Sensores enlazados
            </p>
            {Object.entries(sensorMappings)
              .filter(([nodeId]) => diagramNodes.some((n) => n.id === nodeId))
              .map(([nodeId, sensorId]) => {
              const node = diagramNodes.find((n) => n.id === nodeId);
              const st = sensorStatus[sensorId];
              const phaseMap = {
                calibrando: { label: 'Calibrando', cls: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
                prediciendo: { label: 'Prediciendo', cls: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' },
                ok: { label: 'OK', cls: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
                error: { label: 'Error', cls: 'text-red-500 bg-red-500/10 border-red-500/20' },
              };
              const info = phaseMap[st?.phase] || { label: 'En espera', cls: 'text-muted-foreground bg-muted/50 border-border' };
              return (
                <div key={nodeId} className="flex items-center gap-2 text-[10px]">
                  <span className="flex-1 truncate font-medium text-foreground/80">
                    {node?.data?.label || nodeId.slice(-6)}
                  </span>
                  <span className="font-mono text-muted-foreground/70 truncate max-w-[110px]">
                    {sensorId.slice(-10)}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border ${info.cls}`} title={st?.error}>
                    {info.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={handleTrigger}
          disabled={triggering || diagramNodes.length === 0 || optimization.status === 'running'}
          className="w-full h-9 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggering || optimization.status === 'running' ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {diagramNodes.length === 0 ? 'Arma el diagrama' : 'Ejecutar optimizacion'}
        </button>

        {optimization.error && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>{optimization.error}</span>
          </div>
        )}

        {result?.status === 'optimal' && (
          <div className="text-[10px] text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1.5">
            <p>Resultados listos. Mira las graficas en:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li><strong>Dashboard</strong> → Plan de despacho, Costo, Baterias</li>
              <li><strong>Clic en un nodo</strong> → Despacho 24h de ese equipo</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
