# -*- coding: utf-8 -*-
"""Muestreo de recursos del Experimento C (R6): CPU/RAM de cada servicio
(Node backend, uvicorn, redis) durante la carga sostenida.

Uso (mientras corre la carga):
  python3 -m optimization.experiments.load.sample_resources \
      --duration 600 --interval 5 --out results/pasto_narino/experiments/expC_resources.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import time
from pathlib import Path

import psutil

SERVICE_PATTERNS = [
    ("backend_node", ["node", "app.js"]),
    ("prediccion_uvicorn", ["uvicorn", "prediction.main"]),
    ("redis", ["redis-server"]),
    ("expA_backtest", ["experiment_a"]),
]


def _find_pids(patterns: list[str]) -> list[int]:
    out = []
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            cmd = " ".join(proc.info["cmdline"] or [])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if all(p in cmd for p in patterns):
            out.append(proc.info["pid"])
    return out


def _proc_jiffies(pid: int) -> tuple[int, int]:
    """(utime, stime) en jiffies desde /proc/<pid>/stat."""
    try:
        with open(f"/proc/{pid}/stat", "rb") as fh:
            parts = fh.read().decode(errors="ignore").split()
        # partes 13 y 14 (indices 12, 13) tras el nombre entre parentesis
        return int(parts[12]), int(parts[13])
    except Exception:  # noqa: BLE001
        return 0, 0


def _total_jiffies() -> int:
    try:
        with open("/proc/stat", "rb") as fh:
            first = fh.readline().decode().split()
        return sum(int(v) for v in first[1:])
    except Exception:  # noqa: BLE001
        return 0


_CPU_LAST: dict[int, tuple[int, int, int]] = {}   # pid -> (utime, stime, total)
_NCPU = os.cpu_count() or 1


def _cpu_pct(pid: int) -> float:
    """CPU % desde el ultimo muestreo (deltas de /proc). Sin primer-llamada-0."""
    ut, st = _proc_jiffies(pid)
    tot = _total_jiffies()
    prev = _CPU_LAST.get(pid)
    _CPU_LAST[pid] = (ut, st, tot)
    if prev is None or tot <= prev[2]:
        return 0.0
    d_proc = (ut - prev[0]) + (st - prev[1])
    d_tot = tot - prev[2]
    if d_tot <= 0:
        return 0.0
    return d_proc / d_tot * 100.0 * _NCPU


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration", type=float, default=600.0)
    ap.add_argument("--interval", type=float, default=5.0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out_path = Path(args.out or (
        Path(__file__).resolve().parents[3] / "results" / "pasto_narino"
        / "experiments" / "expC_resources.csv"))
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["ts", "service", "pid", "cpu_pct", "rss_mb"])
        t0 = time.time()
        deadline = t0 + args.duration
        n = 0
        while time.time() < deadline:
            for name, patterns in SERVICE_PATTERNS:
                for pid in _find_pids(patterns):
                    try:
                        p = psutil.Process(pid)
                        cpu = _cpu_pct(pid)
                        rss = p.memory_info().rss / 1048576
                        writer.writerow([
                            time.strftime("%H:%M:%S"), name, pid,
                            round(cpu, 1), round(rss, 1)])
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            fh.flush()
            n += 1
            time.sleep(args.interval)
    print(f"Muestreo terminado: {n} rondas -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
