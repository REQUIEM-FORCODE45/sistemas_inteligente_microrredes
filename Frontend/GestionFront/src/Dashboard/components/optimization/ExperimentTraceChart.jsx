import { useState, useMemo, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

export const ExperimentTraceChart = ({ traces }) => {
  const [strat, setStrat] = useState('smpc');
  const [dayIdx, setDayIdx] = useState(0);
  const ref = useRef(null);
  const data = useMemo(() => traces?.[strat] || [], [traces, strat]);
  const days = useMemo(() => {
    if (!data.length) return [];
    const map = {};
    data.forEach(r => {
      const d = r.timestamp.slice(0,10);
      if (!map[d]) map[d]=[];
      map[d].push(r);
    });
    return Object.keys(map).sort();
  }, [data]);
  const dayData = useMemo(() => {
    if (!days.length) return [];
    const d = days[dayIdx] || days[0];
    return data.filter(r => r.timestamp.slice(0,10)===d);
  }, [data, days, dayIdx]);

  useEffect(() => {
    if (!ref.current || dayData.length===0) return;
    const x = dayData.map(r => r.timestamp.slice(11,16));
    Plotly.purge(ref.current);
    Plotly.newPlot(ref.current, [
      { x, y: dayData.map(r=>r.soc_kwh), type: 'scatter', mode: 'lines', name: 'SOC kWh', yaxis: 'y', line: { color: '#16a34a' } },
      { x, y: dayData.map(r=>r.diesel_kw), type: 'bar', name: 'Diésel kW', yaxis: 'y2', marker: { color: '#dc2626', opacity: 0.6 } },
      { x, y: dayData.map(r=>r.grid_kw), type: 'bar', name: 'Red kW', yaxis: 'y2', marker: { color: '#2563eb', opacity: 0.5 } },
      { x, y: dayData.map(r=>r.pv_real_kw), type: 'scatter', mode: 'lines', name: 'PV', yaxis: 'y2', line: { color: 'orange' } },
    ], {
      xaxis: { title: 'Hora' },
      yaxis: { title: 'SOC (kWh)', side: 'left' },
      yaxis2: { title: 'Potencia (kW)', side: 'right', overlaying: 'y' },
      margin: { l: 50, r: 50, t: 20, b: 40 },
      barmode: 'group',
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { color: '#64748b', size: 11 },
      height: 320,
    }, { responsive: true, displaylogo: false });
  }, [dayData]);

  if (!traces) return <p className="text-sm text-muted-foreground">Sin trazas.</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={strat} onChange={e=>setStrat(e.target.value)} className="text-xs border rounded px-2 py-1 bg-card">
          <option value="smpc">S-MPC</option>
          <option value="dmpc">D-MPC</option>
          <option value="heur">HEUR</option>
          <option value="oracle">Oráculo</option>
        </select>
        <select value={dayIdx} onChange={e=>setDayIdx(parseInt(e.target.value,10))} className="text-xs border rounded px-2 py-1 bg-card">
          {days.map((d,i)=><option key={d} value={i}>{d}</option>)}
        </select>
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
};
