import { CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';

export const OptimizationStatus = ({ result, status }) => {
  if (!result && status === 'idle') {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">Estado de la Optimizacion</h3>
        <p className="text-muted-foreground text-sm">
          Esperando el primer ciclo MPC. Haz clic en "Ejecutar" para forzar una optimizacion.
        </p>
      </div>
    );
  }

  const isOptimal = status === 'complete' || result?.status === 'optimal';
  const isError = status === 'error' || result?.status === 'error';
  const isInfeasible = result?.status === 'infeasible';
  const isRunning = status === 'running';

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Estado de la Optimizacion</h3>

      <div className="flex items-center gap-3 mb-4">
        {isOptimal ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-green-600 font-medium text-sm">Optimo</span>
          </div>
        ) : isRunning ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="text-blue-600 font-medium text-sm">Ejecutando...</span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-600 font-medium text-sm">Error</span>
          </div>
        ) : isInfeasible ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span className="text-orange-600 font-medium text-sm">Infactible</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted border rounded-lg">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <span className="text-muted-foreground font-medium text-sm">En espera</span>
          </div>
        )}
      </div>

      {isOptimal && result?.objective_value != null && (
        <div className="grid gap-3">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Costo total esperado</span>
            <span className="font-mono font-bold text-lg text-primary">
              ${result.objective_value.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Horizonte</span>
            <span className="font-medium">{result.total_hours}h</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-muted-foreground">Escenarios</span>
            <span className="font-medium">
              {result.scenario_results ? Object.keys(result.scenario_results).length : 0}
            </span>
          </div>
        </div>
      )}

      {result?.error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600">
          {result.error}
        </div>
      )}
    </div>
  );
};
