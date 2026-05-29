import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { X, Activity, GripHorizontal } from 'lucide-react';
import { closeDispatchModal } from '@/Dashboard/store/diagram/diagramSlice';
import NodeDispatchSparkline from './components/NodeDispatchSparkline';
import { DEVICE_DEFINITIONS, getDeviceDispatchTypes } from './constants/deviceTypes';

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
      </div>
    </div>
  );
}
