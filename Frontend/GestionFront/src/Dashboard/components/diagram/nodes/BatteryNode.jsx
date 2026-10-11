import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useSelector } from 'react-redux';
import { getNodeBadgeInfo } from '../constants/deviceTypes';
import DeviceStatusBadge from '../components/DeviceStatusBadge';
import { TypeSymbol } from '../constants/symbols';
import { CATEGORY_ACCENT } from '../constants/deviceTypes';
import { useCardStatus } from '../components/cardStatus';

function BatteryNode({ id, data, selected }) {
  const params = data.params || {};
  const accent = CATEGORY_ACCENT[data.deviceType];
  const cardStatus = useCardStatus(id, data.deviceType);
  const chargePct = params.chargeLevel ?? 0;

  const latestResult = useSelector((state) => state.optimization.latestResult);
  const badge = getNodeBadgeInfo(latestResult?.dispatch_plan, data.id, data.deviceType);
  const currentDispatch = badge?.label || null;

  return (
    <div
      className={`
        relative w-[180px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-chart-2 ring-offset-2 border-chart-2/50' : 'border-emerald-200 dark:border-emerald-800'}
        hover:shadow-md
      `}
    >
      <DeviceStatusBadge nodeId={id} />
      <div className="absolute top-0 left-4 right-4 h-1 rounded-b" style={{ background: accent }} />
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-t-xl">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
          <TypeSymbol type={data.deviceType} size={18} color={accent} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 truncate">
            {data.label || 'Banco de Baterías'}
          </p>
          <div className="flex gap-1 mt-0.5">
            <ArrowDown className="w-2.5 h-2.5 text-emerald-500" />
            <ArrowUp className="w-2.5 h-2.5 text-emerald-500" />
            <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">DC Bidir.{cardStatus && (<span style={{ color: cardStatus.color }}> · {cardStatus.text}</span>)}</span>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Capacidad</span>
          <span className="font-medium tabular-nums text-foreground">
            {params.capacity ? `${(params.capacity / 1000).toFixed(1)} kWh` : '—'}
          </span>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-muted-foreground">Nivel de carga</span>
            <span className="font-medium tabular-nums text-foreground">{chargePct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${chargePct}%`,
                backgroundColor:
                  chargePct > 60 ? 'var(--chart-2)' : chargePct > 30 ? 'var(--chart-4)' : 'var(--destructive)',
              }}
            />
          </div>
        </div>
      </div>
      {data.hasSensor && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-chart-5 border-2 border-card shadow-sm" />
      )}
      {currentDispatch && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap"
             style={{ backgroundColor: badge?.color || '#8b5cf6', borderColor: badge?.color || '#8b5cf6' }}>
          {currentDispatch}
        </div>
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-chart-2 !border-2 !border-card !shadow-sm"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-chart-2 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(BatteryNode);
