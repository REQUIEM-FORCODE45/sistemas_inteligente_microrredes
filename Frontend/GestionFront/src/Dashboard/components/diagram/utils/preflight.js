import {
  DEVICE_DEFINITIONS,
  DEVICE_TYPE,
  UNSUPPORTED_SOLVER_TYPES,
} from '../constants/deviceTypes';

// Cambio 12.2 — pre-flight: marca nodos no simulables ANTES de lanzar.
// Avisa y marca; NO bloquea el envío (el solver decide y lo reporta).
// Recibe los mappers por parámetro para no duplicar la tabla ni ciclar imports.
export function preflightNodes(nodes, mappers) {
  const out = [];
  // Cambio 13.2 (C4): si algun inversor es puerta de bus DC, un panel AC en
  // el diagrama es error atribuido (el solver lo excluye, no lo adivina).
  const hayBusDc = (nodes || []).some(
    (n) => DEVICE_DEFINITIONS[n.type]?.solverType === 'inverter'
      && (n.data?.params?.busDc === true || n.data?.params?.busDc === 'true'),
  );
  for (const node of nodes || []) {
    const def = DEVICE_DEFINITIONS[node.type];
    // Cambio 12.4: los nodos decorativos no se marcan (no van al modelo).
    if (!def || def.decorative) continue;
    const reason = UNSUPPORTED_SOLVER_TYPES[node.type]
      || (!mappers?.[node.type] || !def.solverCategory
        ? 'sin camino al modelo del solver' : null);
    if (reason) {
      out.push({ id: node.id, estado: 'ignorado', motivo: reason });
      continue;
    }
    // Cambio 13 (C3): inversor SIN eta declarada — el solver lo modela en paso
    // directo (P_ac = P_dc, prohibido inventar). No es error ni ignorado: es
    // AVISO (el badge lo muestra como 'sin η', las ramas siguen con sus kW).
    if (def?.solverType === 'inverter') {
      // Punto 3: el panel guarda 0 al vaciar el number; 0 tampoco convierte.
      const p = node.data?.params || {};
      if (!(Number(p.efficiency) > 0)) {
        out.push({ id: node.id, estado: 'aviso',
          motivo: 'eta no declarada: pasa directo sin convertir (P_ac = P_dc)' });
      }
    }
    // Cambio 13.2 (C4): panel AC con bus DC declarado -> error atribuido.
    if (hayBusDc && node.type === DEVICE_TYPE.SOLAR_PANEL_AC) {
      out.push({ id: node.id, estado: 'error',
        motivo: 'panel AC en bus DC: excluido del modelo (ver cambio 13.2)' });
    }
  }
  return out;
}
