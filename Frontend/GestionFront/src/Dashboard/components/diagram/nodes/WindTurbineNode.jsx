import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSelector } from 'react-redux';
import { getNodeBadgeInfo } from '../constants/deviceTypes';
import DeviceStatusBadge from '../components/DeviceStatusBadge';
import { TypeSymbol } from '../constants/symbols';
import { CATEGORY_ACCENT } from '../constants/deviceTypes';
import { useCardStatus } from '../components/cardStatus';

function WindTurbineNode({ id, data, selected }) {
  const params = data.params || {};
  const accent = CATEGORY_ACCENT[data.deviceType];
  const hora = useSelector((state) => state.diagram.horaMostrada ?? 12);
  const cardStatus = useCardStatus(id, data.deviceType, hora);

  const latestResult = useSelector((state) => state.optimization.latestResult);
  const badge = getNodeBadgeInfo(latestResult?.dispatch_plan, id, data.deviceType, hora);
  const currentDispatch = badge?.label || null;
  return (
    <div
      className={`
        relative w-[185px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-slate-500 ring-offset-2 border-slate-400/50' : 'border-slate-200 dark:border-slate-700'}
        hover:shadow-md
      `}
    >
      <DeviceStatusBadge nodeId={id} />
      <div className="absolute top-0 left-4 right-4 h-1 rounded-b" style={{ background: accent }} />
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/50 bg-teal-50/60 dark:bg-teal-950/20 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
          <TypeSymbol type={data.deviceType} size={18} color={accent} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            {data.label || 'Aerogenerador'}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">AC{cardStatus && (<span style={{ color: cardStatus.color }}> · {cardStatus.text}</span>)}</p>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Max</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.maxCapacity ? `${(params.maxCapacity / 1000).toFixed(0)} kW` : '100 kW'}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Eficiencia</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.efficiency != null ? params.efficiency : '0.4'}
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
        className="!w-3 !h-3 !bg-slate-500 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(WindTurbineNode);