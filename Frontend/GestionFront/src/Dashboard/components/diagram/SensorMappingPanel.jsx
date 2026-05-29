import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { mapSensor, unmapSensor } from '@/Dashboard/store/diagram/diagramSlice';
import { cn } from '@/lib/utils';
import { Radio, Unlink, Link2, Wifi } from 'lucide-react';
import { DEVICE_DEFINITIONS, DEVICE_TYPE } from './constants/deviceTypes';

export default function SensorMappingPanel() {
  const dispatch = useDispatch();
  const nodes = useSelector((state) => state.diagram.nodes);
  const sensorMappings = useSelector((state) => state.diagram.sensorMappings);
  const propagationDeps = useSelector((state) => state.diagram.propagationDeps);
  const devices = useSelector((state) => state.devices.devices);

  const [filter, setFilter] = useState('');

  const handleMap = useCallback(
    (nodeId, sensorId) => {
      dispatch(mapSensor({ nodeId, sensorId }));
    },
    [dispatch],
  );

  const handleUnmap = useCallback(
    (nodeId) => {
      dispatch(unmapSensor(nodeId));
    },
    [dispatch],
  );

  const filteredDevices = devices.filter((d) =>
    d.name?.toLowerCase().includes(filter.toLowerCase()) ||
    d._id?.toLowerCase().includes(filter.toLowerCase()),
  );

  const mappableNodes = nodes.filter(
    (n) => n.data?.deviceType !== DEVICE_TYPE.SENSOR,
  );

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <div className="px-3.5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-chart-5" />
          <p className="text-xs font-semibold text-foreground tracking-wide uppercase">
            Mapeo de Sensores
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Vincula sensores reales a equipos del diagrama
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 border-b border-border/50">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
            Sensores disponibles
          </p>
          <input
            type="text"
            placeholder="Buscar sensor..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-[11px] rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-colors"
          />
          <div className="mt-2 space-y-1 max-h-[180px] overflow-y-auto">
            {filteredDevices.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/60 text-center py-3">
                Sin resultados
              </p>
            ) : (
              filteredDevices.map((device) => (
                <div
                  key={device._id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
                >
                  <Wifi className="w-3 h-3 text-muted-foreground/60" />
                  <span className="text-[11px] text-foreground truncate flex-1">
                    {device.name || device._id?.slice(-8)}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono opacity-50">
                    {device._id?.slice(-4)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
            Equipos en el diagrama
          </p>

          {mappableNodes.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/60 text-center py-4">
              Agrega equipos al lienzo para mapear sus sensores.
            </p>
          ) : (
            <div className="space-y-1">
              {mappableNodes.map((node) => {
                const def = DEVICE_DEFINITIONS[node.data?.deviceType];
                const mappedSensorId = sensorMappings[node.id];
                const propagated = propagationDeps[node.id] && propagationDeps[node.id] !== mappedSensorId;
                const Icon = def?.icon;

                return (
                  <div
                    key={node.id}
                    className={cn(
                      'rounded-lg border transition-colors',
                      mappedSensorId
                        ? 'border-chart-5/30 bg-chart-5/[0.04]'
                        : 'border-border bg-card hover:border-foreground/15',
                    )}
                  >
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      {Icon && (
                        <Icon className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" />
                      )}
                      <span className="text-[11px] font-medium text-foreground truncate flex-1">
                        {node.data.label || def?.label || 'Equipo'}
                      </span>
                    </div>

                    <div className="px-2.5 pb-2 space-y-1">
                      {mappedSensorId ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-chart-5/10 rounded-md px-2 py-1">
                            <p className="text-[9px] text-chart-5 font-mono truncate">
                              {mappedSensorId}
                            </p>
                            {propagated && (
                              <p className="text-[8px] text-muted-foreground mt-0.5 italic">
                                Propagado desde aguas arriba
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleUnmap(node.id)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Desvincular sensor"
                          >
                            <Unlink className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ) : (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) handleMap(node.id, e.target.value);
                          }}
                          className="w-full px-2 py-1 text-[10px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40"
                        >
                          <option value="">Seleccionar sensor...</option>
                          {devices.map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.name || d._id?.slice(-8)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border bg-muted/30">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
            Dependencias propagadas
          </h4>
          {Object.keys(propagationDeps).length === 0 ? (
            <p className="text-[10px] text-muted-foreground/60">
              Los sensores se propagan automáticamente a los nodos aguas abajo cuando se define una conexión.
            </p>
          ) : (
            <div className="text-[10px] text-muted-foreground space-y-1">
              {Object.entries(propagationDeps).map(([nodeId, sensorId]) => {
                const node = nodes.find((n) => n.id === nodeId);
                const isDirect = sensorMappings[nodeId] === sensorId;
                if (isDirect) return null;
                return (
                  <div key={nodeId} className="flex items-center gap-1.5">
                    <Link2 className="w-2.5 h-2.5 text-chart-5/50 flex-shrink-0" />
                    <span className="truncate">
                      <strong className="font-medium text-foreground/70">
                        {node?.data.label || nodeId.slice(-6)}
                      </strong>
                      {' ← '}
                      <span className="text-chart-5/70 font-mono text-[9px]">{sensorId.slice(-6)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
