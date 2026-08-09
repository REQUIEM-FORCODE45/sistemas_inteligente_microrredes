import { createSlice } from '@reduxjs/toolkit';
import { propagateSensorDependencies } from '@/Dashboard/components/diagram/utils/diagramValidation';

const initialState = {
  nodes: [],
  edges: [],
  selectedElement: null,
  sensorMappings: {},
  propagationDeps: {},
  viewport: { x: 0, y: 0, zoom: 1 },
  isDirty: false,
  dispatchModalNodeId: null,
};

const diagramSlice = createSlice({
  name: 'diagram',
  initialState,
  reducers: {
    addNode(state, action) {
      state.nodes.push(action.payload);
      state.isDirty = true;
    },

    updateNode(state, action) {
      const { id, ...updates } = action.payload;
      const index = state.nodes.findIndex((n) => n.id === id);
      if (index !== -1) {
        state.nodes[index] = { ...state.nodes[index], ...updates };
        state.isDirty = true;
      }
    },

    updateNodePosition(state, action) {
      const { id, position } = action.payload;
      const node = state.nodes.find((n) => n.id === id);
      if (node) {
        node.position = position;
        state.isDirty = true;
      }
    },

    removeNode(state, action) {
      const nodeId = action.payload;
      state.nodes = state.nodes.filter((n) => n.id !== nodeId);
      state.edges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      delete state.sensorMappings[nodeId];
      state.isDirty = true;
      if (state.selectedElement?.id === nodeId) {
        state.selectedElement = null;
      }
    },

    addEdge(state, action) {
      state.edges.push(action.payload);
      state.propagationDeps = propagateSensorDependencies(
        state.nodes,
        state.edges,
        state.sensorMappings,
      );
      state.isDirty = true;
    },

    removeEdge(state, action) {
      const edgeId = action.payload;
      state.edges = state.edges.filter((e) => e.id !== edgeId);
      state.propagationDeps = propagateSensorDependencies(
        state.nodes,
        state.edges,
        state.sensorMappings,
      );
      state.isDirty = true;
      if (state.selectedElement?.id === edgeId) {
        state.selectedElement = null;
      }
    },

    selectElement(state, action) {
      state.selectedElement = action.payload;
    },

    clearSelection(state) {
      state.selectedElement = null;
    },

    mapSensor(state, action) {
      const { nodeId, sensorId } = action.payload;
      state.sensorMappings[nodeId] = sensorId;
      state.propagationDeps = propagateSensorDependencies(
        state.nodes,
        state.edges,
        state.sensorMappings,
      );
      state.isDirty = true;
    },

    unmapSensor(state, action) {
      const nodeId = action.payload;
      delete state.sensorMappings[nodeId];
      state.propagationDeps = propagateSensorDependencies(
        state.nodes,
        state.edges,
        state.sensorMappings,
      );
      state.isDirty = true;
    },

    updateNodeParams(state, action) {
      const { nodeId, params } = action.payload;
      const node = state.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.data = { ...node.data, params: { ...node.data.params, ...params } };
        state.isDirty = true;
      }
    },

    updateNodeLabel(state, action) {
      const { nodeId, label } = action.payload;
      const node = state.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.data = { ...node.data, label };
        state.isDirty = true;
      }
    },

    clearDiagram(state) {
      state.nodes = [];
      state.edges = [];
      state.sensorMappings = {};
      state.propagationDeps = {};
      state.selectedElement = null;
      state.isDirty = true;
    },

    loadDiagram(state, action) {
      const { nodes, edges, sensorMappings } = action.payload;
      state.nodes = nodes || [];
      state.edges = edges || [];
      // PODA ANTI-FANTASMA: al cargar un snapshot, solo se conservan los
      // mappings cuyo nodo EXISTE en el diagrama cargado. Asi un guardado
      // viejo (con nodos borrados despues) no puede reinyectar mappings
      // huerfanos (bug: "bloque que no esta por ningun lado").
      const validIds = new Set((nodes || []).map((n) => n.id));
      state.sensorMappings = Object.fromEntries(
        Object.entries(sensorMappings || {}).filter(([nodeId]) => validIds.has(nodeId)),
      );
      state.propagationDeps = propagateSensorDependencies(
        state.nodes,
        state.edges,
        state.sensorMappings,
      );
      state.selectedElement = null;
      state.isDirty = false;
    },

    setViewport(state, action) {
      state.viewport = action.payload;
    },

    markSaved(state) {
      state.isDirty = false;
    },

    setDispatchModalNode(state, action) {
      state.dispatchModalNodeId = action.payload;
    },

    closeDispatchModal(state) {
      state.dispatchModalNodeId = null;
    },
  },
});

export const {
  addNode,
  updateNode,
  updateNodePosition,
  removeNode,
  addEdge,
  removeEdge,
  selectElement,
  clearSelection,
  mapSensor,
  unmapSensor,
  updateNodeParams,
  updateNodeLabel,
  clearDiagram,
  loadDiagram,
  setViewport,
  markSaved,
  setDispatchModalNode,
  closeDispatchModal,
} = diagramSlice.actions;

export default diagramSlice.reducer;
