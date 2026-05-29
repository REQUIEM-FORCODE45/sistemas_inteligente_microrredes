import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Building } from 'lucide-react';
import { useSelector } from 'react-redux';
import { getNodeBadgeInfo } from '../constants/deviceTypes';

function LoadNode({ data, selected }) {
  const params = data.params || {};
  const consumption = params.consumption ?? 0;

  const latestResult = useSelector((state) => state.optimization.latestResult);
  const badge = getNodeBadgeInfo(latestResult?.dispatch_plan, data.id, data.deviceType);
  const currentDispatch = badge ? `← ${badge.label}` : null;

  return (
    <div
      className={`
        relative w-[170px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-foreground ring-offset-2' : 'border-border'}
        hover:shadow-md
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/30 dark:bg-muted/10 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-secondary dark:bg-muted/40 flex items-center justify-center flex-shrink-0">
          <Building className="w-4.5 h-4.5 text-foreground/60" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {data.label || 'Carga / Edificio'}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium">AC</p>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Carga máx.</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.maxLoad ? `${(params.maxLoad / 1000).toFixed(0)} kW` : '—'}
          </span>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-muted-foreground">Consumo</span>
            <span className="font-medium tabular-nums text-foreground">
              {consumption > 0 ? `${(consumption / 1000).toFixed(1)} kW` : '0 kW'}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-chart-1 transition-all duration-500"
              style={{ width: `${Math.min((consumption / (params.maxLoad || 1)) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
      {data.hasSensor && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-chart-5 border-2 border-card shadow-sm" />
      )}
      {currentDispatch && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap"
             style={{ backgroundColor: badge?.color || '#111827', borderColor: badge?.color || '#111827' }}>
          {currentDispatch}
        </div>
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-foreground/40 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(LoadNode);
