import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Radio, Wifi } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { mapSensor, unmapSensor } from '@/Dashboard/store/diagram/diagramSlice';

function SensorNode({ id, data, selected }) {
  const dispatch = useDispatch();
  const params = data.params || {};
  const mappedSensorId = data.mappedSensorId;
  const mqttDevices = useSelector((state) => state.devices.devices || []);

  const handleSensorSelect = useCallback(
    (e) => {
      const sensorId = e.target.value;
      if (sensorId) {
        dispatch(mapSensor({ nodeId: id, sensorId }));
      } else {
        dispatch(unmapSensor(id));
      }
    },
    [dispatch, id],
  );

  return (
    <div
      className={`
        relative w-[210px] rounded-xl border-2 bg-card shadow-sm transition-all duration-200
        ${selected ? 'ring-2 ring-chart-5 ring-offset-2 border-chart-5/50' : 'border-purple-200 dark:border-purple-800'}
        hover:shadow-md
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-purple-100 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/30 rounded-t-xl">
        <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
          <Radio className="w-4 h-4 text-purple-600 dark:text-purple-400" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-purple-800 dark:text-purple-200 truncate">
            {data.label || 'Sensor IoT'}
          </p>
        </div>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div>
          <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
            Sensor MQTT vinculado
          </label>
          <div className="relative">
            <select
              value={mappedSensorId || ''}
              onChange={handleSensorSelect}
              className="w-full px-2 py-1.5 text-[10px] rounded-md border border-input bg-background text-foreground appearance-none pr-6 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 cursor-pointer"
            >
              <option value="">Seleccionar sensor...</option>
              {mqttDevices.map((device) => (
                <option key={device._id} value={device._id}>
                  {device.name || device._id?.slice(-8)}
                </option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="8" height="4" viewBox="0 0 8 4" fill="none">
                <path d="M1 1l3 2 3-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-muted-foreground"/>
              </svg>
            </div>
          </div>
        </div>

        {mappedSensorId ? (
          <div className="flex items-center gap-1.5 text-[10px] text-chart-5 bg-chart-5/[0.06] rounded-md px-2 py-1">
            <Wifi className="w-3 h-3 flex-shrink-0" />
            <span className="font-mono truncate" title={mappedSensorId}>
              {mappedSensorId.slice(-12)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 italic px-2 py-1">
            Sin sensor vinculado
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-chart-5 !border-2 !border-card !shadow-sm"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-chart-5 !border-2 !border-card !shadow-sm"
      />
    </div>
  );
}

export default memo(SensorNode);
