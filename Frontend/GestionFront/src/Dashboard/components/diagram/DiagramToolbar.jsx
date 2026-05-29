import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Save,
  FolderOpen,
  Grid3X3,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
}) {
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
            <Maximize className="w-3.5 h-3.5 text-foreground/60" />
          </button>
        </div>

        {selectedElement && (
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

        <button
          onClick={onClear}
          className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-medium text-destructive/70 hover:bg-destructive/10 transition-colors"
          title="Limpiar lienzo"
        >
          <Trash2 className="w-3 h-3" />
          <span>Limpiar</span>
        </button>
      </div>
    </div>
  );
}
