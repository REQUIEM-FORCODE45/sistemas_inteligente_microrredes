import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Plotly from 'plotly.js-dist-min';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
  Brain,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { useDevices } from '../../../../Hooks/useDevices';

const CLIENT_ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api$/, '') : null) ||
  CLIENT_ORIGIN;

const ESTADO_CONFIG = {
  normal: { color: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-500/10', label: 'Normal', icon: CheckCircle2 },
  advertencia: { color: 'bg-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-500/10', label: 'Advertencia', icon: AlertTriangle },
  critico: { color: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-500/10', label: 'Crítico', icon: AlertTriangle },
};

const PlotlyChart = ({ data, variable }) => {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 640, height: 320 });

  const label = variable ? `Valor real (${variable})` : 'Valor real';

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ width: Math.max(300, width), height: 320 });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartRef.current || !data?.length) return;

    const xData = data.map((p) => p.timestamp
      ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—'
    );
    const yData = data.map((p) => Number(p.valor_real) || 0);

    const traces = [
      {
        x: xData,
        y: yData,
        type: 'scatter',
        mode: 'lines+markers',
        name: label,
        line: { color: '#22c55e', width: 3 },
        marker: { color: '#22c55e', size: 5 },
      },
    ];

    const esperado = data[0]?.valor_esperado;
    if (typeof esperado === 'number') {
      traces.push({
        x: [xData[0], xData[xData.length - 1]],
        y: [esperado, esperado],
        type: 'scatter',
        mode: 'lines',
        name: 'Esperado',
        line: { color: '#f59e0b', width: 2, dash: 'dash' },
      });
    }

    const layout = {
      width: dimensions.width,
      height: dimensions.height,
      margin: { l: 48, r: 16, t: 12, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      xaxis: {
        tickfont: { color: '#94a3b8', size: 10 },
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        tickfont: { color: '#94a3b8', size: 10 },
        gridcolor: '#e5e7eb',
        zeroline: false,
      },
      showlegend: true,
      legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { size: 11 } },
    };

    Plotly.react(chartRef.current, traces, layout, { displayModeBar: false, responsive: false });
  }, [data, dimensions]);

  useEffect(() => {
    return () => {
      if (chartRef.current) Plotly.purge(chartRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <div ref={chartRef} style={{ width: '100%', height: dimensions.height }} />
    </div>
  );
};

const StatusIndicator = ({ estado }) => {
  const config = ESTADO_CONFIG[estado] || ESTADO_CONFIG.normal;
  const Icon = config.icon;
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3 bg-background">
      <span className={`w-4 h-4 rounded-full ${config.color} animate-pulse`} />
      <div className="flex items-center gap-2">
        <Icon size={18} className={config.text} />
        <span className="text-sm font-semibold">Estado del sistema:</span>
        <Badge className={`${config.bg} ${config.text} border-current`}>
          {config.label}
        </Badge>
      </div>
    </div>
  );
};

const AgentResultCard = ({ sensorId, result }) => {
  if (!result) return null;

  const { estado_sistema, resumen_analisis, consejo_accionable, datos_visualizacion } = result;
  const config = ESTADO_CONFIG[estado_sistema] || ESTADO_CONFIG.normal;

  return (
    <div className="flex flex-col gap-4">
      <StatusIndicator estado={estado_sistema} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={`border-l-4 ${estado_sistema === 'critico' ? 'border-l-red-500' : estado_sistema === 'advertencia' ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain size={18} className={config.text} />
              <CardTitle className="text-base">Resumen del agente IA</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {resumen_analisis || 'Esperando análisis del agente...'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-blue-500" />
              <CardTitle className="text-base">Consejo accionable</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-foreground leading-relaxed">
              {consejo_accionable || 'Esperando recomendación...'}
            </p>
          </CardContent>
        </Card>
      </div>

      {datos_visualizacion?.length > 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-purple-500" />
              <CardTitle className="text-base">
                Visualización de datos
                {result.variable_graficada && (
                  <span className="ml-2 font-mono text-sm bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded">
                    {result.variable_graficada}
                  </span>
                )}
              </CardTitle>
              <CardDescription>{datos_visualizacion.length} puntos · valor real vs esperado</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="min-h-[350px]">
            <PlotlyChart data={datos_visualizacion} variable={result.variable_graficada} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const StrategyResultCard = ({ analysis }) => {
  if (!analysis) return null;

  const estrategiasActivas = analysis.detalles?.filter((d) => d.anomalia_detectada) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-violet-500" />
          <CardTitle className="text-base">Análisis estadístico en tiempo real</CardTitle>
          <CardDescription>
            {estrategiasActivas.length} de {analysis.total_estrategias} estrategias detectaron anomalías
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {(analysis.detalles || []).map((detalle, i) => {
            const isAnomaly = detalle.anomalia_detectada;
            return (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 text-xs ${
                  isAnomaly ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950' : 'border-muted bg-muted/10'
                }`}
              >
                <p className="font-semibold mb-1">{detalle.estrategia}</p>
                <p className={`${isAnomaly ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                  {detalle.mensaje}
                </p>
                {detalle.violaciones && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {detalle.violaciones.map((v, j) => (
                      <Badge key={j} variant="outline" className="text-[10px] bg-red-100 border-red-300 text-red-700">
                        {v.variable}={v.valor} ({v.razon})
                      </Badge>
                    ))}
                  </div>
                )}
                {detalle.cambios && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {detalle.cambios.map((c, j) => (
                      <Badge key={j} variant="outline" className="text-[10px] bg-yellow-100 border-yellow-300 text-yellow-700">
                        {c.variable}: {c.cambio_relativo > 0 ? '+' : ''}{Math.round(c.cambio_relativo * 1000) / 10}%
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export const ServerDrivenDashboard = ({ user }) => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState({});
  const [analyses, setAnalyses] = useState({});
  const [selectedSensorId, setSelectedSensorId] = useState(null);
  const { devices } = useDevices();
  const socketRef = useRef(null);

  const handleSensorUpdate = useCallback((data) => {
    const sensorId = String(data._id);
    if (!sensorId) return;
    setAnalyses((prev) => {
      const existing = prev[sensorId] || {};
      return { ...prev, [sensorId]: { ...existing, ultimo_dato: data } };
    });
  }, []);

  const handleAgentAnalysis = useCallback((data) => {
    const sensorId = String(data.sensor_id);
    if (!sensorId) return;
    setAnalyses((prev) => ({ ...prev, [sensorId]: data }));
    if (!selectedSensorId) setSelectedSensorId(sensorId);
  }, [selectedSensorId]);

  const handleAgentResult = useCallback((data) => {
    const sensorId = String(data.sensor_id);
    if (!sensorId) return;
    setResults((prev) => {
      const existing = prev[sensorId] || {};
      const sensorResults = Array.isArray(existing) ? [...existing, data] : [data];
      const recent = sensorResults.slice(-10);
      return { ...prev, [sensorId]: { entries: recent, latest: data } };
    });
    setStatus('complete');
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sensor_token') : null;
    const socket = io(SOCKET_BASE_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('agent_analisis', handleAgentAnalysis);
    socket.on('agent_result', handleAgentResult);
    socket.on('sensor_update', handleSensorUpdate);

    socket.on('agent_analysis_started', () => {
      setStatus('requesting');
      setResults((prev) => {
        const { _error, ...rest } = prev;
        return rest;
      });
    });
    socket.on('agent_analysis_complete', () => setStatus('complete'));
    socket.on('agent_analysis_error', ({ message }) => {
      setStatus('error');
      setResults((prev) => ({ ...prev, _error: message || 'Error desconocido' }));
    });

    return () => {
      socket.off('agent_analisis', handleAgentAnalysis);
      socket.off('agent_result', handleAgentResult);
      socket.off('sensor_update', handleSensorUpdate);
      socket.disconnect();
    };
  }, [handleAgentAnalysis, handleAgentResult, handleSensorUpdate]);

  useEffect(() => {
    if (!socketRef.current?.connected) return;
    const sensorIds = (devices || [])
      .map((d) => (d._id || d.id)?.toString?.() || d._id || d.id)
      .filter(Boolean);
    if (!sensorIds.length) return;

    const joinAll = async () => {
      for (const id of sensorIds) {
        socketRef.current.emit('join_sensor_room', id);
      }
    };
    joinAll();

    return () => {
      for (const id of sensorIds) {
        socketRef.current.emit('leave_sensor_room', id);
      }
    };
  }, [devices, connected]);

  useEffect(() => {
    if (!connected || !devices?.length || status !== 'idle') return;
    setStatus('requesting');
    socketRef.current.emit('request_agent_analysis', {
      userId: user?.id,
      context: `Rol: ${user?.role || 'Usuario'} · Nombre: ${user?.fullName || 'Desconocido'}`,
    });
  }, [connected, devices, user]);

  const requestAnalysis = useCallback(() => {
    if (!socketRef.current?.connected) return;
    setStatus('requesting');
    setResults({});
    socketRef.current.emit('request_agent_analysis', {
      userId: user?.id,
      context: `Rol: ${user?.role || 'Usuario'} · Nombre: ${user?.fullName || 'Desconocido'}`,
    });
  }, [user]);

  const sensorIds = useMemo(
    () => Object.keys(results).length ? Object.keys(results) : Object.keys(analyses),
    [results, analyses]
  );
  const activeSensorId = selectedSensorId || sensorIds[0];
  const activeResult = results[activeSensorId]?.latest;
  const activeAnalysis = analyses[activeSensorId];
  const errorMessage = results._error;

  const noResults = !activeResult && status === 'complete';
  const showLoading = status === 'requesting' && !activeResult;
  const showResults = !!activeResult;

  return (
    <section className="flex flex-col gap-6 px-4 py-6 mx-auto w-full max-w-screen-2xl">
      <header className="flex flex-col gap-3 rounded-2xl border border-dashed border-muted/40 bg-background/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Agente IA · Microrred</h1>
            <p className="text-sm text-muted-foreground">Análisis inteligente en tiempo real impulsado por LangGraph + reglas estadísticas.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2" onClick={requestAnalysis} disabled={status === 'requesting'}>
              <RefreshCw className={`h-4 w-4 ${status === 'requesting' ? 'animate-spin' : ''}`} />
              {status === 'requesting' ? 'Analizando...' : 'Analizar ahora'}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Conexión: {connected ? 'en línea' : 'desconectado'}</span>
          <span>Estado: {status}</span>
          {sensorIds.length > 0 && <span>Sensores activos: {sensorIds.length}</span>}
        </div>

        {sensorIds.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sensorIds.map((id) => {
              const name = devices?.find((d) => String(d._id || d.id) === id)?.name || id.slice(-8);
              const result = results[id]?.latest;
              const config = ESTADO_CONFIG[result?.estado_sistema] || ESTADO_CONFIG.normal;
              const isActive = id === activeSensorId;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedSensorId(id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all ${
                    isActive ? 'border-primary bg-primary/10 font-semibold' : 'border-muted hover:border-primary/40'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${config.color}`} />
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {showLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Analizando sensores</CardTitle>
            <CardDescription>El agente IA está procesando los datos de tu microrred...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Ejecutando estrategias de análisis y consultando al modelo de lenguaje...
            </div>
          </CardContent>
        </Card>
      )}

      {errorMessage && (
        <Card className="border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-600" />
              <CardTitle className="text-base text-red-700 dark:text-red-400">Error del agente</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {noResults && (
        <Card>
          <CardHeader>
            <CardTitle>Sin resultados</CardTitle>
            <CardDescription>El agente completó la ejecución pero no se generaron análisis.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Verifica que los sensores estén transmitiendo datos y que el servicio de análisis esté activo.
            </p>
          </CardContent>
        </Card>
      )}

      {activeAnalysis && <StrategyResultCard analysis={activeAnalysis} />}

      {showResults && activeResult && (
        <AgentResultCard sensorId={activeSensorId} result={activeResult} />
      )}

      <section className="rounded-2xl border border-muted/40 bg-slate-900/80 p-4 text-sm text-white">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span>Resultado del agente IA (JSON)</span>
          <span>{activeSensorId ? `Sensor: ${activeSensorId.slice(-12)}` : 'Sin sensor seleccionado'}</span>
        </div>
        <pre className="mt-3 max-h-72 overflow-auto text-[13px] leading-relaxed text-slate-100">
          <code>
            {activeResult
              ? JSON.stringify({ sensor_id: activeSensorId, ...activeResult }, null, 2)
              : 'Esperando resultado del agente...'}
          </code>
        </pre>
      </section>
    </section>
  );
};
