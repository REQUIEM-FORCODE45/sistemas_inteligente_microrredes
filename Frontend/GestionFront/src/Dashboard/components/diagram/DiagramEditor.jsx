import { useRef, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useSelector, useDispatch } from 'react-redux';
import { clearSelection } from '@/Dashboard/store/diagram/diagramSlice';
import { nodeTypes, useDragHandlers } from './DiagramCanvas';
import { edgeTypes } from './edges/PowerEdge';
import { useDiagram } from './hooks/useDiagram';
import { useDiagramValidation } from './hooks/useDiagramValidation';
import DevicePalette from './DevicePalette';
import DiagramToolbar from './DiagramToolbar';
import SensorMappingPanel from './SensorMappingPanel';
import DeviceConfigPanel from './components/DeviceConfigPanel';
import DiagramOptimizationPanel from './DiagramOptimizationPanel';
import NodeDispatchModal from './NodeDispatchModal';
import { ExperimentPanel } from '../optimization/ExperimentPanel';

export default function DiagramEditor() {
  const dispatch = useDispatch();
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [showSensorPanel, setShowSensorPanel] = useState(true);
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('diagram');

  const isDirty = useSelector((state) => state.diagram.isDirty);
  const selectedElement = useSelector((state) => state.diagram.selectedElement);

  const { onDragStart } = useDragHandlers();
  const { edgeValidation } = useDiagramValidation();

  const {
    nodes,
    edges,
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
  } = useDiagram(reactFlowInstance);

  const onInit = useCallback((instance) => {
    setReactFlowInstance(instance);
  }, []);

  const onFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.3, duration: 300 });
  }, [reactFlowInstance]);

  const onZoomIn = useCallback(() => {
    reactFlowInstance?.zoomIn();
  }, [reactFlowInstance]);

  const onZoomOut = useCallback(() => {
    reactFlowInstance?.zoomOut();
  }, [reactFlowInstance]);

  const processedEdges = edges.map((edge) => {
    const validation = edgeValidation[edge.id];
    return {
      ...edge,
      data: {
        ...edge.data,
        isInvalid: validation && !validation.valid,
        errorMessage: validation?.reason,
      },
    };
  });

  const defaultEdgeOptions = {
    type: 'powerEdge',
    animated: false,
    style: { stroke: 'var(--border)', strokeWidth: 1.8 },
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="h-10 flex-shrink-0 flex items-center border-b bg-card px-2">
        <div className="flex gap-1">
          <button onClick={() => setActiveMainTab('diagram')} className={`px-3 py-1.5 text-xs font-medium rounded ${activeMainTab==='diagram' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Diagrama</button>
          <button onClick={() => setActiveMainTab('results')} className={`px-3 py-1.5 text-xs font-medium rounded ${activeMainTab==='results' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Resultados MPC</button>
        </div>
      </div>
      <div className="h-10 flex-shrink-0">
        <DiagramToolbar
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onFitView={onFitView}
          onClear={handleClear}
          onSave={handleSaveDiagram}
          onLoad={handleLoadDiagram}
          selectedElement={selectedElement}
          onDelete={handleDelete}
          isDirty={isDirty}
          showOptimizationPanel={showOptimizationPanel}
          onToggleOptimization={() => setShowOptimizationPanel((p) => !p)}
        />
      </div>

      {activeMainTab === 'results' ? (
        <div className="flex-1 overflow-auto p-6 bg-muted/20">
          <ExperimentPanel variant="full" />
        </div>
      ) : (
      <div className="flex-1 flex min-h-0">
        <div className="w-[220px] flex-shrink-0">
          <DevicePalette onDragStart={onDragStart} />
        </div>

        <div
          className="flex-1 relative bg-muted/20 dark:bg-muted/5"
          ref={reactFlowWrapper}
        >
          <ReactFlow
            nodes={nodes}
            edges={processedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onInit={onInit}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            deleteKeyCode={['Delete', 'Backspace']}
            multiSelectionKeyCode="Shift"
            selectionKeyCode="Shift"
            snapToGrid
            snapGrid={[15, 15]}
            minZoom={0.1}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            className="cursor-default"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="oklch(0.708 0 0 / 0.15)"
            />
            <MiniMap
              nodeStrokeWidth={2}
              pannable
              zoomable
              maskColor="oklch(0 0 0 / 0.15)"
              className="!rounded-lg !border !border-border !shadow-md !bg-card"
              style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
              }}
            />
            <Controls
              className="!rounded-lg !border !border-border !shadow-sm !bg-card !fill-foreground"
              position="bottom-left"
              showInteractive={false}
              style={{
                position: 'absolute',
                bottom: 16,
                left: 16,
              }}
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="oklch(0.556 0 0 / 0.3)"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" stroke="oklch(0.556 0 0 / 0.15)" />
                    <line x1="9" y1="3" x2="9" y2="9" stroke="oklch(0.556 0 0 / 0.15)" />
                    <line x1="15" y1="3" x2="15" y2="9" stroke="oklch(0.556 0 0 / 0.15)" />
                    <line x1="3" y1="15" x2="21" y2="15" stroke="oklch(0.556 0 0 / 0.15)" />
                    <line x1="9" y1="15" x2="9" y2="21" stroke="oklch(0.556 0 0 / 0.15)" />
                    <line x1="15" y1="15" x2="15" y2="21" stroke="oklch(0.556 0 0 / 0.15)" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-muted-foreground/60">
                  Arrastra equipos desde el panel izquierdo
                </p>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  Conecta los puertos circulares para definir el flujo eléctrico
                </p>
              </div>
            </div>
          )}
        </div>

        {showOptimizationPanel ? (
          <DiagramOptimizationPanel
            onClose={() => setShowOptimizationPanel(false)}
          />
        ) : showSensorPanel ? (
          <div className="w-[280px] flex-shrink-0">
            <SensorMappingPanel />
          </div>
        ) : null}

        {selectedElement && (
          <DeviceConfigPanel
            onClose={() => dispatch(clearSelection())}
          />
        )}

        <NodeDispatchModal />
      </div>
      )}
    </div>
  );
}
