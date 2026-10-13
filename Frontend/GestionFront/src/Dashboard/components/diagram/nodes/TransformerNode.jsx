import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import DeviceStatusBadge from '../components/DeviceStatusBadge';
import { TypeSymbol } from '../constants/symbols';
import { CATEGORY_ACCENT } from '../constants/deviceTypes';
import { useCardStatus } from '../components/cardStatus';

// Cambio 14 — Transformador (variante B, símbolo s-trafo verbatim).
// Etapa en la RAMA DE RED: pérdidas P_out = P_in·(1−p) + tope S_max·pf.
// La tarjeta muestra el rótulo de nivel + la NOTA DE ALCANCE (frontera AC-OPF:
// tensión/impedancia NO se simulan) — visible en la captura, no solo en código.
function TransformerNode({ id, data, selected }) {
  const params = data.params || {};
  const accent = CATEGORY_ACCENT[data.deviceType];
  const status = useCardStatus(id, data.deviceType);
  const lp = Number(params.lossesPct);
  const et = Number(params.efficiency);
  const perdidas = lp > 0
    ? `${lp.toFixed(1)}%`
    : (et > 0 ? `η ${(et * 100).toFixed(0)}%` : '—');
  return (
    <div
      className={`
        relative w-[200px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-chart-3 ring-offset-2 border-chart-3/50' : 'border-sky-200 dark:border-sky-800'}
        hover:shadow-md
      `}
    >
      <DeviceStatusBadge nodeId={id} />
      <div className="absolute top-0 left-4 right-4 h-1 rounded-b" style={{ background: accent }} />
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-sky-100 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/30 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
          <TypeSymbol type={data.deviceType} size={18} color={accent} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-200 truncate">
            {data.label || 'Transformador'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] bg-sky-200 dark:bg-sky-800/50 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded font-medium">
              {params.ratioLabel || 'AC → AC'}
            </span>
            {status && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: status.color }}>
                {status.text}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Capacidad</span>
          <span className="font-medium tabular-nums text-foreground">
            {Number(params.capacityKva) > 0 ? `${Number(params.capacityKva).toFixed(0)} kVA` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Pérdidas</span>
          <span className="font-medium tabular-nums text-foreground">
            {perdidas}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/70 border-t border-border/50 pt-1">
          Despacho: pérdidas + capacidad · tensión/impedancia NO incluidas
        </div>
      </div>
      {data.hasSensor && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-chart-5 border-2 border-card shadow-sm" />
      )}
      <Handle
        type="target"
        position={Position.Top}
        id="ac-in"
        className="!w-3 !h-3 !bg-chart-3 !border-2 !border-card !shadow-sm"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="ac-out"
        className="!w-3 !h-3 !bg-chart-3 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(TransformerNode);
