import { useState, useMemo, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

export const ExperimentProfileChart = ({ traces }) => {
  const [strat, setStrat] = useState('smpc');
  const ref = useRef(null);
  const data = useMemo(() => traces?.[strat] || [], [traces, strat]);
  const hourly = useMemo(() => {
    if (!data.length) return [];
    const byHour = {};
    data.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      if (!byHour[h]) byHour[h] = { diesel: [], grid: [], pv: [], load: [] };
      byHour[h].diesel.push(r.diesel_kw);
      byHour[h].grid.push(r.grid_kw);
      byHour[h].pv.push(r.pv_real_kw);
      byHour[h].load.push(r.load_real_kw);
    });
    return Object.keys(byHour).sort((a,b)=>a-b).map(h => ({
      h: parseInt(h,10),
      diesel: byHour[h].diesel.reduce((a,b)=>a+b,0)/byHour[h].diesel.length,
      grid: byHour[h].grid.reduce((a,b)=>a+b,0)/byHour[h].grid.length,
      pv: byHour[h].pv.reduce((a,b)=>a+b,0)/byHour[h].pv.length,
      load: byHour[h].load.reduce((a,b)=>a+b,0)/byHour[h].load.length,
    }));
  }, [data]);

  useEffect(() => {
    if (!ref.current || hourly.length === 0) return;
    Plotly.purge(ref.current);
    Plotly.newPlot(ref.current, [
      { x: hourly.map(d=>d.h), y: hourly.map(d=>d.diesel), type: 'bar', name: 'Diésel', marker: { color: '#dc2626', opacity: 0.6 } },
      { x: hourly.map(d=>d.h), y: hourly.map(d=>d.grid.map?d.grid:0), type: 'bar', name: 'Red', marker: { color: '#2563eb', opacity: 0.5 } },
      { x: hourly.map(d=>d.h), y: hourly.map(d=>d.pv), type: 'scatter', mode: 'lines', name: 'PV', line: { color: 'orange' } },
      { x: hourly.map(d=>d.h), y: hourly.map(d=>d.load), type: 'scatter', mode: 'lines', name: 'Carga', line: { color: 'black', dash: 'dash' } },
    ], {
      barmode: 'stack',
      xaxis: { title: 'Hora', dtick: 1 },
      yaxis: { title: 'kW' },
      margin: { l: 50, r: 20, t: 20, b: 40 },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      height: 320,
    }, { responsive: true, displaylogo: false });
  }, [hourly]);

  if (!traces) return <p className="text-sm text-muted-foreground">Sin trazas.</p>;
  return (
    <div className="space-y-2">
      <select value={strat} onChange={e=>setStrat(e.target.value)} className="text-xs border rounded px-2 py-1 bg-card">
        <option value="smpc">S-MPC</option>
        <option value="dmpc">D-MPC</option>
        <option value="heur">HEUR</option>
        <option value="oracle">Oráculo</option>
      </select>
      <div ref={ref} className="w-full" />
    </div>
  );
};
