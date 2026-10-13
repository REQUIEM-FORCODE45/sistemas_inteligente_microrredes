import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  updateNodeParams,
  updateNodeLabel,
  removeNode,
  removeEdge,
} from '@/Dashboard/store/diagram/diagramSlice';
import { X, Save, Trash2, Pencil, Check } from 'lucide-react';
import { DEVICE_DEFINITIONS } from '../constants/deviceTypes';
import GridAPI from '@/api/grid-api';

// Cambio 12.4 — valor EFECTIVO del combustible (nunca copiado a mano).
// Fuente: eco del ultimo resultado o endpoint del sitio (YAML, fuente unica).
let fuelCache = null;
function fetchSiteFuel() {
  if (!fuelCache) {
    fuelCache = GridAPI.get('/front/topology/fuel')
      .then((r) => r.data?.fuel || null)
      .catch(() => null);
  }
  return fuelCache;
}

function DieselEffectiveLine({ params, migrated }) {
  const latestResult = useSelector((state) => state.optimization.latestResult);
  const [siteFuel, setSiteFuel] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchSiteFuel().then((f) => { if (alive) setSiteFuel(f); });
    return () => { alive = false; };
  }, []);
  const eco = latestResult?.fuel_price_applied;
  const edited = params?.fuelCost != null && params.fuelCost !== '';
  const val = edited ? Number(params.fuelCost)
    : (eco?.valor ?? siteFuel?.price_cop_per_l ?? null);
  const origen = edited ? 'nodo'
    : (eco?.origen ?? (siteFuel ? 'sitio' : null));
  const extra = !edited && siteFuel
    ? ` — sitio ${siteFuel.ciudad}, vigencia ${siteFuel.vigencia}` : '';
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[11px] font-semibold text-foreground">
        {val != null
          ? `efectivo: ${Number(val).toLocaleString('es-CO')} COP/L — ${origen}${extra}`
          : 'efectivo: pendiente (ejecuta la optimización)'}
      </p>
      {migrated && (
        <p className="text-[10px] text-amber-700 dark:text-amber-300">
          Migrado de legacy (0.001/0.5/0.5/100) a Willans + precio del sitio.
        </p>
      )}
    </div>
  );
}

// Punto 3 (auditoria 13): misma linea de "valor efectivo" que el combustible
// (12.4), para el eta del inversor. La fuente es la canonica de
// optimization/experiments/config.py ["eta_fuente"]; aqui va copiada como
// texto visible junto al campo (el panel no importa python). El campo sigue
// borrable: vacio/0 => sin declarar => no convierte (C3).
const ETA_FUENTE_TXT = 'referencia típica de inversor comercial (0.95–0.98); PENDIENTE del dato de placa del sitio';
function InverterEffectiveLine({ params }) {
  const eta = Number(params?.efficiency);
  const declarado = eta > 0;
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[11px] font-semibold text-foreground">
        {declarado
          ? `efectivo: η ${(eta * 100).toFixed(0)} % — ${ETA_FUENTE_TXT}`
          : 'efectivo: sin declarar — NO convierte (P_ac = P_dc)'}
      </p>
    </div>
  );
}

// Cambio 14 (C4): misma linea para el trafo + NOTA DE FRONTERA visible en el
// panel (no solo en codigo): el solver es despacho MILP de activa, no AC-OPF.
// Regla del 0: campo no > 0 = no declarado (el panel guarda 0 al vaciar).
function TrafoEffectiveLine({ params }) {
  const smax = Number(params?.capacityKva);
  const pf = Number(params?.powerFactor);
  const lp = Number(params?.lossesPct);
  const et = Number(params?.efficiency);
  const limite = (smax > 0 && pf > 0 && pf <= 1)
    ? `efectivo: tope ${(smax * pf).toFixed(1)} kW (S·pf, dato de placa)`
    : 'efectivo: SIN tope (pf/capacidad no declarados)';
  const perd = (lp > 0)
    ? `efectivo: pérdidas ${lp.toFixed(1)} % (dato de placa)`
    : (et > 0
      ? `efectivo: pérdidas η ${(et * 100).toFixed(0)} % (dato de placa)`
      : 'efectivo: SIN pérdidas (no declaradas)');
  return (
    <div className="space-y-1">
      <div className="space-y-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
        <p className="text-[11px] font-semibold text-foreground">{limite}</p>
        <p className="text-[11px] font-semibold text-foreground">{perd}</p>
      </div>
      <p className="text-[10px] text-muted-foreground/80 border border-border/60 rounded-md px-2 py-1.5">
        Alcance: modelo de despacho (pérdidas + capacidad). Tensión, impedancia
        y caída NO se simulan (AC-OPF: fase futura separada).
      </p>
    </div>
  );
}

// Cambio 10.5: claves opcionales (vacio = no declarado, NUNCA 0). Solo para
// las claves de OPTIONAL_PARAMS; el resto conserva el comportamiento actual.
const OPTIONAL_PARAMS = ['rampKwPerH', 'startCostCop', 'stopCostCop', 'fuelCost'];
const OPTIONAL_NUMERIC = ['rampKwPerH', 'startCostCop', 'stopCostCop', 'fuelCost', 'maxExportKw', 'touValley', 'touMedia', 'touPeak', 'capacityKva', 'powerFactor', 'lossesPct'];

