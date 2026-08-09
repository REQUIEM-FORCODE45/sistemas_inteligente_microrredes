import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ArrowLeftRight } from 'lucide-react';

function InverterNode({ data, selected }) {
  const params = data.params || {};

  return (
    <div
      className={`
        relative w-[190px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-chart-3 ring-offset-2 border-chart-3/50' : 'border-blue-200 dark:border-blue-800'}
        hover:shadow-md
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/30 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 truncate">
            {data.label || 'Inversor'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">DC</span>
            <span className="text-[10px] text-blue-400">→</span>
            <span className="text-[10px] bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">AC</span>
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
            {params.efficiency != null ? `${(params.efficiency * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/70 border-t border-border/50 pt-1">
          Solo visual · no participa en el modelo
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
