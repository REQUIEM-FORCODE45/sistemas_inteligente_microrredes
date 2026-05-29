import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  updateNodeParams,
  updateNodeLabel,
  removeNode,
  removeEdge,
} from '@/Dashboard/store/diagram/diagramSlice';
import { cn } from '@/lib/utils';
import { X, Save, Trash2, Pencil, Check } from 'lucide-react';
import { DEVICE_DEFINITIONS } from '../constants/deviceTypes';

function ParamField({ label, value, onChange, type = 'text', step = 'any' }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => {
          const val = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
          onChange(val);
        }}
        step={step}
        className="w-full px-2 py-1.5 text-[11px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 tabular-nums"
      />
    </div>
  );
}

export default function DeviceConfigPanel({ onClose }) {
  const dispatch = useDispatch();
  const selectedElement = useSelector((state) => state.diagram.selectedElement);
  const nodes = useSelector((state) => state.diagram.nodes);
  const edges = useSelector((state) => state.diagram.edges);

  const selectedNode = selectedElement?.type === 'node'
    ? nodes.find((n) => n.id === selectedElement.id)
    : null;

  const selectedEdge = selectedElement?.type === 'edge'
    ? edges.find((e) => e.id === selectedElement.id)
    : null;

  const [params, setParams] = useState({});
  const [label, setLabel] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const labelInputRef = useRef(null);

  useEffect(() => {
    if (selectedNode) {
      setParams({ ...selectedNode.data.params });
      setLabel(selectedNode.data.label || '');
    }
  }, [selectedNode]);

  const handleSave = useCallback(() => {
    if (!selectedNode) return;
    dispatch(updateNodeParams({ nodeId: selectedNode.id, params }));
    dispatch(updateNodeLabel({ nodeId: selectedNode.id, label }));
  }, [dispatch, selectedNode, params, label]);

  const handleDelete = useCallback(() => {
    if (!selectedElement) return;
    if (selectedElement.type === 'node') {
      dispatch(removeNode(selectedElement.id));
    } else if (selectedElement.type === 'edge') {
      dispatch(removeEdge(selectedElement.id));
    }
    onClose();
  }, [dispatch, selectedElement, onClose]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!selectedElement) return null;

  const nodeDeviceDef = selectedNode
    ? DEVICE_DEFINITIONS[selectedNode.data?.deviceType]
    : null;

  const paramKeys = nodeDeviceDef?.defaultParams
    ? Object.keys(nodeDeviceDef.defaultParams)
    : [];

  const paramLabels = {
    maxCapacity: 'Capacidad máxima (W)',
    capacity: 'Capacidad (Wh)',
    efficiency: 'Eficiencia (0-1)',
    maxLoad: 'Carga máxima (W)',
    voltage: 'Voltaje (V)',
    chargeLevel: 'Nivel de carga (%)',
    consumption: 'Consumo (W)',
    metric: 'Métrica',
    interval: 'Intervalo (ms)',
  };

  return (
    <div className="w-[280px] bg-card border-l border-border shadow-lg animate-in slide-in-from-right-2 duration-200 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {selectedNode ? 'Propiedades del Equipo' : 'Propiedades de Conexión'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {selectedNode
              ? nodeDeviceDef?.label || 'Equipo'
              : 'Conexión eléctrica'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {selectedNode && (
        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">
              Nombre
            </label>
            <div className="flex items-center gap-1.5">
              {editingLabel ? (
                <>
                  <input
                    ref={labelInputRef}
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingLabel(false);
                      if (e.key === 'Escape') setEditingLabel(false);
                    }}
                    className="flex-1 px-2 py-1.5 text-[11px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40"
                    autoFocus
                  />
                  <button
                    onClick={() => setEditingLabel(false)}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 px-2 py-1.5 text-[11px] font-medium text-foreground bg-muted/50 rounded-md">
                    {label}
                  </span>
                  <button
                    onClick={() => setEditingLabel(true)}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground">
              ID: {selectedNode.id.slice(-8)}
            </div>
            <div className="px-2 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-foreground/70">
              {nodeDeviceDef?.currentType || '—'}
            </div>
          </div>

          {paramKeys.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Parámetros
              </p>
              {paramKeys.map((key) => (
                <ParamField
                  key={key}
                  label={paramLabels[key] || key}
                  value={params[key]}
                  type={typeof nodeDeviceDef.defaultParams[key] === 'number' ? 'number' : 'text'}
                  onChange={(val) => setParams((prev) => ({ ...prev, [key]: val }))}
                />
              ))}
            </div>
          )}

          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar cambios
          </button>
        </div>
      )}

      {selectedEdge && (
        <div className="p-4 space-y-3">
          <div className="px-2 py-2 rounded-lg bg-muted/30">
            <p className="text-[10px] text-muted-foreground">
              Conexión unidireccional de flujo de energía
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] font-mono text-foreground/70">
                {selectedEdge.source?.slice(-6)}
              </span>
              <span className="text-[10px] text-muted-foreground">→</span>
              <span className="text-[11px] font-mono text-foreground/70">
                {selectedEdge.target?.slice(-6)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground">
              ID: {selectedEdge.id.slice(-16)}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <div className="border-t border-border pt-3">
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-destructive/20 text-destructive/80 text-[11px] font-medium hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar {selectedNode ? 'equipo' : 'conexión'}
          </button>
        </div>
      </div>
    </div>
  );
}
