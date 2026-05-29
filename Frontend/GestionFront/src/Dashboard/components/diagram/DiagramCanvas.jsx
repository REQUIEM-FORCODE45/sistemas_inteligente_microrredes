import { useMemo, useCallback } from 'react';
import SolarPanelNode from './nodes/SolarPanelNode';
import DieselGeneratorNode from './nodes/DieselGeneratorNode';
import GridNode from './nodes/GridNode';
import InverterNode from './nodes/InverterNode';
import BatteryNode from './nodes/BatteryNode';
import LoadNode from './nodes/LoadNode';
import SensorNode from './nodes/SensorNode';
import { DEVICE_TYPE } from './constants/deviceTypes';

export const nodeTypes = {
  [DEVICE_TYPE.SOLAR_PANEL]: SolarPanelNode,
  [DEVICE_TYPE.DIESEL_GENERATOR]: DieselGeneratorNode,
  [DEVICE_TYPE.GRID]: GridNode,
  [DEVICE_TYPE.INVERTER]: InverterNode,
  [DEVICE_TYPE.BATTERY]: BatteryNode,
  [DEVICE_TYPE.LOAD]: LoadNode,
  [DEVICE_TYPE.SENSOR]: SensorNode,
};

export function useDragHandlers() {
  const onDragStart = useCallback((event, device) => {
    event.dataTransfer.setData(
      'application/reactflow-device',
      JSON.stringify({ deviceType: device.type, category: device.category }),
    );
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return { onDragStart };
}
