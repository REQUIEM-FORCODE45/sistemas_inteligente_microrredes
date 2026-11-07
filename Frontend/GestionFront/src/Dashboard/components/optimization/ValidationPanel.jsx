// Panel de validacion por escenarios (SLD, pestana Resultados MPC).
// SOLO tablas del experimento: V1 (isla 3 dias estres) y V2 (red 1 dia),
// desde fase_1_mos (provider mos declarado). Sin curvas ni comparativas:
// eso vive en sus artefactos versionados, no en este panel.
import { useEffect, useState } from 'react';
import GridAPI from '@/api/grid-api';

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
  const [val, setVal] = useState(null);
  const [valError, setValError] = useState(null);

  useEffect(() => {
    let alive = true;
    GridAPI.get('/front/optimization/validacion/summary', { timeout: 30000 })
      .then((r) => { if (alive && r.data?.success) setVal(r.data); })
      .catch((e) => { if (alive) setValError(e.message); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="bg-card border rounded-xl shadow-sm space-y-3 p-6">
      <h3 className="font-semibold text-base">Validación por escenarios (V1/V2, provider mos)</h3>
      {valError && <p className="text-xs text-red-600">{valError}</p>}
      <div className="space-y-4">
        {val && !val.available && <p className="text-xs text-muted-foreground">Validación no disponible ({(val.missing || []).join(', ')}).</p>}
        {val?.available && (<><V1Table v1={val.v1} /><V2Table v2={val.v2} /></>)}
      </div>
      <div className="text-[10px] text-muted-foreground">
        <p className="font-semibold">De dónde sale cada número</p>
        <p>V1/V2: <span className="font-mono">integracion_plataforma/validacion/fase_1_mos/*/resultado.json</span> (recortable desde sus CSV).</p>
      </div>
    </div>
  );
}
