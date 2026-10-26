# -*- coding: utf-8 -*-
"""Tests unitarios para la correccion C6 del solver (Auditoria Cambio 18).

Verifica:
1. Valores por defecto reproducibles (sin limite de tiempo, gap 0.0) en modo 'exact'.
2. Activacion declarada de limites en modo 'production' (time_limit=60s, mip_gap=0.01).
3. No colapso de soluciones factibles/truncadas ('feasible', 'maxTimeLimit') a 'optimal'.
4. Reporte explicito de status, termination, solver_usado y gap en el resultado.
"""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import optimization.solver.solvers as solvers_module
from optimization.solver.solvers import (
    PRODUCTION_MIP_GAP,
    PRODUCTION_TIME_LIMIT,
    SolverResult,
    _try_gurobi,
    _try_highs,
    solve,
)


class TestSolverC6(unittest.TestCase):
    """Verifica los cuatro requisitos de la auditoria C6."""

    def setUp(self):
        # Garantizar mock de pyo y PYOMO_AVAILABLE si corremos en entorno sin Pyomo instalado
        self._orig_pyomo_avail = solvers_module.PYOMO_AVAILABLE
        solvers_module.PYOMO_AVAILABLE = True
        if not hasattr(solvers_module, "pyo") or solvers_module.pyo is None:
            self._created_pyo = True
            solvers_module.pyo = MagicMock()
        else:
            self._created_pyo = False

    def tearDown(self):
        solvers_module.PYOMO_AVAILABLE = self._orig_pyomo_avail
        if self._created_pyo:
            delattr(solvers_module, "pyo")

    def test_solver_result_fields(self):
        """SolverResult debe retener fielmente todos los metadatos de resolucion."""
        res = SolverResult(
            status="feasible",
            objective=123.45,
            termination="maxTimeLimit",
            error="",
            solver_usado="appsi_highs",
            gap=0.008,
        )
        self.assertEqual(res.status, "feasible")
        self.assertEqual(res.objective, 123.45)
        self.assertEqual(res.termination, "maxTimeLimit")
        self.assertEqual(res.solver_usado, "appsi_highs")
        self.assertEqual(res.gap, 0.008)

    def test_default_mode_is_exact_and_unlimited(self):
        """Por defecto ('exact'), time_limit debe ser None y mip_gap 0.0 para reproducibilidad."""
        with patch("optimization.solver.solvers._try_gurobi") as mock_gurobi:
            mock_gurobi.return_value = SolverResult(status="optimal", objective=10.0, solver_usado="gurobi")
            mock_model = MagicMock()

            # Invocacion default sin argumentos opcionales
            res = solve(mock_model)
            self.assertEqual(res.status, "optimal")
            # Debe invocarse sin time_limit y con gap 0.0
            mock_gurobi.assert_called_once_with(mock_model, time_limit=None, mip_gap=0.0)

    def test_production_mode_activates_declared_limits(self):
        """En modo 'production', aplica limites declarados (60s, 1%)."""
        with patch("optimization.solver.solvers._try_gurobi") as mock_gurobi:
            mock_gurobi.return_value = SolverResult(status="optimal", objective=10.0, solver_usado="gurobi")
            mock_model = MagicMock()

            res = solve(mock_model, mode="production")
            self.assertEqual(res.status, "optimal")
            mock_gurobi.assert_called_once_with(
                mock_model,
                time_limit=PRODUCTION_TIME_LIMIT,
                mip_gap=PRODUCTION_MIP_GAP,
            )

    def test_explicit_parameters_override_mode(self):
        """Parametros explicitos tienen prioridad sobre los defaults del modo."""
        with patch("optimization.solver.solvers._try_gurobi") as mock_gurobi:
            mock_gurobi.return_value = SolverResult(status="optimal", objective=10.0, solver_usado="gurobi")
            mock_model = MagicMock()

            solve(mock_model, time_limit=120.0, mip_gap=0.005, mode="production")
            mock_gurobi.assert_called_once_with(mock_model, time_limit=120.0, mip_gap=0.005)

    def test_feasible_is_never_collapsed_into_optimal_gurobi(self):
        """Una solucion truncada por maxTimeLimit NUNCA debe reportarse como 'optimal'."""
        mock_solver = MagicMock()
        mock_result = MagicMock()
        mock_result.solver.termination_condition = "maxTimeLimit"
        mock_result.solver.gap = 0.015
        mock_solver.solve.return_value = mock_result

        with patch.object(solvers_module.pyo, "SolverFactory", return_value=mock_solver):
            with patch.object(solvers_module.pyo, "value", return_value=500.0):
                with patch.dict("sys.modules", {"gurobipy": MagicMock()}):
                    res = _try_gurobi(MagicMock(), time_limit=60.0)
                    self.assertEqual(res.status, "feasible", "maxTimeLimit debe ser 'feasible', jamas 'optimal'")
                    self.assertEqual(res.termination, "maxTimeLimit")
                    self.assertEqual(res.solver_usado, "gurobi")
                    self.assertEqual(res.gap, 0.015)

    def test_feasible_is_never_collapsed_into_optimal_highs(self):
        """En HiGHS, feasible y maxTimeLimit retienen status='feasible' con gap reportado."""
        mock_solver = MagicMock()
        mock_result = MagicMock()
        mock_result.solver.termination_condition = "feasible"
        mock_result.solver.gap = 0.02
        mock_solver.solve.return_value = mock_result

        with patch.object(solvers_module.pyo, "SolverFactory", return_value=mock_solver):
            with patch.object(solvers_module.pyo, "value", return_value=600.0):
                res = _try_highs(MagicMock(), time_limit=60.0)
                self.assertEqual(res.status, "feasible", "feasible debe preservarse fielmente")
                self.assertEqual(res.termination, "feasible")
                self.assertEqual(res.solver_usado, "appsi_highs")
                self.assertEqual(res.gap, 0.02)


if __name__ == "__main__":
    unittest.main()
