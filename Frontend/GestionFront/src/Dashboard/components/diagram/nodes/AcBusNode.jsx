import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

// Cambio 12.4 — Barra AC (variante B, copiada de la referencia).
// Nodo DECORATIVO: no va al job ni al eco. ANCLADA (draggable:false en
// handleDrop): es estructura del esquema, no un dispositivo que se mueve.
// Seleccionable sí, para configurarla; sin modal de despacho (sin datos).
function AcBusNode({ id, data, selected }) {
  const params = data.params || {};
  const voltage = params.voltage ?? 220;
  const frequency = params.frequency ?? 60;
  return (
    <div
      className={`
        relative w-[880px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-foreground ring-offset-2' : 'border-border'}
        hover:shadow-md px-4 py-2
      `}
    >
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
        BUS AC · {voltage} V · {frequency} Hz
      </p>
      <svg viewBox="0 0 340 14" className="w-full h-[14px] mt-1" aria-hidden="true">
        <defs>
          <linearGradient id={`busg-${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="var(--grid, #f59e0b)" stopOpacity=".55" />
            <stop offset=".35" stopColor="var(--pv, #10b981)" stopOpacity=".55" />
            <stop offset=".7" stopColor="var(--bat, #3b82f6)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--load, #8b5cf6)" stopOpacity=".55" />
          </linearGradient>
        </defs>
        <rect x="0" y="2" width="340" height="10" rx="5" fill={`url(#busg-${id})`} />
        <rect x="0" y="6" width="340" height="2" rx="1" fill="var(--foreground)" opacity=".35" />
      </svg>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-foreground/40 !border-2 !border-card !shadow-sm"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-foreground/40 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(AcBusNode);
