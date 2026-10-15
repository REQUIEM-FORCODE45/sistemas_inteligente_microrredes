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
  const edgeData = useSelector((state) => (state.diagram.edges || []).find((e) => e.id === id)?.data);
  const plan = latestResult?.dispatch_plan;
  const echo = latestResult?.device_echo || [];
  const topoConns = latestResult?.topology?.connections || [];

  const echoOf = (nodeId) => echo.find((e) => e.device_id === nodeId);
  // Cambio 13: abierto = NO simulado ('ignorado'/'error'). Un 'aviso' (p. ej.
  // inversor sin eta, modelado en paso directo) sigue mostrando sus kW.
  const esAbierto = (it) => it && (it.estado === 'ignorado' || it.estado === 'error');
  const openEnd = (nodeId) => {
    const p = preflight?.[nodeId];
    if (esAbierto(p)) return p.motivo;
    const e = echoOf(nodeId);
    if (esAbierto(e)) return e.motivo;
    return null;
  };
  const openReason = openEnd(source) || openEnd(target);

  // Cambio 15: seccionador de la rama (simbolos s-sw-c/s-sw-o verbatim de la
  // referencia 12.4). Estado efectivo: el del resultado (topology) si hay
  // corrida, si no el del edge. "s=0" SOLO con seccionador abierto de verdad;
  // "sin modelo" (extremo no modelado) GANA si coincide (aviso mas fuerte).
  // Error del switch (sin M en solver) = fail-safe abierto: se dibuja
  // abierto; el motivo vive en el eco y el panel.
  const topoSw = topoConns.find((c) => c && c.id === id);
  let swState = edgeData?.switch_state || 'closed';
  let swSolver = (edgeData?.switch_mode || 'operador') === 'solver';
  if (topoSw) {
    if (topoSw.estado === 'error') {
      swState = 'open';
      swSolver = false;
    } else if (topoSw.switch_state) {
      swState = topoSw.switch_state;
      swSolver = false;
    } else if (topoSw.schedule) {
      swSolver = true;
    }
  }
  const swOpen = swState === 'open';
  const ramaAbierta = openReason || swOpen;
  const glyph = swOpen ? '#s-sw-o' : '#s-sw-c';

  const isInvalid = data?.isInvalid;
  const errorMessage = data?.errorMessage;

  const src = powerFor(plan, source);
  const kw = src.kw;
  const width = flowWidthFor(kw);
  const color = isInvalid
    ? 'var(--destructive)'
    : ramaAbierta
      ? 'var(--off, #94a3b8)'
      : data?.currentType === CURRENT_TYPE.AC
        ? '#f59e0b'
        : '#3b82f6';

  const baseStyle = {
    ...style,
    stroke: color,
    strokeWidth: selected ? width + 0.7 : width,
    strokeDasharray: ramaAbierta ? '5 7' : undefined,
    opacity: ramaAbierta ? 0.4 : undefined,
  };
  const flowStyle = {
    ...style,
    stroke: color,
    strokeWidth: ramaAbierta ? 2 : width,
    opacity: ramaAbierta ? 0.4 : undefined,
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={baseStyle} />
      {!ramaAbierta && kw > 0.01 && (
        <path d={edgePath} fill="none" className="edge-flow" style={flowStyle} />
      )}
      <EdgeLabelRenderer>
        <div
          className="absolute pointer-events-none"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
        >
          <div className="flex flex-col items-center gap-0.5">
            {/* Glifo del seccionador sobre la rama (siempre visible). */}
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
              style={{ color: ramaAbierta ? 'var(--off, #94a3b8)' : color }}>
              <use href={glyph} width="24" height="24" />
            </svg>
            {openReason ? (
            // Cierre 12.4: el extremo no participa en el modelo (preflight/eco
            // !== 'modelado'). La etiqueta dice lo que es ("sin modelo"); "s=0"
            // queda RESERVADO al seccionador del cambio 15 (P <= M*s). El trazo
            // tenue + discontinuo sigue siendo la convencion de "no simulable".
            <div className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap bg-card" style={{ color: 'var(--off, #94a3b8)', borderColor: 'var(--off, #94a3b8)' }}>
              <span>sin modelo</span>
            </div>
          ) : swOpen ? (
            // Cambio 15: "s=0" recupera su significado real: seccionador
            // ABIERTO de verdad (P <= M*0). Solo llega aqui si el extremo
            // esta modelado ("sin modelo" gana si coincide).
            <div className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap bg-card" style={{ color: 'var(--off, #94a3b8)', borderColor: 'var(--off, #94a3b8)' }}>
              <span>s=0</span>
            </div>
          ) : swSolver ? (
            <div className="text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap bg-card" style={{ color, borderColor: color }}>
              <span>solver</span>
            </div>
          ) : (
            kw > 0.01 && (
              <div className="text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap bg-card" style={{ color, borderColor: color }}>
                {src.dir} {kw.toFixed(1)} kW
              </div>
            )
          )}
          </div>
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
