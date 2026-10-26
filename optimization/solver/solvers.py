"""Wrapper de solvers: Gurobi (primario) y HiGHS (fallback).

Usa Pyomo para construir el modelo y delega la resolucion al solver configurado.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    import pyomo.environ as pyo
    PYOMO_AVAILABLE = True
except ImportError:
    PYOMO_AVAILABLE = False
    logger.warning("Pyomo no instalado. Instala con: pip install pyomo")


class SolverResult:
    """Resultado de la ejecucion del solver."""

    def __init__(self, status: str, objective: float | None = None,
                 termination: str = "", error: str = "",
                 solver_usado: str = None):
        self.status = status  # optimal, infeasible, feasible, error
        self.objective = objective
        self.termination = termination
        self.error = error
        # Auditoria item 6: que resuelve DE VERDAD (no el preferido).
        self.solver_usado = solver_usado


def _try_gurobi(model: Any, time_limit: float = 60.0) -> SolverResult:
    """Intenta resolver con Gurobi (licencia gratuita o comercial)."""
    try:
        import gurobipy  # noqa: F401
    except ImportError:
        return SolverResult(status="error", error="gurobipy no instalado")

    try:
        solver = pyo.SolverFactory("gurobi")
        if hasattr(solver, "options"):
            solver.options["TimeLimit"] = time_limit
            solver.options["MIPGap"] = 0.01
        result = solver.solve(model, tee=False)
        termination = str(result.solver.termination_condition)

        if termination in ("optimal", "feasible"):
            obj = pyo.value(model.obj)
            return SolverResult(status="optimal", objective=obj, termination=termination, solver_usado="gurobi")
        elif termination == "infeasible":
            return SolverResult(status="infeasible", termination=termination, solver_usado="gurobi")
        else:
            try:
                obj = pyo.value(model.obj)
                return SolverResult(status="feasible", objective=obj, termination=termination, solver_usado="gurobi")
            except Exception:
                return SolverResult(status="error", termination=termination,
                                    error=f"Gurobi finalizo con: {termination}", solver_usado="gurobi")
    except Exception as e:
        logger.warning(f"Gurobi fallo: {e}. Reintentando con HiGHS...")
        return SolverResult(status="error", error=str(e), solver_usado="gurobi")


def _try_highs(model: Any, time_limit: float = 60.0) -> SolverResult:
    """Intenta resolver con HiGHS (appsi.highs) como fallback."""
    try:
        solver = pyo.SolverFactory("appsi_highs")
        if hasattr(solver, "highs_options"):
            solver.highs_options["time_limit"] = time_limit
            solver.highs_options["mip_rel_gap"] = 0.01
        result = solver.solve(model, tee=False)
        termination = str(result.solver.termination_condition)

        if termination in ("optimal", "feasible"):
            obj = pyo.value(model.obj)
            return SolverResult(status="optimal", objective=obj, termination=termination, solver_usado="appsi_highs")
        elif termination == "infeasible":
            return SolverResult(status="infeasible", termination=termination, solver_usado="appsi_highs")
        else:
            try:
                obj = pyo.value(model.obj)
                return SolverResult(status="feasible", objective=obj, termination=termination, solver_usado="appsi_highs")
            except Exception:
                return SolverResult(status="error", termination=termination,
                                    error=f"HiGHS finalizo con: {termination}", solver_usado="appsi_highs")
    except Exception as e:
        logger.error(f"HiGHS fallo: {e}")
        return SolverResult(status="error", error=str(e), solver_usado="appsi_highs")


def solve(model: Any, preferred: str = "gurobi", time_limit: float = 60.0) -> SolverResult:
    """Resuelve el modelo Pyomo usando el solver preferido.
    Si falla por ejecucion/licencia, intenta HiGHS como respaldo.
    Si el resultado es infactible comprobado, no reintenta.

    Args:
        model: instancia de pyomo.ConcreteModel
        preferred: 'gurobi' o 'highs'
        time_limit: tiempo maximo de resolucion en segundos (default 60s)

    Returns:
        SolverResult con status, objective, termination, error, solver_usado
    """
    if not PYOMO_AVAILABLE:
        return SolverResult(status="error", error="Pyomo no disponible")

    if preferred == "gurobi":
        result = _try_gurobi(model, time_limit=time_limit)
        if result.status in ("optimal", "feasible", "infeasible"):
            return result

    result = _try_highs(model, time_limit=time_limit)
    return result
