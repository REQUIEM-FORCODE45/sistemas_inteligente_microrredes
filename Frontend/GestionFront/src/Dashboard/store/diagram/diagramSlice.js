import { createSlice } from '@reduxjs/toolkit';
import { propagateSensorDependencies } from '@/Dashboard/components/diagram/utils/diagramValidation';
import { migrateParams } from '@/Dashboard/components/diagram/constants/deviceTypes';

const initialState = {
  nodes: [],
  edges: [],
  selectedElement: null,
  sensorMappings: {},
  propagationDeps: {},
  viewport: { x: 0, y: 0, zoom: 1 },
  isDirty: false,
  dispatchModalNodeId: null,
  preflight: {},
  // Cambio 16: hora mostrada del dispatch (1..24). Vista, no dato: no marca
  // isDirty y nunca se escribe durante el arrastre (regla 1 de fluidez).
  horaMostrada: 12,
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

    // Cambio 15: edita data del edge (seccionador: switch_state/mode/M/cost).
    // Persiste igual que el resto (edges van en loadDiagram/save).
    updateEdgeData(state, action) {
      const { edgeId, data } = action.payload;
      const edge = state.edges.find((e) => e.id === edgeId);
      if (edge) {
        edge.data = { ...edge.data, ...data };
        state.isDirty = true;
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

    // Cambio 12.2: marcas de pre-flight por nodo (se escriben al lanzar,
    // nunca durante el arrastre). Clave SEPARADA de nodes para no pelear
    // con el estado local del arrastre (el lienzo solo sincroniza por .length).
    setNodePreflight(state, action) {
      const { id, preflight } = action.payload;
      if (!state.preflight) state.preflight = {};
      if (preflight) state.preflight[id] = preflight;
      else delete state.preflight[id];
    },

    loadDiagram(state, action) {
      const { nodes, edges, sensorMappings } = action.payload;
      // Cambio 12.4: migracion legacy EXACTA al abrir (nunca pisa valores
      // a proposito). migrateParams solo actua con la tupla legacy conocida.
      state.nodes = (nodes || []).map((n) => {
        const { params, migrated } = migrateParams(
          n.data?.deviceType || n.type, n.data?.params);
        if (!migrated) return n;
        return { ...n, data: { ...n.data, params, migrated12: true } };
      });
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
      state.preflight = {};
    },

    setViewport(state, action) {
      state.viewport = action.payload;
    },

    // Cambio 16: hora mostrada del dispatch. No marca isDirty (vista).
    setHoraMostrada(state, action) {
      const h = Number(action.payload);
      if (Number.isFinite(h)) state.horaMostrada = Math.min(24, Math.max(1, Math.round(h)));
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
  updateEdgeData,
  selectElement,
  clearSelection,
  mapSensor,
  unmapSensor,
  updateNodeParams,
  updateNodeLabel,
  clearDiagram,
  loadDiagram,
  setNodePreflight,
  setViewport,
  markSaved,
  setHoraMostrada,
  setDispatchModalNode,
  closeDispatchModal,
} = diagramSlice.actions;

export default diagramSlice.reducer;
