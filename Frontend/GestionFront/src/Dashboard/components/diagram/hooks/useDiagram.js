import { useCallback, useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNodesState, useEdgesState } from '@xyflow/react';
import {
  addNode,
  updateNodePosition,
  removeNode,
  addEdge,
  removeEdge,
  selectElement,
  clearSelection,
  clearDiagram,
  loadDiagram,
  setViewport,
  setDispatchModalNode,
} from '@/Dashboard/store/diagram/diagramSlice';
import { fetchDevices } from '@/Dashboard/store/device/deviceSlice';
import { DEVICE_DEFINITIONS } from '../constants/deviceTypes';
import { validateConnection } from '../utils/diagramValidation';

const STORAGE_KEY = 'sigemm_diagram_v1';

function generateId() {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useDiagram(reactFlowInstance) {
  const dispatch = useDispatch();

  const reduxNodes = useSelector((state) => state.diagram.nodes);
  const reduxEdges = useSelector((state) => state.diagram.edges);
  const selectedElement = useSelector((state) => state.diagram.selectedElement);
  const sensorMappings = useSelector((state) => state.diagram.sensorMappings);
  const propagationDeps = useSelector((state) => state.diagram.propagationDeps);

  const [nodes, setNodes, onNodesChange] = useNodesState(reduxNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(reduxEdges);

  useEffect(() => {
    dispatch(fetchDevices());
  }, [dispatch]);

  useEffect(() => {
    setNodes(reduxNodes);
  }, [reduxNodes.length]);

  useEffect(() => {
    setEdges(reduxEdges);
  }, [reduxEdges.length]);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/reactflow-device');
      if (!raw) return;

      const deviceData = JSON.parse(raw);
      const definition = DEVICE_DEFINITIONS[deviceData.deviceType];
      if (!definition) return;

      const position = reactFlowInstance
        ? reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        : { x: event.clientX, y: event.clientY };

      const newNode = {
        id: generateId(),
        type: deviceData.deviceType,
        position: {
          x: position.x - (definition.dimension?.width || 180) / 2,
          y: position.y - (definition.dimension?.height || 100) / 2,
        },
        data: {
          label: definition.label,
          deviceType: deviceData.deviceType,
          currentType: definition.currentType,
          bitrate: definition.bitrate,
          params: { ...definition.defaultParams },
          hasSensor: false,
          mappedSensorId: null,
        },
      };

      dispatch(addNode(newNode));
      dispatch(selectElement({ type: 'node', id: newNode.id }));
    },
    [dispatch, reactFlowInstance],
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleNodeDragStop = useCallback(
    (event, node) => {
      dispatch(updateNodePosition({ id: node.id, position: node.position }));
    },
    [dispatch],
  );

  const handleConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;

      const allNodes = nodes;
      const allEdges = edges;

      const sourceNode = allNodes.find((n) => n.id === connection.source);
      const targetNode = allNodes.find((n) => n.id === connection.target);

      const validation = validateConnection(sourceNode, targetNode, allNodes, allEdges);

      if (!validation.valid) {
        return;
      }

      const edgeId = `edge_${connection.source}_${connection.target}`;
      const sourceDef = DEVICE_DEFINITIONS[sourceNode.data?.deviceType];

      dispatch(
        addEdge({
          id: edgeId,
          source: connection.source,
          target: connection.target,
          type: 'powerEdge',
          data: {
            currentType: sourceDef?.currentType || null,
            isInvalid: false,
          },
        }),
      );
    },
    [dispatch, nodes, edges],
  );

  const clickTimer = useRef(null);

  const handleNodeClick = useCallback(
    (event, node) => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
        dispatch(setDispatchModalNode(node.id));
        return;
      }
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        dispatch(selectElement({ type: 'node', id: node.id }));
      }, 280);
    },
    [dispatch],
  );

  const handleEdgeClick = useCallback(
    (event, edge) => {
      dispatch(selectElement({ type: 'edge', id: edge.id }));
    },
    [dispatch],
  );

  const handlePaneClick = useCallback(() => {
    dispatch(clearSelection());
  }, [dispatch]);

  const handleDelete = useCallback(() => {
    if (!selectedElement) return;
    if (selectedElement.type === 'node') {
      dispatch(removeNode(selectedElement.id));
    } else if (selectedElement.type === 'edge') {
      dispatch(removeEdge(selectedElement.id));
    }
  }, [dispatch, selectedElement]);

  const handleClear = useCallback(() => {
    dispatch(clearDiagram());
  }, [dispatch]);

  const handleSaveDiagram = useCallback(() => {
    const data = {
      nodes: nodes,
      edges: edges,
      sensorMappings,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    dispatch({ type: 'diagram/markSaved' });
  }, [dispatch, nodes, edges, sensorMappings]);

  const handleLoadDiagram = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      dispatch(loadDiagram(data));
    } catch {
      // ignore parse errors
    }
  }, [dispatch]);

  return {
    nodes,
    edges,
    selectedElement,
    sensorMappings,
    propagationDeps,
    onNodesChange,
    onEdgesChange,
    handleDrop,
    handleDragOver,
    handleNodeDragStop,
    handleConnect,
    handleNodeClick,
    handleEdgeClick,
    handlePaneClick,
    handleDelete,
    handleClear,
    handleSaveDiagram,
    handleLoadDiagram,
  };
}
