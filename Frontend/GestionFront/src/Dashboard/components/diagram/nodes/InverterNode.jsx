import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import DeviceStatusBadge from '../components/DeviceStatusBadge';
import { TypeSymbol } from '../constants/symbols';
import { CATEGORY_ACCENT } from '../constants/deviceTypes';
import { useCardStatus } from '../components/cardStatus';

// Cambio 13: el inversor participa en el modelo (P_ac = eta*P_dc). La tarjeta
// muestra la pildora de estado desde el plan; sin eta declarada la fila de
// Eficiencia queda en '—' (nada inventado) y el pre-flight avisa 'sin η'.
function InverterNode({ id, data, selected }) {
  const params = data.params || {};
  const accent = CATEGORY_ACCENT[data.deviceType];
  const status = useCardStatus(id, data.deviceType);

  return (
    <div
      className={`
        relative w-[190px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-chart-3 ring-offset-2 border-chart-3/50' : 'border-blue-200 dark:border-blue-800'}
        hover:shadow-md
      `}
    >
      <DeviceStatusBadge nodeId={id} />
      <div className="absolute top-0 left-4 right-4 h-1 rounded-b" style={{ background: accent }} />
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/30 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
          <TypeSymbol type={data.deviceType} size={18} color={accent} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 truncate">
            {data.label || 'Inversor'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">DC</span>
            <span className="text-[10px] text-blue-400">→</span>
            <span className="text-[10px] bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">AC</span>
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
            {params.maxCapacity ? `${(params.maxCapacity / 1000).toFixed(1)} kW` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Eficiencia</span>
          <span className="font-medium tabular-nums text-foreground">
            {Number(params.efficiency) > 0 ? `${(Number(params.efficiency) * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
      </div>
      {data.hasSensor && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-chart-5 border-2 border-card shadow-sm" />
      )}
      <Handle
        type="target"
        position={Position.Top}
        id="dc-in"
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

export default memo(InverterNode);
