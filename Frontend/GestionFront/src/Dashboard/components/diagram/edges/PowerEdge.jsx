import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import { useSelector } from 'react-redux';
import { DEVICE_DEFINITIONS, CURRENT_TYPE, flowWidthFor } from '../constants/deviceTypes';

// Cambio 12.4 — rama unifilar (variante B, copiada de la referencia):
// derivación ortogonal (smoothstep), grosor ∝ kW, capa de flujo animada
// (CSS puro, sin estado por frame), badge en el conector con sentido ▲/▼.
// Rama abierta (extremo no modelado): tenue + discontinua + marca "sin modelo".
function powerFor(dispatchPlan, nodeId) {
  if (!dispatchPlan || !nodeId) return { kw: 0, dir: null };
  const entries = dispatchPlan.filter((d) => d.device_id === nodeId);
  if (entries.length === 0) return { kw: 0, dir: null };
  const kw = Math.max(...entries.map((d) => Math.abs(d.power_kw || 0)));
  const types = new Set(entries.map((d) => d.device_type));
  let dir = '▲';
  if (types.has('load')) dir = '▼';
  else if (types.has('grid_export')) dir = '▼';
  else if (types.has('battery_charge') && !types.has('battery_discharge')) dir = '▼';
  return { kw, dir };
}

function PowerEdge({ id, sourceX, sourceY, targetX, targetY, source, target, style, data, selected }) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const latestResult = useSelector((state) => state.optimization.latestResult);
  const preflight = useSelector((state) => state.diagram.preflight);
  const plan = latestResult?.dispatch_plan;
  const echo = latestResult?.device_echo || [];

  const echoOf = (nodeId) => echo.find((e) => e.device_id === nodeId);
  const openEnd = (nodeId) => {
    const p = preflight?.[nodeId];
    if (p && p.estado !== 'modelado') return p.motivo;
    const e = echoOf(nodeId);
    if (e && e.estado !== 'modelado') return e.motivo;
    return null;
  };
  const openReason = openEnd(source) || openEnd(target);

  const isInvalid = data?.isInvalid;
  const errorMessage = data?.errorMessage;

  const src = powerFor(plan, source);
  const kw = src.kw;
  const width = flowWidthFor(kw);
  const color = isInvalid
    ? 'var(--destructive)'
    : openReason
      ? 'var(--off, #94a3b8)'
      : data?.currentType === CURRENT_TYPE.AC
        ? '#f59e0b'
        : '#3b82f6';

  const baseStyle = {
    ...style,
    stroke: color,
    strokeWidth: selected ? width + 0.7 : width,
    strokeDasharray: openReason ? '5 7' : undefined,
    opacity: openReason ? 0.4 : undefined,
  };
  const flowStyle = {
    ...style,
    stroke: color,
    strokeWidth: openReason ? 2 : width,
    opacity: openReason ? 0.4 : undefined,
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={baseStyle} />
      {!openReason && kw > 0.01 && (
        <path d={edgePath} fill="none" className="edge-flow" style={flowStyle} />
      )}
      <EdgeLabelRenderer>
        <div
          className="absolute pointer-events-none"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
        >
          {openReason ? (
            // Cierre 12.4: el extremo no participa en el modelo (preflight/eco
            // !== 'modelado'). La etiqueta dice lo que es ("sin modelo"); "s=0"
            // queda RESERVADO al seccionador del cambio 15 (P <= M*s). El trazo
            // tenue + discontinuo sigue siendo la convencion de "no simulable".
            <div className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap bg-card" style={{ color: 'var(--off, #94a3b8)', borderColor: 'var(--off, #94a3b8)' }}>
              <span>sin modelo</span>
            </div>
          ) : (
            kw > 0.01 && (
              <div className="text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap bg-card" style={{ color, borderColor: color }}>
                {src.dir} {kw.toFixed(1)} kW
              </div>
            )
          )}
        </div>
        {isInvalid && errorMessage && (
          <div
            className="absolute pointer-events-none"
            style={{ transform: `translate(-50%, -120%) translate(${labelX}px,${labelY}px)` }}
          >
            <div className="bg-destructive text-destructive-foreground text-[10px] px-2 py-1 rounded-md shadow-md whitespace-nowrap font-medium">
              {errorMessage}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {};

export const edgeTypes = { powerEdge: memo(PowerEdge) };
