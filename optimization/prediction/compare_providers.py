# -*- coding: utf-8 -*-
"""Comparativa MOS vs PatchTST vs NWP crudo vs baselines (PASO 2, SPEC_PASO2.md).

Protocolo idéntico al del repo (walk-forward sobre ERA5, daytime_only para
radiación, descarte pareado por paso). NO compara ventanas distintas.

Contendiente "ecmwf_crudo": el NWP sin corregir = la propia entrada del MOS
(proxy desde archive ERA5; Open-Meteo no historiza el ECMWF operativo). Solo
cubre 6 variables (ghi/temp/rh/nubes/viento10/pres); DNI/DHI/precipitación no
tienen crudo separable y se excluyen de sus filas. Misma familia ERA5/ECMWF →
reportar MOS como "NWP corregido con ML", nunca "ML puro".

Uso:
  python3 -m optimization.prediction.compare_providers --months 20 --horizons 1,6,12,24,48,72
Salidas en results/pasto_narino/forecast/.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient
from optimization.prediction.evaluate import walk_forward_mae
from optimization.prediction.forecaster import get_climate_provider

logger = logging.getLogger("optimization.prediction.compare")

# Proxy archive -> variable de contrato (solo mapeos 1:1 honestos).
CRUD0_MAP = {"shortwave_radiation": "shortwave_radiation",
             "temperature_2m": "temperature_2m",
             "relative_humidity_2m": "relative_humidity_2m",
             "cloud_cover": "cloud_cover",
             "wind_speed_10m": "wind_speed_10m",
             "surface_pressure": "surface_pressure"}


def ecmwf_crudo(anchor: pd.Timestamp, horizon_h: int) -> pd.DataFrame:
    """NWP crudo = IFS operativo historizado (archive models=ecmwf_ifs025),
    sin corregir con ML. La verdad sigue siendo ERA5 sin models (misma
    familia: reportar como NWP, con el caveat same-family)."""
    tz = str(anchor.tz) if anchor.tz is not None else "America/Bogota"
    client = OpenMeteoClient(timezone=tz, variables=list(CRUD0_MAP),
                             models="ecmwf_ifs025")
    end = anchor + pd.Timedelta(hours=horizon_h - 1)
    df = client.fetch_archive(anchor.strftime("%Y-%m-%d"),
                              end.strftime("%Y-%m-%d"))
    df = df.loc[(df.index >= anchor.floor("h")) & (df.index <= end)]
    if df.empty:
        raise RuntimeError("ecmwf_crudo sin datos de archive")
    out = pd.DataFrame({c: df[c].values for c in CRUD0_MAP},
                       index=df.index[:horizon_h])
    out.provider_name = "ecmwf_crudo"
    return out


def _crudo_provider():
    class _Crudo:
        provider_name = "ecmwf_crudo"

        def __call__(self, anchor, horizon_h):
            return ecmwf_crudo(anchor, horizon_h)
    return _Crudo()


def main() -> int:
    ap = argparse.ArgumentParser(description="Comparativa de providers (PASO 2)")
    ap.add_argument("--site", default="pasto_narino")
    ap.add_argument("--months", type=int, default=20,
                    help="ventana de verdad hacia atrás (20 cubre todo 2025)")
    ap.add_argument("--end-offset-days", type=int, default=14)
    ap.add_argument("--train-h", type=int, default=30 * 24)
    ap.add_argument("--step-h", type=int, default=24,
                    help="paso en horas (6 cubre los 6 horizontes en radiación)")
    ap.add_argument("--no-resume", action="store_true",
                    help="recalcular todos los meses aunque existan parciales")
    ap.add_argument("--step-delay", type=float, default=3.0,
                    help="pausa entre pasos (s) para no saturar Open-Meteo")
    ap.add_argument("--horizons", default="1,6,12,24,48,72")
    ap.add_argument("--providers", default="mos,patchtst",
                    help="providers con anchor (coma). ecmwf_crudo siempre incluido")
    ap.add_argument("--baselines", default="persistence,climatology",
                    help="coma; arima opt-in (caro)")
    ap.add_argument("--arima-every", type=int, default=7)
    ap.add_argument("--no-daytime-only", action="store_true")
    ap.add_argument("--outdir", default="results/pasto_narino/forecast")
    args = ap.parse_args()

    if not os.path.isabs(args.outdir):
        args.outdir = str(Path(__file__).resolve().parents[2] / args.outdir)
    os.makedirs(args.outdir, exist_ok=True)

    cfg = load_site(args.site)
    s = cfg["site"]
    end = (pd.Timestamp.now(tz=s["timezone"]).floor("D")
           - pd.Timedelta(days=args.end_offset_days))
    start = end - pd.Timedelta(days=int(args.months * 30.42))
    horizons = [int(h) for h in args.horizons.split(",")]
    logger.info("Verdad ERA5 %s .. %s | horizons=%s",
                start.date(), end.date(), horizons)
    client = OpenMeteoClient(latitude=s["latitude"], longitude=s["longitude"],
                             timezone=s["timezone"])
    # La verdad es UN solo fetch grande: espera paciente ante 429 (cuota).
    import time as _time
    climate, _err = None, None
    for _wait in [60, 120, 300, 600, 600, 900]:
        try:
            climate = client.fetch_archive(start.date().isoformat(),
                                           end.date().isoformat())
            break
        except Exception as exc:  # noqa: BLE001
            _err = exc
            logger.warning("Verdad 429/bloqueo; reintento en %ds", _wait)
            _time.sleep(_wait)
    if climate is None:
        raise SystemExit(f"Verdad inaccesible (cuota Open-Meteo): {_err}")

    providers = [get_climate_provider(s, name=n.strip())
                 for n in args.providers.split(",") if n.strip()]
    providers.append(_crudo_provider())
    baselines = tuple(b.strip() for b in args.baselines.split(",") if b.strip())

    # Corrida por mes calendario (reanudable): cada mes escribe su parcial;
    # un crash pierde como máximo 1 mes. --no-resume para forzar todo.
    month_starts = pd.date_range(start.floor("D"), end.floor("D"), freq="MS")
    parts = []
    for ms in month_starts:
        me = (ms + pd.offsets.MonthEnd(0)).floor("D") + pd.Timedelta(hours=23)
        tag = ms.strftime("%Y-%m")
        part_path = os.path.join(args.outdir, f"comparativa_detalle_{tag}.csv")
        if not args.no_resume and os.path.exists(part_path):
            logger.info("Mes %s ya calculado; se reutiliza", tag)
            parts.append(pd.read_csv(part_path))
            continue
        lo = max(climate.index.min(),
                 (ms - pd.Timedelta(hours=args.train_h)).floor("h"))
        sub = climate.loc[(climate.index >= lo)
                          & (climate.index <= min(me, climate.index.max()))]
        if len(sub) <= args.train_h + max(horizons):
            logger.warning("Mes %s sin datos suficientes; se omite", tag)
            continue
        part = walk_forward_mae(
            sub, args.train_h, args.step_h, horizons, baselines,
            arima_every=args.arima_every,
            daytime_only=not args.no_daytime_only, providers=providers,
            step_delay=args.step_delay)
        part.to_csv(part_path, index=False)
        logger.info("Mes %s: %d filas", tag, len(part))
        parts.append(part)
    if not parts:
        raise SystemExit("Sin filas: revisar verdad y providers")
    table = pd.concat(parts, ignore_index=True)
    logger.info("Filas totales %d", len(table))

    det = table.groupby(["baseline", "horizon_h", "variable"]).agg(
        mae=("mae", "mean"), rmse=("se", lambda x: float(np.sqrt(x.mean()))),
        bias=("err", "mean"), n=("mae", "size")).reset_index()
    det.rename(columns={"baseline": "contendiente",
                        "horizon_h": "horizonte_h"}, inplace=True)
    det.to_csv(os.path.join(args.outdir, "comparativa_detalle.csv"),
               index=False)
    resumen = det.pivot_table(index=["contendiente", "horizonte_h"],
                              columns="variable", values="mae").round(3)
    resumen.to_csv(os.path.join(args.outdir, "comparativa_resumen.csv"))

    skill = {}
    try:
        ref = det[det["contendiente"] == "persistence"].set_index(
            ["horizonte_h", "variable"])["mae"]
        for (c, h, v), r in det.set_index(
                ["contendiente", "horizonte_h", "variable"]).iterrows():
            base = ref.get((h, v))
            skill.setdefault(c, {})[f"h{h}/{v}"] = (
                round(1 - r["mae"] / base, 4) if base else None)
    except Exception as exc:  # noqa: BLE001
        logger.warning("skill no calculable: %s", exc)
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True,
                                timeout=15).stdout.strip()
    except Exception:  # noqa: BLE001
        commit = "n/a"
    with open(os.path.join(args.outdir, "comparativa_skill.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"skill_vs_persistence": skill,
                   "meta": {"fecha": pd.Timestamp.now().isoformat(),
                            "commit": commit, "periodo": [str(start.date()),
                                                          str(end.date())],
                            "horizontes": horizons,
                            "nota": "NWP corregido con ML (same-family ERA5/ECMWF)"}},
                  fh, indent=2, ensure_ascii=False)

    # Ventana de ejemplo: primer paso con todos los contendientes (overlay).
    t0 = args.train_h
    actual = climate.iloc[t0:t0 + max(horizons)]
    series = {"time": actual.index, "real": actual}
    for p in providers:
        pname = getattr(p, "provider_name", str(p))
        try:
            if hasattr(p, "forecast"):
                fc = p.forecast(days=max(horizons) / 24,
                                anchor=actual.index[0]).data
            else:
                fc = p(actual.index[0], max(horizons))
            series[pname] = fc.reindex(actual.index)
        except Exception as exc:  # noqa: BLE001
            logger.warning("serie ejemplo %s fallo: %s", pname, exc)
    frames = []
    for key, df in series.items():
        if key == "time":
            continue
        tmp = df.copy() if not isinstance(df, pd.Series) else df
        frames.append(tmp)
    pd.concat(frames, keys=[k for k in series if k != "time"],
              names=["contendiente"]).to_parquet(
        os.path.join(args.outdir, "comparativa_series.parquet"))
    # JSON liviano para el panel (cada 3h): el servicio Node no lee parquet.
    times = actual.index[::3]
    with open(os.path.join(args.outdir, "comparativa_series.json"), "w",
              encoding="utf-8") as fh:
        json.dump({
            "time": [t.isoformat() for t in times],
            "real": {v: [round(float(x), 2) for x in
                         actual[v].iloc[::3].values]
                     for v in actual.columns},
            "contendientes": {
                k: {v: [round(float(x), 2) for x in
                        df.reindex(actual.index)[v].iloc[::3].values]
                    for v in actual.columns if v in df.columns}
                for k, df in series.items() if k != "time"},
        }, fh)

    _figuras(det, args.outdir)
    print(det[det["variable"] == "shortwave_radiation"].to_string(index=False))
    logger.info("Salidas en %s", args.outdir)
    return 0


def _figuras(det: pd.DataFrame, outdir: str):
    order = ["mos", "patchtst", "ecmwf_crudo", "persistence", "climatology",
             "arima"]
    conts = [c for c in order if c in set(det["contendiente"])]
    colors = {"mos": "#2563eb", "patchtst": "#16a34a",
              "ecmwf_crudo": "#f59e0b", "persistence": "#dc2626",
              "climatology": "#9333ea", "arima": "#64748b"}
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), sharey=False)
    for ax, var in zip(axes, ["shortwave_radiation",
                              "direct_normal_irradiance",
                              "diffuse_radiation"]):
        sub = det[det["variable"] == var]
        for c in conts:
            s = sub[sub["contendiente"] == c].sort_values("horizonte_h")
            if s.empty:
                continue  # leyenda solo con series dibujadas
            ax.plot(s["horizonte_h"], s["mae"], marker="o", ms=4,
                    color=colors.get(c, "#000000"), label=c)
        ax.set_title(f"MAE vs horizonte — {var}")
        ax.set_xlabel("horizonte (h)")
        ax.grid(alpha=0.3)
    axes[0].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig_compare_ghi.png"), dpi=150)
    plt.close(fig)

    # Barras de SKILL vs persistencia (adimensional: un solo eje válido).
    # N/A explícitos: mos en cloud_cover/precipitation (pass-through, no hay
    # habilidad que medir) y combos sin filas (crudo sin DNI/DHI/precip).
    h24 = det[det["horizonte_h"] == 24]
    variables = sorted(h24["variable"].unique())
    ref = h24[h24["contendiente"] == "persistence"].set_index("variable")["mae"]
    x = np.arange(len(variables))
    have = [c for c in conts if c != "persistence" and not h24[
        h24["contendiente"] == c].empty]
    w = 0.8 / max(1, len(have))
    fig, ax = plt.subplots(figsize=(14, 5))
    for i, c in enumerate(have):
        vals = []
        for v in variables:
            if c == "mos" and v in ("cloud_cover", "precipitation"):
                vals.append(np.nan)  # N/A: pass-through, no skill
                continue
            r = h24[(h24["contendiente"] == c) & (h24["variable"] == v)]
            b = ref.get(v)
            vals.append(np.nan if r.empty or not b else
                        1 - float(r["mae"].mean()) / b)
        ax.bar(x + (i - len(have) / 2 + 0.5) * w, vals, w, label=c,
               color=colors.get(c, "#000000"))
    ax.axhline(0, color="#111827", lw=1)
    ax.set_xticks(x, variables, rotation=30, ha="right", fontsize=8)
    ax.set_title("Skill vs persistencia por variable (h=24; N/A = sin medición)")
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3, axis="y")
    fig.text(0.01, 0.01, "MOS cloud/precip: pass-through (N/A). NWP corregido "
             "con ML (same-family ERA5/ECMWF).", fontsize=8, color="#64748b")
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig_compare_bars.png"), dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(levelname)s %(name)s: %(message)s")
    raise SystemExit(main())
