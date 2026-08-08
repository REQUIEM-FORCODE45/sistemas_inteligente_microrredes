import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Sun } from 'lucide-react';
import { useSelector } from 'react-redux';
import { getNodeBadgeInfo } from '../constants/deviceTypes';

function SolarPanelAcNode({ data, selected }) {
  const params = data.params || {};

  const latestResult = useSelector((state) => state.optimization.latestResult);
  const badge = getNodeBadgeInfo(latestResult?.dispatch_plan, data.id, data.deviceType);
  const currentDispatch = badge?.label || null;
  return (
    <div
      className={`
        relative w-[170px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-chart-4 ring-offset-2 border-chart-4/50' : 'border-teal-200 dark:border-teal-800'}
        hover:shadow-md
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-teal-100 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/30 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
          <Sun className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 truncate">
            {data.label || 'Panel Solar AC'}
          </p>
          <p className="text-[10px] text-teal-500 dark:text-teal-400 font-medium">AC</p>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Capacidad</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.maxCapacity ?? '—'} W
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Eff. (con inv.)</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.efficiency != null && params.invEfficiency != null
              ? `${((params.efficiency * params.invEfficiency) * 100).toFixed(0)}%`
              : params.efficiency != null ? `${(params.efficiency * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
      </div>
      {data.hasSensor && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-chart-5 border-2 border-card shadow-sm" />
      )}
      {currentDispatch && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap"
             style={{ backgroundColor: badge?.color || '#14b8a6', borderColor: badge?.color || '#14b8a6' }}>
          {currentDispatch}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-chart-4 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(SolarPanelAcNode);