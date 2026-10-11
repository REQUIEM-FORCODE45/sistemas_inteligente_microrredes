import { useSelector } from 'react-redux';

// Cambio 12.4 — estado de la tarjeta SOLO desde datos reales (dispatch_plan).
// Sin datos no hay píldora (nada inventado). Sin estado de React por frame:
// se calcula al recibir el resultado (regla 5 de fluidez).
const OFF = '#94a3b8';

export function useCardStatus(nodeId, deviceType) {
  const latestResult = useSelector((state) => state.optimization.latestResult);
  const plan = latestResult?.dispatch_plan;
  if (!plan || plan.length === 0 || !nodeId) return null;
  const entries = plan.filter((d) => d.device_id === nodeId);
  if (entries.length === 0) return null;
  const pw = (t) => {
    const e = entries.find((d) => d.device_type === t);
    return e ? Math.abs(e.power_kw) : 0;
  };
  switch (deviceType) {
    case 'diesel_generator': {
      const p = pw('diesel');
      return p > 0.5
        ? { text: '▲ generando', color: '#64748b' }
        : { text: '○ apagado', color: OFF };
    }
    case 'solar_panel':
    case 'solar_panel_ac':
    case 'wind_turbine': {
      const t = deviceType === 'wind_turbine' ? 'wind' : 'solar';
      const p = pw(t);
      return p > 0.05
        ? { text: '▲ generando', color: '#10b981' }
        : { text: '○', color: OFF };
    }
    case 'grid': {
      const io = pw('grid_import') + pw('grid_export');
      return io > 0.01 ? { text: '● conectada', color: '#f59e0b' } : null;
    }
    case 'battery': {
      if (pw('battery_discharge') > 0.01) return { text: '▼ descargando', color: '#3b82f6' };
      if (pw('battery_charge') > 0.01) return { text: '▲ cargando', color: '#3b82f6' };
      return null;
    }
    default:
      return null;
  }
}
