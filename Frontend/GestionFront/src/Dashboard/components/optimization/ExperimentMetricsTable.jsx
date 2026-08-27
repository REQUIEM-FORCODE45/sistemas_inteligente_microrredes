export const ExperimentMetricsTable = ({ metrics }) => {
  if (!metrics || metrics.length === 0) return <p className="text-sm text-muted-foreground">Sin métricas. Ejecuta el experimento.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            {Object.keys(metrics[0]).map(k => <th key={k} className="text-left py-1.5 px-2 font-medium">{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {metrics.map((row, i) => (
            <tr key={i} className="border-b hover:bg-muted/40">
              {Object.values(row).map((v, j) => <td key={j} className="py-1 px-2 font-mono">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
