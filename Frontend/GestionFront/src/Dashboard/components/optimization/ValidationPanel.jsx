// Panel de validacion por escenarios (SLD, pestana Resultados MPC).
// Bloque A: V1/V2 de fase_1_mos (S-MPC vs D-MPC, provider mos declarado).
// Bloque B: pronostico por componente (iTransformer solo vs MOS vs crudo,
// del endpoint de comparacion existente). Sin corridas: solo lectura.
import { useEffect, useState } from 'react';
import GridAPI from '@/api/grid-api';
import { ForecastMaeChart } from '../prediction/ForecastMaeChart';
import { ForecastOverlayChart } from '../prediction/ForecastOverlayChart';
import { ForecastSkillChart } from '../prediction/ForecastSkillChart';
import { ForecastMetricsTable } from '../prediction/ForecastMetricsTable';

const fmt = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—'
  : Number(v).toLocaleString('es', { maximumFractionDigits: d }));

function V1Table({ v1 }) {
  if (!v1?.por_dia) return <p className="text-xs text-muted-foreground">Sin datos V1.</p>;
  const rows = v1.por_dia.smpc.map((s, i) => ({ s, d: v1.por_dia.dmpc[i] }));
  const t = v1.total_3d;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">V1 — isla 3 días estrés, banda C (S-MPC vs D-MPC)</p>
      <table className="w-full text-[11px]">
        <thead><tr className="text-muted-foreground text-left">
          <th className="py-1 pr-2">día</th><th className="pr-2">ENS S (kWh)</th>
          <th className="pr-2">ENS D (kWh)</th><th className="pr-2">costo S</th><th>costo D</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s.fecha} className="border-t">
              <td className="py-1 pr-2 font-mono">{r.s.fecha}</td>
              <td className="pr-2">{fmt(r.s.ens, 3)}</td>
              <td className="pr-2">{fmt(r.d.ens, 3)}</td>
              <td className="pr-2">{fmt(r.s.costo, 0)}</td>
              <td>{fmt(r.d.costo, 0)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="py-1 pr-2">total 3d</td>
            <td className="pr-2">{fmt(t?.smpc?.ens, 3)}</td>
            <td className="pr-2">{fmt(t?.dmpc?.ens, 3)}</td>
            <td className="pr-2">{fmt(t?.smpc?.costo_norm, 0)}</td>
            <td>{fmt(t?.dmpc?.costo_norm, 0)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[11px]">Δ ENS S−D: <strong>{fmt(t?.delta_s_menos_d?.ens, 3)} kWh ({fmt(t?.delta_s_menos_d?.ens_pct, 1)} %)</strong>
        {' '}· Δ costo: {fmt(t?.delta_s_menos_d?.costo_total_pct, 2)} % total / {fmt(t?.delta_s_menos_d?.costo_norm_pct, 2)} % norm</p>
    </div>
  );
}

