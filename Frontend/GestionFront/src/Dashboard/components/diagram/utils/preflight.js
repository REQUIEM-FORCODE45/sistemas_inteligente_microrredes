import {
  DEVICE_DEFINITIONS,
  UNSUPPORTED_SOLVER_TYPES,
} from '../constants/deviceTypes';

// Cambio 12.2 — pre-flight: marca nodos no simulables ANTES de lanzar.
// Avisa y marca; NO bloquea el envío (el solver decide y lo reporta).
// Recibe los mappers por parámetro para no duplicar la tabla ni ciclar imports.
export function preflightNodes(nodes, mappers) {
  const out = [];
  for (const node of nodes || []) {
    const def = DEVICE_DEFINITIONS[node.type];
    if (!def) continue;
    const reason = UNSUPPORTED_SOLVER_TYPES[node.type]
      || (!mappers?.[node.type] || !def.solverCategory
        ? 'sin camino al modelo del solver' : null);
    if (reason) out.push({ id: node.id, estado: 'ignorado', motivo: reason });
  }
  return out;
}
