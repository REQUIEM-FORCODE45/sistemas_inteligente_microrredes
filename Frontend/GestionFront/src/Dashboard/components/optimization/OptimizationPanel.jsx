import { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { Zap, Play, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import GridAPI from '@/api/grid-api';
import {
  setOptimizationStatus,
  setOptimizationResult,
  setOptimizationError,
  setMpcStatus,
} from '@/Dashboard/store/optimization/optimizationSlice';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

export const OptimizationPanel = () => {
  const dispatch = useDispatch();
  const optimization = useSelector((state) => state.optimization);
  const socketRef = useRef(null);
  const [triggering, setTriggering] = useState(false);

  const fetchMpcStatus = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/mpc-status');
      if (res.data.success) {
        dispatch(setMpcStatus(res.data.mpc));
        if (res.data.latest_result) {
          dispatch(setOptimizationResult(res.data.latest_result));
        }
      }
    } catch {
      // inicializacion silenciosa
    }
  }, [dispatch]);

  useEffect(() => {
    const token = localStorage.getItem('sensor_token');
    socketRef.current = io(SOCKET_URL, { auth: { token } });

    socketRef.current.on('optimization_started', (data) => {
      dispatch(setOptimizationStatus({ status: 'queued', jobId: data?.jobId }));
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
      dispatch(setOptimizationError(data?.message || 'Error desconocido'));
    });

    fetchMpcStatus();

    return () => {
      socketRef.current.disconnect();
    };
  }, [dispatch, fetchMpcStatus]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await GridAPI.post('/front/optimization/trigger');
      if (!res.data.success) {
        dispatch(setOptimizationError(res.data.message));
      }
    } catch (err) {
      dispatch(setOptimizationError(err.response?.data?.message || err.message));
    } finally {
      setTriggering(false);
    }
  };

  const statusBadge = () => {
    switch (optimization.status) {
      case 'queued':
      case 'pending':
        return { icon: Clock, text: 'En cola', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' };
      case 'running':
        return { icon: RefreshCw, text: 'Optimizando...', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20 animate-spin' };
      case 'complete':
      case 'optimal':
        return { icon: CheckCircle2, text: 'Completado', color: 'text-green-500 bg-green-500/10 border-green-500/20' };
      case 'infeasible':
        return { icon: AlertCircle, text: 'Infactible', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
      case 'error':
        return { icon: AlertCircle, text: 'Error', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
      default:
        return { icon: Clock, text: 'En espera', color: 'text-muted-foreground bg-muted border' };
    }
  };

  const badge = statusBadge();
  const Icon = badge.icon;

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Optimizacion MPC</h2>
            <p className="text-xs text-muted-foreground">
              Ciclo cada {optimization.mpc.interval_minutes} min
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${badge.color}`}>
            <Icon className={`w-3.5 h-3.5 ${optimization.status === 'running' ? 'animate-spin' : ''}`} />
            {badge.text}
          </span>
          <button
            onClick={handleTrigger}
            disabled={triggering || optimization.status === 'running' || optimization.mpc.cycle_active}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {triggering ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Ejecutar
          </button>
        </div>
      </div>

      {optimization.error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{optimization.error}</span>
        </div>
      )}
    </div>
  );
};
