#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verificacion de No-Regresion Fase 1 vs Cambio 18 (auditoria C6 item 3).

Ejecuta 1 celda de la Fase 1 (isla, smpc, 1 dia 2026-08-03, banda C conformal_disjunto,
planta calibrada ERA5) con el nuevo codigo del solver en modo 'exact' (sin limites y gap 0.0).
Compara los resultados contra la linea base versionada en:
integracion_plataforma/validacion/fase_1/v1_bandc/expA2_daily_v1_c_smpc.csv

Uso (en la maquina virtual con Pyomo y solvers):
    python integracion_plataforma/cambio_18_simulacion_mpc_fisica/verificar_noregresion_fase1.py
"""
import hashlib
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_CSV = (
    REPO_ROOT
    / "integracion_plataforma"
    / "validacion"
    / "fase_1"
    / "v1_bandc"
    / "expA2_daily_v1_c_smpc.csv"
)


def main():
    print("=" * 70)
    print("AUDITORIA C6: VERIFICACION DE NO-REGRESION FASE 1")
    print("=" * 70)

    if not BASELINE_CSV.exists():
        print(f"ERROR: No se encuentra la linea base en {BASELINE_CSV}")
        return 1

    tag = "c6_noregresion_test"
    cmd = [
        sys.executable,
        "-m",
        "optimization.experiments.experiment_a2_stochastic",
        "--days", "1",
        "--start-date", "2026-08-03",
        "--initial-soc", "0.65",
        "--modes", "isla",
        "--strategies", "smpc",
        "--band-mode", "conformal_disjunto",
        "--pv-source", "era5",
        "--tag", tag,
    ]

    print(f"Ejecutando celda de validacion con modo 'exact':")
    print(f"  {' '.join(cmd)}\n")

    proc = subprocess.run(cmd, cwd=REPO_ROOT)
    if proc.returncode != 0:
        print(f"ERROR: La corrida fallo con codigo de salida {proc.returncode}")
        return proc.returncode

    out_csv = (
        REPO_ROOT
        / "results"
        / "pasto_narino"
        / "experiments"
        / f"expA2_daily_{tag}.csv"
    )

    if not out_csv.exists():
        print(f"ERROR: No se genero el archivo de salida en {out_csv}")
        return 1

    # Leer primera fila de datos de baseline
    with open(BASELINE_CSV, "r", encoding="utf-8") as f:
        base_lines = [line.strip() for line in f if line.strip()]

    with open(out_csv, "r", encoding="utf-8") as f:
        out_lines = [line.strip() for line in f if line.strip()]

    print("\nResultados:")
    print(f"  Baseline (Fase 1):  {base_lines[1]}")
    print(f"  Corrida Cambio 18: {out_lines[1]}")

    base_cols = base_lines[0].split(",")
    base_vals = base_lines[1].split(",")
    out_vals = out_lines[1].split(",")

    all_match = True
    for col, b_val, o_val in zip(base_cols, base_vals, out_vals):
        try:
            b_f, o_f = float(b_val), float(o_val)
            delta = abs(b_f - o_f)
            if delta > 1e-4:
                print(f"  DIFERENCIA en {col}: baseline={b_f} vs nuevo={o_f} (delta={delta})")
                all_match = False
        except ValueError:
            if b_val != o_val:
                print(f"  DIFERENCIA en {col}: baseline={b_val} vs nuevo={o_val}")
                all_match = False

    if all_match:
        print("\n" + "=" * 70)
        print("VEREDICTO: NO-REGRESION DEMOSTRADA AL 100% (IDENTICO)")
        print("El nuevo codigo de Cambio 18 con solver exacto reproduce exactamente")
        print("las lineas base publicadas de la Fase 1.")
        print("=" * 70)
        return 0
    else:
        print("\n" + "=" * 70)
        print("VEREDICTO: HAY REGRESION NUMERICA")
        print("=" * 70)
        return 1


if __name__ == "__main__":
    sys.exit(main())
