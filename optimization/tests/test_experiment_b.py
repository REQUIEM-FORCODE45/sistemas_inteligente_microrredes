# -*- coding: utf-8 -*-
"""Tests del Experimento B (tiempos del solver, R4)."""
from __future__ import annotations

import pytest

from optimization.solver.model_builder import build_and_solve
from optimization.experiments.experiment_b_solver_time import (
    JOB, hardware_report)


def test_timing_en_resultado_optimal():
    out = build_and_solve(dict(JOB, horizon=6))
    assert out["status"] == "optimal"
    t = out.get("timing_s")
    assert t is not None
    assert t["t_build"] >= 0
    assert t["t_solve"] >= 0
    # los tres estan redondeados a 4 decimales: tolerancia 1e-4
    assert t["t_total"] == pytest.approx(t["t_build"] + t["t_solve"], abs=1e-4)


def test_timing_en_resultado_error():
    job = dict(JOB, horizon=6)
    job["storage"] = [dict(JOB["storage"][0], max_charge_kw=-1)]
    out = build_and_solve(job)
    assert out.get("timing_s") is not None


def test_hardware_report_declara_solvers():
    hw = hardware_report()
    assert "gurobipy" in hw and hw["gurobipy"]
    assert "model_class" in hw and "MILP" in hw["model_class"]
    assert hw["gurobi_license"]
