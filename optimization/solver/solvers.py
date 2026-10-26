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


# Defaults para modo produccion (opcional, activado declarativamente)
PRODUCTION_TIME_LIMIT = 60.0  # segundos
PRODUCTION_MIP_GAP = 0.01     # 1% de tolerancia


class SolverResult:
    """Resultado de la ejecucion del solver."""

    def __init__(self, status: str, objective: float | None = None,
                 termination: str = "", error: str = "",
                 solver_usado: str | None = None,
                 gap: float | None = None):
        self.status = status  # optimal, feasible, infeasible, error
        self.objective = objective
        self.termination = termination
        self.error = error
        # Auditoria item 6: que resuelve DE VERDAD (no el preferido).
        self.solver_usado = solver_usado
        self.gap = gap


def _try_gurobi(model: Any, time_limit: float | None = None,
                mip_gap: float | None = None) -> SolverResult:
    """Intenta resolver con Gurobi (licencia gratuita o comercial)."""
    try:
        import gurobipy  # noqa: F401
    except ImportError:
        return SolverResult(status="error", error="gurobipy no instalado", solver_usado="gurobi")

    try:
        solver = pyo.SolverFactory("gurobi")
        if hasattr(solver, "options"):
            if time_limit is not None:
                solver.options["TimeLimit"] = time_limit
            if mip_gap is not None:
                solver.options["MIPGap"] = mip_gap
        result = solver.solve(model, tee=False)
        termination = str(result.solver.termination_condition)

        # Extraer gap si esta disponible
        gap = None
        try:
            if hasattr(result.solver, "gap"):
                gap = float(result.solver.gap)
        except Exception:
            gap = None

        if termination == "optimal":
            obj = pyo.value(model.obj)
            return SolverResult(status="optimal", objective=obj, termination=termination,
                                solver_usado="gurobi", gap=gap)
        elif termination in ("feasible", "maxTimeLimit"):
            # Auditoria C6: NO colapsar feasible en optimal.
            # Mantiene status="feasible" y reporta termination y gap fielmente.
            try:
                obj = pyo.value(model.obj)
                return SolverResult(status="feasible", objective=obj, termination=termination,
                                    solver_usado="gurobi", gap=gap)
            except Exception:
                return SolverResult(status="error", termination=termination,
                                    error=f"Gurobi finalizo con: {termination} pero sin solucion incumbente",
                                    solver_usado="gurobi", gap=gap)
        elif termination == "infeasible":
            return SolverResult(status="infeasible", termination=termination, solver_usado="gurobi")
        else:
            try:
                obj = pyo.value(model.obj)
                return SolverResult(status="feasible", objective=obj, termination=termination,
                                    solver_usado="gurobi", gap=gap)
            except Exception:
                return SolverResult(status="error", termination=termination,
                                    error=f"Gurobi finalizo con: {termination}", solver_usado="gurobi")
    except Exception as e:
        logger.warning(f"Gurobi fallo: {e}. Reintentando con HiGHS...")
        return SolverResult(status="error", error=str(e), solver_usado="gurobi")


def _try_highs(model: Any, time_limit: float | None = None,
               mip_gap: float | None = None) -> SolverResult:
    """Intenta resolver con HiGHS (appsi.highs) como fallback."""
    try:
        solver = pyo.SolverFactory("appsi_highs")
        if hasattr(solver, "highs_options"):
            if time_limit is not None:
                solver.highs_options["time_limit"] = time_limit
            if mip_gap is not None:
                solver.highs_options["mip_rel_gap"] = mip_gap
        result = solver.solve(model, tee=False)
        termination = str(result.solver.termination_condition)

        gap = None
        try:
            if hasattr(result.solver, "gap"):
                gap = float(result.solver.gap)
        except Exception:
            gap = None

        if termination == "optimal":
            obj = pyo.value(model.obj)
            return SolverResult(status="optimal", objective=obj, termination=termination,
                                solver_usado="appsi_highs", gap=gap)
        elif termination in ("feasible", "maxTimeLimit"):
            # Auditoria C6: NO colapsar feasible en optimal.
            # Mantiene status="feasible" y reporta termination y gap fielmente.
            try:
                obj = pyo.value(model.obj)
                return SolverResult(status="feasible", objective=obj, termination=termination,
                                    solver_usado="appsi_highs", gap=gap)
            except Exception:
                return SolverResult(status="error", termination=termination,
                                    error=f"HiGHS finalizo con: {termination} pero sin solucion incumbente",
                                    solver_usado="appsi_highs", gap=gap)
        elif termination == "infeasible":
            return SolverResult(status="infeasible", termination=termination, solver_usado="appsi_highs")
        else:
            try:
                obj = pyo.value(model.obj)
                return SolverResult(status="feasible", objective=obj, termination=termination,
                                    solver_usado="appsi_highs", gap=gap)
            except Exception:
                return SolverResult(status="error", termination=termination,
                                    error=f"HiGHS finalizo con: {termination}", solver_usado="appsi_highs")
    except Exception as e:
        logger.error(f"HiGHS fallo: {e}")
        return SolverResult(status="error", error=str(e), solver_usado="appsi_highs")


def solve(model: Any, preferred: str = "gurobi",
          time_limit: float | None = None,
          mip_gap: float | None = None,
          mode: str = "exact") -> SolverResult:
    """Resuelve el modelo Pyomo usando el solver preferido.
    Si falla por ejecucion/licencia, intenta HiGHS como respaldo.
    Si el resultado es infactible comprobado, no reintenta.

    Por defecto opera en modo 'exact' (reproducibilidad cientifica de la tesis):
    sin limite de tiempo (time_limit=None) y gap exacto 0.0, garantizando
    que las lineas base no sufran distorsion por cortes prematuros ni gaps.

    El modo 'production' activa limites operativos declarados (time_limit=60s, mip_gap=1%).

    Args:
        model: instancia de pyomo.ConcreteModel
        preferred: 'gurobi' o 'highs'
        time_limit: tiempo maximo de resolucion en segundos (None = sin limite)
        mip_gap: tolerancia de gap relativo (None = 0.0 en modo exacto)
        mode: 'exact' (default de reproducibilidad) o 'production'

    Returns:
        SolverResult con status, objective, termination, error, solver_usado, gap
    """
    if not PYOMO_AVAILABLE:
        return SolverResult(status="error", error="Pyomo no disponible")

    if mode == "production":
        if time_limit is None:
            time_limit = PRODUCTION_TIME_LIMIT
        if mip_gap is None:
            mip_gap = PRODUCTION_MIP_GAP
    elif mode == "exact":
        if mip_gap is None:
            mip_gap = 0.0
        # time_limit se mantiene None (sin corte artificial de tiempo)

    if preferred == "gurobi":
        result = _try_gurobi(model, time_limit=time_limit, mip_gap=mip_gap)
        if result.status in ("optimal", "feasible", "infeasible"):
            return result

    result = _try_highs(model, time_limit=time_limit, mip_gap=mip_gap)
    return result
