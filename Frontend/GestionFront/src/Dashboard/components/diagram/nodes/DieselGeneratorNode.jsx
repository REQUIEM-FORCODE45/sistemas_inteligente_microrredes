import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Fuel } from 'lucide-react';
import { useSelector } from 'react-redux';
import { getNodeBadgeInfo } from '../constants/deviceTypes';

function DieselGeneratorNode({ data, selected }) {
  const params = data.params || {};

  const latestResult = useSelector((state) => state.optimization.latestResult);
  const badge = getNodeBadgeInfo(latestResult?.dispatch_plan, data.id, data.deviceType);
  const currentDispatch = badge?.label || null;
  return (
    <div
      className={`
        relative w-[185px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-slate-500 ring-offset-2 border-slate-400/50' : 'border-slate-200 dark:border-slate-700'}
        hover:shadow-md
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Fuel className="w-4.5 h-4.5 text-slate-600 dark:text-slate-300" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            {data.label || 'Generador Diesel'}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">AC</p>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Max</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.maxCapacity ? `${(params.maxCapacity / 1000).toFixed(0)} kW` : '300 kW'}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Min</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.minCapacity ? `${(params.minCapacity / 1000).toFixed(0)} kW` : '50 kW'}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">C. Combustible</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.fuelCost ? `${params.fuelCost}` : '100'}
          </span>
        </div>
      </div>
      {data.hasSensor && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-chart-5 border-2 border-card shadow-sm" />
      )}
      {currentDispatch && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap"
             style={{ backgroundColor: badge?.color || '#3b82f6', borderColor: badge?.color || '#3b82f6' }}>
          {currentDispatch}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-slate-500 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(DieselGeneratorNode);