function V2Table({ v2 }) {
  if (!v2?.tabla_norm) return <p className="text-xs text-muted-foreground">Sin datos V2.</p>;
  const modes = Object.keys(v2.tabla_norm);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">V2 — red 1 día, banda C (S-MPC vs D-MPC)</p>
      <table className="w-full text-[11px]">
        <thead><tr className="text-muted-foreground text-left">
          <th className="py-1 pr-2">modo</th><th className="pr-2">costo S−D (%)</th>
          <th className="pr-2">ENS S (kWh)</th><th className="pr-2">ENS D (kWh)</th><th>Δ ENS</th>
        </tr></thead>
        <tbody>
          {modes.map((m) => (
            <tr key={m} className="border-t">
              <td className="py-1 pr-2 font-mono">{m}</td>
              <td className="pr-2">{fmt(v2.tabla_norm[m]?.delta_pct_costo_norm, 2)}</td>
              <td className="pr-2">{fmt(v2.tabla_ens[m]?.smpc, 3)}</td>
              <td className="pr-2">{fmt(v2.tabla_ens[m]?.dmpc, 3)}</td>
              <td>{fmt(v2.tabla_ens[m]?.delta, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ValidationPanel() {
  const [tab, setTab] = useState('validacion');
  const [val, setVal] = useState(null);
  const [valError, setValError] = useState(null);
  const [fc, setFc] = useState(null);
  const [series, setSeries] = useState(null);
  const [horizon, setHorizon] = useState('12');
  const [variable, setVariable] = useState('shortwave_radiation');

  useEffect(() => {
    let alive = true;
    GridAPI.get('/front/optimization/validacion/summary', { timeout: 30000 })
      .then((r) => { if (alive && r.data?.success) setVal(r.data); })
      .catch((e) => { if (alive) setValError(e.message); });
    GridAPI.get('/front/prediction/forecast/comparison', { timeout: 60000 })
      .then((r) => { if (alive && r.data?.success) setFc(r.data); })
      .catch(() => {});
    GridAPI.get('/front/prediction/forecast/comparison/series', { timeout: 60000 })
      .then((r) => { if (alive && r.data?.success) setSeries(r.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const detalle = fc?.detalle || null;
  const hasSeries = !!series?.available;

  return (
    <div className="bg-card border rounded-xl shadow-sm space-y-3 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-base">Validación por escenarios (V1/V2, provider mos)</h3>
        <div className="flex gap-2 text-xs">
          <select value={horizon} onChange={(e) => setHorizon(e.target.value)} className="border rounded px-2 py-1">
            {['1', '6', '12', '24', '48', '72'].map((h) => <option key={h} value={h}>h={h}</option>)}
          </select>
          <select value={variable} onChange={(e) => setVariable(e.target.value)} className="border rounded px-2 py-1">
            {['shortwave_radiation', 'direct_normal_irradiance', 'diffuse_radiation', 'temperature_2m', 'relative_humidity_2m', 'cloud_cover', 'wind_speed_100m', 'wind_speed_10m', 'surface_pressure', 'precipitation'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        MOS = iTransformer + LightGBM (boosters v2 causales), viento en m/s.
        El iTransformer corre además como provider solo: sus números no son los del MOS
        (el MOS añade corrección física + banda conformal).
      </p>
      {valError && <p className="text-xs text-red-600">{valError}</p>}
      <div className="flex gap-1 text-xs border-b">
        {['validacion', 'curvas', 'barras', 'overlay'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 capitalize ${tab === t ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>{t}</button>
        ))}
      </div>
      <div className="min-h-[420px]">
        {tab === 'validacion' && (
          <div className="space-y-4">
            {val && !val.available && <p className="text-xs text-muted-foreground">Validación no disponible ({(val.missing || []).join(', ')}).</p>}
            {val?.available && (<><V1Table v1={val.v1} /><V2Table v2={val.v2} /></>)}
          </div>
        )}
        {tab === 'curvas' && <ForecastMaeChart detalle={detalle} horizon={Number(horizon)} height={420} />}
        {tab === 'barras' && <ForecastSkillChart detalle={detalle} horizon={Number(horizon)} height={420} />}
        {tab === 'overlay' && hasSeries && <ForecastOverlayChart series={series} variable={variable} height={420} />}
        {tab === 'overlay' && !hasSeries && <p className="text-xs text-muted-foreground">Sin serie de ejemplo.</p>}
      </div>
      <div className="text-[10px] text-muted-foreground">
        <p className="font-semibold">De dónde sale cada número</p>
        <p>V1/V2: <span className="font-mono">integracion_plataforma/validacion/fase_1_mos/*/resultado.json</span> (recortable desde sus CSV). Pronóstico: comparativa MOS vs iTransformer solo vs NWP crudo.</p>
      </div>
      {/* Métricas MAE por contendiente (misma tabla que la comparativa, con iTransformer separado) */}
      {tab === 'validacion' && <ForecastMetricsTable detalle={detalle} horizon={horizon} variable={variable} />}
    </div>
  );
}
