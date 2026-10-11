import { useSelector } from 'react-redux';

// Cambio 12.2/12.3 — marca de estado por nodo (pre-flight o eco del solver).
// Presentacional puro: lee Redux, no escribe. No toca el patron de arrastre.
export default function DeviceStatusBadge({ nodeId, preflight }) {
  const latestResult = useSelector((state) => state.optimization.latestResult);
  const echo = (latestResult?.device_echo || []).find((e) => e.device_id === nodeId);
  const item = echo && echo.estado !== 'modelado'
    ? echo
    : (preflight && preflight.estado !== 'modelado' ? preflight : null);
  if (!item) return null;
  const bad = item.estado === 'error';
  return (
    <div
      title={item.motivo || item.estado}
      className={`absolute -top-2 -right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border shadow-sm cursor-help ${
        bad ? 'bg-red-500/15 text-red-600 border-red-500/30'
            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
      }`}
    >
      <span>{bad ? '✕' : '⚠'}</span>
      <span>{item.estado === 'error' ? 'error' : 'no simulable'}</span>
    </div>
  );
}
