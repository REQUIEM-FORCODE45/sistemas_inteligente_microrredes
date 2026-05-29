import { useState, useCallback, useRef } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CATEGORY_META,
  DEVICE_DEFINITIONS,
} from './constants/deviceTypes';

function DeviceItem({ device, onDragStart }) {
  const definition = DEVICE_DEFINITIONS[device.type];
  const categoryMeta = CATEGORY_META[device.category];
  const Icon = definition.icon;
  const itemRef = useRef(null);

  const handleDragStart = useCallback(
    (e) => {
      const el = itemRef.current;
      if (el) {
        const clone = el.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        clone.style.left = '-9999px';
        clone.style.opacity = '0.6';
        clone.style.width = el.offsetWidth + 'px';
        document.body.appendChild(clone);
        e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, el.offsetHeight / 2);
        setTimeout(() => document.body.removeChild(clone), 0);
      }
      onDragStart(e, device);
    },
    [onDragStart, device],
  );

  return (
    <div
      ref={itemRef}
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing',
        'transition-all duration-150 select-none',
        'hover:shadow-sm hover:border-foreground/20',
        'border-border bg-card',
        'group',
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${categoryMeta.color}15` }}
      >
        <Icon
          className="w-4 h-4"
          style={{ color: categoryMeta.color }}
          strokeWidth={2}
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {definition.label}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {definition.currentType || '—'}
        </p>
      </div>
    </div>
  );
}

export default function DevicePalette({ onDragStart }) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCategory = useCallback((key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      <div className="px-3.5 py-3 border-b border-border">
        <p className="text-xs font-semibold text-foreground tracking-wide uppercase">
          Equipos
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Arrastra al lienzo
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const isCollapsed = collapsed[key];
          const CategoryIcon = meta.icon;

          return (
            <div key={key}>
              <button
                onClick={() => toggleCategory(key)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md',
                  'hover:bg-muted/60 transition-colors',
                  meta.textClass,
                )}
              >
                <CategoryIcon className="w-3.5 h-3.5" strokeWidth={2} />
                <span className="text-[11px] font-semibold flex-1 text-left">
                  {meta.label}
                </span>
                <ChevronDown
                  className={cn(
                    'w-3.5 h-3.5 transition-transform duration-200',
                    isCollapsed && '-rotate-90',
                  )}
                />
              </button>

              {!isCollapsed && (
                <div className="mt-1 space-y-1 pl-1">
                  {meta.types.map((type) => (
                    <DeviceItem
                      key={type}
                      device={{ type, category: key }}
                      onDragStart={onDragStart}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3.5 py-2.5 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Suelta los equipos en el lienzo y conéctalos arrastrando desde los puertos circulares.
        </p>
      </div>
    </div>
  );
}
