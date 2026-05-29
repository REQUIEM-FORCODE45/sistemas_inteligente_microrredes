import { BITRATE, CURRENT_TYPE, DEVICE_TYPE, DEVICE_DEFINITIONS } from '../constants/deviceTypes';

export function validateConnection(sourceNode, targetNode, nodes, edges, excludeEdgeId = null) {
  const sourceDevice = DEVICE_DEFINITIONS[sourceNode?.data?.deviceType];
  const targetDevice = DEVICE_DEFINITIONS[targetNode?.data?.deviceType];

  if (!sourceDevice || !targetDevice) {
    return { valid: false, reason: 'Tipo de dispositivo no reconocido.' };
  }

  if (sourceNode.id === targetNode.id) {
    return { valid: false, reason: 'No se puede conectar un dispositivo consigo mismo.' };
  }

  if (sourceDevice.bitrate === BITRATE.SINK) {
    return {
      valid: false,
      reason: `Una "${sourceDevice.label}" no puede ser origen. Solo admite terminal de entrada.`,
    };
  }

  if (targetDevice.bitrate === BITRATE.SOURCE) {
    return {
      valid: false,
      reason: `Una "${targetDevice.label}" no puede ser destino. Solo admite terminal de salida.`,
    };
  }

  if (edgeExists(sourceNode.id, targetNode.id, edges, excludeEdgeId)) {
    return { valid: false, reason: 'Esta conexión ya existe.' };
  }

  const currentCheck = validateCurrentCompatibility(sourceNode, targetNode, nodes, edges);
  if (!currentCheck.valid) return currentCheck;

  const cycleCheck = detectCycle(sourceNode.id, targetNode.id, nodes, edges);
  if (cycleCheck) return { valid: false, reason: 'Esta conexión crearía un bucle cerrado.' };

  return { valid: true };
}

function edgeExists(sourceId, targetId, edges, excludeId = null) {
  return edges.some(
    (e) => e.source === sourceId && e.target === targetId && (excludeId === null || e.id !== excludeId),
  );
}

function validateCurrentCompatibility(sourceNode, targetNode, nodes, edges) {
  const sourceDef = DEVICE_DEFINITIONS[sourceNode.data?.deviceType];
  const targetDef = DEVICE_DEFINITIONS[targetNode.data?.deviceType];

  const effectiveSourceCurrent = resolveNodeCurrentType(sourceNode, 'source');
  const effectiveTargetCurrent = resolveNodeCurrentType(targetNode, 'sink');

  if (!effectiveSourceCurrent || !effectiveTargetCurrent) return { valid: true };

  if (effectiveSourceCurrent === effectiveTargetCurrent) return { valid: true };

  if (effectiveSourceCurrent === CURRENT_TYPE.DC && effectiveTargetCurrent === CURRENT_TYPE.AC) {
    const sourceIsInverter = sourceDef?.type === DEVICE_TYPE.INVERTER;
    if (!sourceIsInverter) {
      return {
        valid: false,
        reason: 'No se puede conectar una fuente DC a una carga AC sin un Inversor intermedio.',
      };
    }
    return { valid: true };
  }

  if (effectiveSourceCurrent === CURRENT_TYPE.AC && effectiveTargetCurrent === CURRENT_TYPE.DC) {
    return {
      valid: false,
      reason: 'Corriente AC no puede alimentar directamente un dispositivo DC.',
    };
  }

  return { valid: true };
}

function resolveNodeCurrentType(node, direction) {
  const def = DEVICE_DEFINITIONS[node.data?.deviceType];
  if (!def || !def.currentType) return null;

  if (def.type === DEVICE_TYPE.INVERTER) {
    return direction === 'source' ? def.convertsTo : def.convertsFrom;
  }

  return def.currentType;
}

function detectCycle(newSourceId, newTargetId, nodes, edges) {
  const adjacency = new Map();
  const nodeIds = new Set(nodes.map((n) => n.id));

  nodeIds.forEach((id) => adjacency.set(id, []));
  edges.forEach((e) => {
    if (adjacency.has(e.source) && adjacency.has(e.target)) {
      adjacency.get(e.source).push(e.target);
    }
  });

  if (adjacency.has(newSourceId)) {
    adjacency.get(newSourceId).push(newTargetId);
  }

  const visited = new Set();
  const recStack = new Set();

  function dfs(vertex) {
    visited.add(vertex);
    recStack.add(vertex);

    for (const neighbor of adjacency.get(vertex) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(vertex);
    return false;
  }

  for (const node of nodeIds) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
}

export function propagateSensorDependencies(nodes, edges, sensorMappings) {
  const adjacency = new Map();
  const reverseAdj = new Map();

  nodes.forEach((n) => {
    adjacency.set(n.id, []);
    reverseAdj.set(n.id, []);
  });

  edges.forEach((e) => {
    if (adjacency.has(e.source)) adjacency.get(e.source).push(e.target);
    if (reverseAdj.has(e.target)) reverseAdj.get(e.target).push(e.source);
  });

  const dependencies = {};

  Object.entries(sensorMappings).forEach(([nodeId, sensorId]) => {
    dependencies[nodeId] = sensorId;

    const visited = new Set();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      visited.add(current);

      const downstream = adjacency.get(current) || [];
      downstream.forEach((child) => {
        if (!visited.has(child)) {
          dependencies[child] = dependencies[child] || sensorId;
          queue.push(child);
        }
      });
    }
  });

  return dependencies;
}

export function findDownstreamNodes(nodeId, nodes, edges) {
  const adjacency = new Map();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => {
    if (adjacency.has(e.source)) adjacency.get(e.source).push(e.target);
  });

  const visited = new Set();
  const queue = [nodeId];
  const downstream = [];

  while (queue.length > 0) {
    const current = queue.shift();
    visited.add(current);
    if (current !== nodeId) downstream.push(current);

    (adjacency.get(current) || []).forEach((child) => {
      if (!visited.has(child)) queue.push(child);
    });
  }

  return downstream;
}
