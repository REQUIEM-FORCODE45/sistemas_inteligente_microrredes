import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { DEVICE_DEFINITIONS, BITRATE } from '../constants/deviceTypes';
import { validateConnection } from '../utils/diagramValidation';

export function useDiagramValidation() {
  const nodes = useSelector((state) => state.diagram.nodes);
  const edges = useSelector((state) => state.diagram.edges);

  const edgeValidation = useMemo(() => {
    const result = {};

    edges.forEach((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (!sourceNode || !targetNode) {
        result[edge.id] = { valid: false, reason: 'Nodo no encontrado.' };
        return;
      }

      result[edge.id] = validateConnection(
        sourceNode,
        targetNode,
        nodes,
        edges,
        edge.id,
      );
    });

    return result;
  }, [nodes, edges]);

  const invalidEdges = useMemo(
    () => Object.entries(edgeValidation).filter(([, v]) => !v.valid),
    [edgeValidation],
  );

  const nodePortInfo = useMemo(() => {
    const info = {};
    nodes.forEach((node) => {
      const def = DEVICE_DEFINITIONS[node.data?.deviceType];
      if (!def) return;

      const hasIncoming = edges.some((e) => e.target === node.id);
      const hasOutgoing = edges.some((e) => e.source === node.id);

      info[node.id] = {
        bitrate: def.bitrate,
        currentType: def.currentType,
        hasIncoming,
        hasOutgoing,
        canReceive: node.data?.bitrate !== BITRATE.SOURCE && !hasIncoming,
        canSend: node.data?.bitrate !== BITRATE.SINK && !hasOutgoing,
        label: def.label,
      };
    });
    return info;
  }, [nodes, edges]);

  return { edgeValidation, invalidEdges, nodePortInfo };
}
