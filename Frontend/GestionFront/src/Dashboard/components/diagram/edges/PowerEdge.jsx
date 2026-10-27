import { memo, useMemo } from 'react';
import { BaseEdge, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import { useSelector } from 'react-redux';
import { CURRENT_TYPE, flowWidthFor } from '../constants/deviceTypes';

// Cambio 12.4 — rama unifilar (variante B, copiada de la referencia):
// derivación ortogonal (smoothstep), grosor ∝ kW, capa de flujo animada
// (CSS puro, sin estado por frame), badge en el conector con sentido ▲/▼.
// Rama abierta (extremo no modelado): tenue + discontinua + marca "sin modelo".
// Cambio 16 (C4/C8) — el badge refleja SU rama: caudal que cruza el edge
// saliendo por su COLA en la hora mostrada (si un extremo es la barra, la
// cola es el otro). Familias con signo geométrico: + fluye source→target,
// − al revés. `ens`/`curt` excluidos (auxiliares, no fluyen por la rama).
const AUX_TYPES = new Set(['ens', 'curtailment']);
// Sumideros: el fallback de cola al destino SOLO vale para estos tipos
// (su consumo entra por ESA rama; ver cierre §3.3).
const SINK_TYPES = new Set(['load']);
// Filas del plan para un extremo en una hora (misma regla que ramaFlow;
// la red emite con device_id literal "grid").
function rowsFor(plan, nodeId, nodeType, hour) {
  if (!plan || !nodeId) return [];
  return plan.filter((d) => (d.device_id === nodeId || (nodeType === 'grid' && d.device_id === 'grid'))
    && d.hour === hour && !AUX_TYPES.has(d.device_type));
}
function ramaFlow(plan, tailId, tailType, hour) {
  const rows = rowsFor(plan, tailId, tailType, hour);
  if (rows.length === 0) return { kw: 0, signed: 0 };
  const pw = (t) => {
    const e = rows.find((d) => d.device_type === t);
    return e ? Math.abs(e.power_kw || 0) : 0;
  };
  switch (tailType) {
    case 'grid': {
      // import sale de la red (▲), export entra a la red (▼).
      const net = pw('grid_import') - pw('grid_export');
      return { kw: Math.abs(net), signed: net };
    }
    case 'battery': {
      // descarga sale (▲), carga entra (▼).
      const net = pw('battery_discharge') - pw('battery_charge');
      return { kw: Math.abs(net), signed: net };
    }
    case 'transformer': {
      // sale lo entregado: paso − pérdida (C8: 10.0 → 9.8, no el máximo).
      const out = pw('transformer') - pw('transformer_loss');
      return { kw: Math.abs(out), signed: out };
    }
    case 'inverter': {
      // serie: P_ac; bus DC: AC − rev; dc/loss excluidos (no salen al AC).
      const net = pw('inverter') - pw('inverter_rev');
      return { kw: Math.abs(net), signed: net };
    }
    case 'load': {
      // la carga consume: entra por la rama (▼).
      const v = pw('load');
      return { kw: v, signed: -v };
    }
    default: {
      // solar/wind/diesel: generan, sale por la cola (▲).
      const v = rows.reduce((s, d) => s + Math.abs(d.power_kw || 0), 0);
      return { kw: v, signed: v };
    }
  }
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
  const srcType = useSelector((state) => (state.diagram.nodes || []).find((n) => n.id === source)?.data?.deviceType);
  const tgtType = useSelector((state) => (state.diagram.nodes || []).find((n) => n.id === target)?.data?.deviceType);
  const hora = useSelector((state) => state.diagram.horaMostrada ?? 12);
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
      // Cambio 19 (C3): el seccionador en modo solver refleja la maniobra
      // programada para la hora mostrada (schedule[hora - 1]).
      const swVal = topoSw.schedule?.[hora - 1];
      swState = (swVal === 0 || swVal === false || swVal === 'open') ? 'open' : 'closed';
    }
  }
  const swOpen = swState === 'open';
  const ramaAbierta = openReason || swOpen;
  const glyph = swOpen ? '#s-sw-o' : '#s-sw-c';

  const isInvalid = data?.isInvalid;
  const errorMessage = data?.errorMessage;

  // Cambio 16, cierre §3.3: la cola es el extremo CON filas (origen primero).
  // El fallback al destino SOLO vale para sumideros (load: su consumo entra
  // por ESA rama). Sin esto, una rama inactiva heredaria el flujo de otra
  // (p. ej. batt→inv en hora sin bateria mostraba el 9.7 del inversor).
  const flow = useMemo(
    () => {
      const srcRows = rowsFor(plan, source, srcType, hora);
      const useSrc = srcRows.length > 0;
      const useDst = !useSrc && SINK_TYPES.has(tgtType)
        && rowsFor(plan, target, tgtType, hora).length > 0;
      if (!useSrc && !useDst) return { kw: 0, signed: 0, fwd: true };
      const tId = useSrc ? source : target;
      const tType = useSrc ? srcType : tgtType;
      const net = ramaFlow(plan, tId, tType, hora);
      const signed = useSrc ? net.signed : -net.signed;
      return { kw: net.kw, signed, fwd: signed >= 0 };
    },
    [plan, source, target, srcType, tgtType, hora],
  );
  const kw = flow.kw;
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
  // Cambio 16: animación direccional por sentido real (CSS puro, sin estado
  // por frame — regla 4). Se respeta prefers-reduced-motion en el CSS.
  const flowClass = `edge-flow ${flow.fwd ? 'flow-fwd' : 'flow-rev'}`;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={baseStyle} />
      {!ramaAbierta && kw > 0.01 && (
        <path d={edgePath} fill="none" className={flowClass} style={flowStyle} />
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
                {flow.signed >= 0 ? '+' : '−'}{kw.toFixed(1)} kW
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