function ParamField({ label, value, onChange, type = 'text', step = 'any', paramKey = null }) {
  const optional = paramKey != null && OPTIONAL_PARAMS.includes(paramKey);
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-muted-foreground">
        {label}{optional ? ' (opcional)' : ''}
      </label>
      <input
        type={type}
        value={value ?? ''}
        placeholder={optional ? 'sin declarar' : undefined}
        onChange={(e) => {
          if (optional && e.target.value === '') {
            onChange(null);
            return;
          }
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

  // OJO: dependemos del ID (estable), NO de `selectedNode` (referencia nueva en
  // cada dispatch de Redux). Asi las ediciones locales no se borran cuando
  // ocurre cualquier otra actualizacion (drag, sensorMappings, param saves).
  const selectedNodeId = selectedElement?.type === 'node' ? selectedElement.id : null;

  useEffect(() => {
    if (selectedNode && selectedNodeId) {
      setParams({ ...selectedNode.data.params });
      setLabel(selectedNode.data.label || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

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
    // Cambio 10: etiquetas nuevas SIEMPRE con unidad explicita.
    // Cambio 11: Willans (L/h...) + precio con procedencia del sitio.
    costA: 'Curvatura a2 (L/h·kW²) — Willans tesis',
    costB: 'Pendiente a1 (L/h·kW) — Willans tesis',
    costC: 'Consumo en vacío a0 (L/h) — Willans tesis',
    fuelCost: 'Precio combustible (COP/L) — sitio: Pasto CREG 2026-10',
    rampKwPerH: 'Rampa diésel (kW/h) — dato del fabricante',
    startCostCop: 'Arranque diésel (COP/evento) — dato del equipo',
    stopCostCop: 'Parada diésel (COP/evento) — dato del equipo',
    degradationCost: 'Degradación batería (COP/kWh) — tesis ~200',
    costFixed: 'Cargo fijo red (COP)',
    costVariable: 'Tarifa variable (COP/kWh)',
    tariffMode: "Tarifa fija: 'hora' o 'mes'",
    maxExportKw: 'Tope exportación (kW)',
    touValley: 'ToU valle 00–05 (COP/kWh)',
    touMedia: 'ToU media 06–18/22–23 (COP/kWh)',
    touPeak: 'ToU pico 19–21 (COP/kWh)',
    // Cambio 13: flags del inversor (opt-in, default false = AC actual).
    bidirectional: 'Bidireccional AC→DC (solo con bus DC)',
    busDc: 'Puerta de bus DC (paneles/batería en DC)',
    // Cambio 14: datos de placa del trafo (null = no declarado, nunca tipico).
    capacityKva: 'Capacidad (kVA) — dato de placa',
    powerFactor: 'Factor de potencia (0-1) — dato de placa',
    lossesPct: 'Pérdidas (%) — dato de placa',
    ratioLabel: 'Nivel (rótulo, p. ej. 13.2/0.22 kV)',
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
              {nodeDeviceDef?.type === 'load' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Fuente de carga
                  </label>
                  <select
                    value={params.loadSource === 'mat' ? 'mat' : 'static'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setParams((prev) => ({ ...prev, loadSource: val }));
                      if (selectedNode) {
                        dispatch(updateNodeParams({ nodeId: selectedNode.id, params: { loadSource: val } }));
                      }
                    }}
                    className="w-full px-2 py-1.5 text-[11px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40"
                  >
                    <option value="static">Estática (fija)</option>
                    <option value="mat">Perfil modular Consumo.mat</option>
                  </select>
                </div>
              )}
              {paramKeys.includes('tariffMode') && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    {paramLabels.tariffMode}
                  </label>
                  <select
                    value={params.tariffMode === 'mes' ? 'mes' : 'hora'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setParams((prev) => ({ ...prev, tariffMode: val }));
                    }}
                    className="w-full px-2 py-1.5 text-[11px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40"
                  >
                    <option value="hora">Hora (COP/h de conexión)</option>
                    <option value="mes">Mes (COP/mes prorrateado)</option>
                  </select>
                </div>
              )}
              {paramKeys
                .filter((key) => key !== 'loadSource' && key !== 'tariffMode')
                .map((key) => {
                  const dv = nodeDeviceDef.defaultParams[key];
                  // Cambio 13: los flags booleanos van con checkbox, no texto.
                  if (typeof dv === 'boolean') {
                    return (
                      <label key={key} className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={params[key] === true || params[key] === 'true'}
                          onChange={(e) => setParams((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="w-3.5 h-3.5 accent-primary"
                        />
                        {paramLabels[key] || key}
                      </label>
                    );
                  }
                  const numType = typeof dv === 'number'
                    || (dv == null && OPTIONAL_NUMERIC.includes(key));
                  return (
                    <ParamField
                      key={key}
                      paramKey={key}
                      label={paramLabels[key] || key}
                      value={params[key]}
                      type={numType ? 'number' : 'text'}
                      onChange={(val) => setParams((prev) => ({ ...prev, [key]: val }))}
                    />
                  );
                })}
            </div>
          )}

          {selectedNode?.data?.deviceType === 'diesel_generator' && (
            <DieselEffectiveLine
              params={params}
              migrated={!!selectedNode?.data?.migrated12}
            />
          )}
          {selectedNode?.data?.deviceType === 'inverter' && (
            <InverterEffectiveLine params={params} />
          )}
          {selectedNode?.data?.deviceType === 'transformer' && (
            <TrafoEffectiveLine params={params} />
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
