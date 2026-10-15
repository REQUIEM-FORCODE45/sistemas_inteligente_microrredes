import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Save,
  FolderOpen,
  Grid3X3,
  Zap,
  Waves,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { cn } from '@/lib/utils';
import { setHoraMostrada } from '@/Dashboard/store/diagram/diagramSlice';
import { flowWidthFor } from './constants/deviceTypes';

// Cambio 16: leyenda de la escala de grosor (copiada de la referencia:
// la escala es declarada y visible, riesgo 4 de la spec).
function FlowLegend() {
  return (
    <div className="hidden md:flex items-center gap-2 px-2 text-[10px] text-muted-foreground" title="Grosor de rama proporcional a |kW|">
      {[2, 4, 10].map((kw) => (
        <span key={kw} className="flex items-center gap-1">
          <span className="inline-block w-5 rounded-full bg-foreground/60" style={{ height: flowWidthFor(kw) }} />
          {kw} kW
        </span>
      ))}
    </div>
  );
}

export default function DiagramToolbar({
  onZoomIn,
  onZoomOut,
  onFitView,
  onClear,
  onSave,
  onLoad,
  selectedElement,
  onDelete,
  isDirty,
  showOptimizationPanel,
  onToggleOptimization,
  readOnly,
}) {
  const dispatch = useDispatch();
  const latestResult = useSelector((state) => state.optimization.latestResult);
  const hora = useSelector((state) => state.diagram.horaMostrada ?? 12);
  const plan = latestResult?.dispatch_plan || [];
  const horas = [...new Set(plan.map((d) => d.hour))].sort((a, b) => a - b);
  // Cambio 16 (riesgo 2): animación desactivable; persiste en localStorage.
  const [anim, setAnim] = useState(() => {
    try {
      return localStorage.getItem('unifilar.anim') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleAnim = () => {
    const next = !anim;
    setAnim(next);
    try {
      localStorage.setItem('unifilar.anim', next ? 'on' : 'off');
    } catch { /* sin almacenamiento: sigue en memoria */ }
    // Imperativo como .rf-dragging (12.4): una clase, cero renders extra.
    document.querySelector('.react-flow')?.classList.toggle('no-anim', !next);
  };
  // Aplica el persistido al montar (si el usuario la dejo pausada).
  useEffect(() => {
    if (!anim) document.querySelector('.react-flow')?.classList.add('no-anim');
  }, [anim]);
  return (
    <div className="h-full flex items-center justify-between px-4 bg-card border-b border-border">
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-foreground mr-2 tracking-wide">
          Diagrama Unifilar
        </span>
        {isDirty && (
          <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
            Sin guardar
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center border border-border rounded-lg p-0.5 mr-2">
          <button
            onClick={onZoomOut}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
            title="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5 text-foreground/60" />
          </button>
          <button
            onClick={onZoomIn}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5 text-foreground/60" />
          </button>
          <button
            onClick={onFitView}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
            title="Ajustar vista"
          >
            <Maximize className="w-3 h-3 text-foreground/60" />
          </button>
        </div>

        {/* Cambio 16: hora mostrada del dispatch (solo con resultado) +
            leyenda de escala + toggle de animación. */}
        {horas.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground mr-1" title="Hora mostrada del despacho">
            H
            <select
              value={horas.includes(hora) ? hora : horas[0]}
              onChange={(e) => dispatch(setHoraMostrada(e.target.value))}
              className="h-7 px-1 rounded-md border border-input bg-background text-foreground text-[11px] tabular-nums focus:outline-none"
            >
              {horas.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
        )}
        <FlowLegend />
        <button
          onClick={toggleAnim}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
            anim ? 'text-foreground/70 hover:bg-muted' : 'text-muted-foreground/40 hover:bg-muted',
          )}
          title={anim ? 'Pausar animación de flujo' : 'Reanudar animación de flujo'}
        >
          <Waves className="w-3.5 h-3.5" />
        </button>

        {selectedElement && !readOnly && (
          <button
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors"
            title="Eliminar seleccionado"
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
          </button>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        {onToggleOptimization && (
          <button
            onClick={onToggleOptimization}
            className={cn(
              'h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors',
              showOptimizationPanel
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
            title="Panel de optimizacion"
          >
            <Zap className="w-3 h-3" />
            <span>Optimizar</span>
          </button>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={onSave}
          className={cn(
            'h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors',
            'hover:bg-muted',
            isDirty ? 'text-amber-600' : 'text-muted-foreground',
          )}
          title="Guardar diagrama"
        >
          <Save className="w-3 h-3" />
          <span>Guardar</span>
        </button>

        <button
          onClick={onLoad}
          className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
          title="Cargar diagrama"
        >
          <FolderOpen className="w-3 h-3" />
          <span>Abrir</span>
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {!readOnly && (
          <button
            onClick={onClear}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-medium text-destructive/70 hover:bg-destructive/10 transition-colors"
            title="Limpiar lienzo"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
