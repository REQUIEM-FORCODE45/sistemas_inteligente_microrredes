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
                 termination: str = "", error: str = ""):
        self.status = status  # optimal, infeasible, error
        self.objective = objective
        self.termination = termination
        self.error = error


def _try_gurobi(model: Any) -> SolverResult:
    """Intenta resolver con Gurobi (licencia gratuita)."""
    try:
        import gurobipy  # noqa: F401
    except ImportError:
        return SolverResult(status="error", error="gurobipy no instalado")

    try:
        solver = pyo.SolverFactory("gurobi")
        result = solver.solve(model, tee=False)
        termination = str(result.solver.termination_condition)

        if termination == "optimal":
            obj = pyo.value(model.obj)
            return SolverResult(status="optimal", objective=obj, termination=termination)
        elif termination == "infeasible":
            return SolverResult(status="infeasible", termination=termination)
        else:
            return SolverResult(status="error", termination=termination,
                                error=f"Gurobi finalizo con: {termination}")
    except Exception as e:
        logger.warning(f"Gurobi fallo: {e}. Reintentando con HiGHS...")
        return SolverResult(status="error", error=str(e))


def _try_highs(model: Any) -> SolverResult:
    """Intenta resolver con HiGHS (appsi.highs) como fallback."""
    try:
        solver = pyo.SolverFactory("appsi_highs")
        result = solver.solve(model, tee=False)
        termination = str(result.solver.termination_condition)

        if termination in ("optimal", "feasible"):
            obj = pyo.value(model.obj)
            return SolverResult(status="optimal", objective=obj, termination=termination)
        elif termination == "infeasible":
            return SolverResult(status="infeasible", termination=termination)
        else:
            return SolverResult(status="error", termination=termination,
                                error=f"HiGHS finalizo con: {termination}")
    except Exception as e:
        logger.error(f"HiGHS fallo: {e}")
        return SolverResult(status="error", error=str(e))


def solve(model: Any, preferred: str = "gurobi") -> SolverResult:
    """Resuelve el modelo Pyomo usando el solver preferido.
    Si falla, intenta HiGHS como respaldo.

    Args:
        model: instancia de pyomo.ConcreteModel
        preferred: 'gurobi' o 'highs'

    Returns:
        SolverResult con status, objective, termination, error
    """
    if not PYOMO_AVAILABLE:
        return SolverResult(status="error", error="Pyomo no disponible")

    if preferred == "gurobi":
        result = _try_gurobi(model)
        if result.status == "optimal":
            return result

    result = _try_highs(model)
    if result.status == "optimal":
        return result

    return result
