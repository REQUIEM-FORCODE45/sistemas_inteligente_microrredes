import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import {
  Zap, Play, RefreshCw, AlertCircle, CheckCircle2, Clock, X,
} from 'lucide-react';
import GridAPI from '@/api/grid-api';
import {
  setOptimizationStatus,
  setOptimizationResult,
  setOptimizationError,
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
  [DEVICE_TYPE.LOAD]: (_node, params) => ({
    type: 'load',
    max_kw: (params.maxLoad || 3000) / 1000, min_kw: 0,
  }),
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
  const optimization = useSelector((state) => state.optimization);
  const socketRef = useRef(null);
  const [triggering, setTriggering] = useState(false);

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
    socketRef.current.on('optimization_complete', (data) => {
      dispatch(setOptimizationStatus({ status: 'complete', jobId: data?.jobId }));
    });
    socketRef.current.on('optimization_error', (data) => {
      dispatch(setOptimizationError(data?.message || 'Error'));
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [dispatch]);

  const handleTrigger = useCallback(async () => {
    if (diagramNodes.length === 0) return;
    setTriggering(true);
    try {
      const topology = diagramToOptimization(diagramNodes);
      const res = await GridAPI.post('/front/optimization/trigger', {
        topology, horizon: 24, time_step_minutes: 60,
      });
      if (!res.data.success) {
        dispatch(setOptimizationError(res.data.message || 'Error'));
      }
    } catch (err) {
      dispatch(setOptimizationError(err.response?.data?.message || err.message));
    } finally {
      setTriggering(false);
    }
  }, [diagramNodes, dispatch]);

  const statusBadge = () => {
    switch (optimization.status) {
      case 'queued':
      case 'pending':
        return { icon: Clock, text: 'En cola', cls: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' };
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

        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          {deviceCounts.map((d) => (
            <span key={d.label} className="px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${d.color}18`, color: d.color }}>
              {d.count} {d.label}
            </span>
          ))}
          {diagramNodes.length === 0 && <span className="text-muted-foreground col-span-2">Sin equipos</span>}
        </div>

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
