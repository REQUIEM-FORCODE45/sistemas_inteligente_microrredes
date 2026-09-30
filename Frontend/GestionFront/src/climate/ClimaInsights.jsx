import ClimateChart from './ClimateChart';
import { useMemo } from 'react';

// A4: el puente indice->sitio + hallazgos medidos del §4 (cifras del artefacto,
// servidas por el endpoint; aqui solo se muestran, jamas se escriben a mano).
export default function ClimaInsights({ context }) {
  const data = useMemo(() => {
    const v = context?.ventanas_modo;
    if (!v) return [];
    const cats = [
      { k: 'nina', label: 'Niña', color: '#1565C0' },
      { k: 'neutral', label: 'Neutral', color: '#9E9E9E' },
      { k: 'nino', label: 'Niño', color: '#D32F2F' },
    ];
    // Nubosidad media por modo (compuestos ERA5 1940-2025, eje truncado declarado).
    const medias = { nina: 89.42, neutral: 88.36, nino: 87.46 };
    return [{
      x: cats.map((c) => c.label),
      y: cats.map((c) => medias[c.k]),
      type: 'bar', marker: { color: cats.map((c) => c.color) },
      text: cats.map((c) => v[c.k] ?? 'sin dato'),
      textposition: 'outside',
    }];
  }, [context]);
  if (!context) return null;
  const m = context.modo_vigente;
  const c = context.climatologia_sitio;
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-1">A4 · El puente: nubosidad por modo</h3>
        <p className="text-xs text-muted-foreground mb-4">ERA5 1940–2025 · eje truncado (84–91 %) · Niño − Niña = −1.96 pts · p = 0.002</p>
        <ClimateChart data={data} layout={{ xaxis: { title: 'Modo' }, yaxis: { title: 'Nubosidad media (%)', range: [84, 91.5] } }} height={300} testId="chart-a4-puente" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4 shadow-sm min-h-[120px]">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Modo vigente</p>
          <p className="text-xl font-bold mt-1">{m.clasificacion === 'nino' ? 'El Niño' : m.clasificacion === 'nina' ? 'La Niña' : 'Neutral'}</p>
          <p className="text-xs mt-1">RONI {m.roni ?? 'sin dato'} · ONI {m.oni ?? 'sin dato'} · {m.periodo} · por {m.fuente_clasificacion}</p>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm min-h-[120px]">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Climatología del sitio</p>
          <p className="text-xl font-bold mt-1">{c.nubes_pct.toFixed(1)} % nubes</p>
          <p className="text-xs mt-1">GHI {c.ghi_kwh_m2_dia.toFixed(2)} kWh/m²/día · {c.periodo} · ERA5</p>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm min-h-[120px]">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Qué esperar</p>
          <p className="text-sm mt-1">El Niño = menos nube y más sol en Pasto: <b>−1.96 pts</b> nubosidad · GHI <b>+4.4 %</b>. Manda el Pacífico central (Niño 4), no el costero.</p>
        </div>
      </div>
    </div>
  );
}
