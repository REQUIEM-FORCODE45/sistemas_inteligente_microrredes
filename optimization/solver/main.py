"""Worker Python de optimizacion para SIGE.

Escucha trabajos de optimizacion desde Redis (patron Bridge con BullMQ de Node.js)
y ejecuta el modelo Pyomo/Gurobi.

Uso:
  python -m optimization.solver.main

Flujo:
  1. Node.js enqueues via BullMQ → tambien publica en Redis LIST 'optimization:pending'
  2. Python hace BRPOP en 'optimization:pending'
  3. Construye modelo Pyomo, resuelve con Gurobi/HiGHS
  4. Publica resultado en Redis key 'optimization:result:<job_id>'
  5. Node.js recoge el resultado y lo emite via Socket.IO
"""

import json
import logging
import os
import signal
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import redis

from optimization.solver.model_builder import build_and_solve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("solver.worker")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
PENDING_LIST = "optimization:pending"
RESULT_PREFIX = "optimization:result:"
PROGRESS_PREFIX = "optimization:progress:"

shutdown_requested = False


def handle_signal(signum, frame):
    global shutdown_requested
    logger.info(f"Senal {signum} recibida, cerrando...")
    shutdown_requested = True


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def connect_redis() -> redis.Redis:
    for attempt in range(5):
        try:
            r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
            r.ping()
            logger.info(f"Conectado a Redis en {REDIS_URL}")
            return r
        except redis.ConnectionError:
            logger.warning(f"Intento {attempt + 1}/5: Redis no disponible, reintentando...")
            time.sleep(2)
    raise RuntimeError("No se pudo conectar a Redis")


def main():
    r = connect_redis()

    logger.info("Worker de optimizacion iniciado. Esperando trabajos...")

    while not shutdown_requested:
        try:
            result = r.brpop(PENDING_LIST, timeout=2)
            if result is None:
                continue

            _, raw_job = result
            job_data = json.loads(raw_job)
            job_id = job_data.get("job_id", "unknown")

            logger.info(f"Procesando job {job_id}")

            r.set(f"{PROGRESS_PREFIX}{job_id}", "running")
            r.expire(f"{PROGRESS_PREFIX}{job_id}", 3600)

            start_time = time.time()
            try:
                output = build_and_solve(job_data)
                elapsed = round(time.time() - start_time, 2)
                logger.info(f"Job {job_id} completado en {elapsed}s: {output.get('status')}")

                r.set(f"{RESULT_PREFIX}{job_id}", json.dumps(output))
                r.expire(f"{RESULT_PREFIX}{job_id}", 86400)
                r.set(f"{PROGRESS_PREFIX}{job_id}", "completed")

            except Exception as exc:
                logger.exception(f"Error en job {job_id}")
                error_result = {
                    "job_id": job_id,
                    "status": "error",
                    "error": str(exc),
                }
                r.set(f"{RESULT_PREFIX}{job_id}", json.dumps(error_result))
                r.expire(f"{RESULT_PREFIX}{job_id}", 86400)
                r.set(f"{PROGRESS_PREFIX}{job_id}", "failed")

        except redis.ConnectionError:
            logger.error("Conexion Redis perdida, reintentando...")
            time.sleep(5)
            try:
                r = connect_redis()
            except RuntimeError:
                break
        except KeyboardInterrupt:
            break
        except BaseException as exc:
            logger.exception(f"Error fatal en worker, continuando...")
            time.sleep(2)

    logger.info("Worker detenido.")


if __name__ == "__main__":
    main()
