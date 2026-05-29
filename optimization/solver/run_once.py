"""Script batch: Node.js lo llama via child_process cuando hay un job pendiente.
Lee el siguiente job de Redis, lo resuelve, y publica el resultado.

Uso: python optimization/solver/run_once.py
"""

import json
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import redis

from optimization.solver.model_builder import build_and_solve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("solver.run_once")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
PENDING_LIST = "optimization:pending"
RESULT_PREFIX = "optimization:result:"
PROGRESS_PREFIX = "optimization:progress:"


def main():
    try:
        r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        r.ping()
    except redis.ConnectionError:
        logger.error("No se pudo conectar a Redis")
        sys.exit(1)

    result = r.brpop(PENDING_LIST, timeout=1)
    if result is None:
        logger.warning("No hay jobs pendientes en Redis")
        sys.exit(0)

    _, raw_job = result
    job_data = json.loads(raw_job)
    job_id = job_data.get("job_id", "unknown")

    logger.info(f"Procesando job {job_id}")

    r.set(f"{PROGRESS_PREFIX}{job_id}", "running")
    r.expire(f"{PROGRESS_PREFIX}{job_id}", 3600)

    try:
        output = build_and_solve(job_data)
        logger.info(f"Job {job_id} completado: {output.get('status')}")
        r.set(f"{RESULT_PREFIX}{job_id}", json.dumps(output))
        r.set(f"{PROGRESS_PREFIX}{job_id}", "completed")
    except Exception as exc:
        logger.exception(f"Error en job {job_id}")
        error_result = {"job_id": job_id, "status": "error", "error": str(exc)}
        r.set(f"{RESULT_PREFIX}{job_id}", json.dumps(error_result))
        r.set(f"{PROGRESS_PREFIX}{job_id}", "failed")

    r.expire(f"{RESULT_PREFIX}{job_id}", 86400)
    r.expire(f"{PROGRESS_PREFIX}{job_id}", 86400)


if __name__ == "__main__":
    main()
