# -*- coding: utf-8 -*-
"""Carga MQTT del Experimento C (R5/R6).

Publica a los topics REALES (`DataSensor/<sensor_id>` de la whitelist) a
`--rate` msg/s durante `--duration` s. Cada payload incluye `sent_ts`
(epoch ms) para que el backend mida la latencia end-to-end
(`mqtt_latency_end_to_end_ms` en /api/front/performance).

Los payloads se generan con el generador sintetico del proyecto
(optimization/data/synthetic) para que tengan el esquema real del sensor.

Uso:
  python3 -m optimization.experiments.load.load_mqtt \
      --rate 10 --duration 600 [--devices 5]
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import time

import numpy as np
import pandas as pd

from optimization.config.loader import load_site
from optimization.weather.openmeteo import OpenMeteoClient
from optimization.data.synthetic.publish import parse_env_file, broker_url

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("load_mqtt")

KEYS = ["solar_pv", "load", "bess", "wind"]  # solo sensores en la whitelist


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="pasto_narino")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--rate", type=float, default=10.0, help="msg/s totales")
    ap.add_argument("--duration", type=float, default=600.0, help="segundos")
    ap.add_argument("--qos", type=int, default=1)
    ap.add_argument("--broker", default=None)
    args = ap.parse_args()

    env = parse_env_file(os.environ.get("BACKEND_ENV", "Backend/.env"))
    broker = args.broker or broker_url(env)
    cfg = load_site(args.site)
    site_cfg = cfg["site"]
    tz = site_cfg.get("timezone", "America/Bogota")
    prefix = site_cfg["id"].split("_")[0] or "pasto"
    ids = [f"{prefix}_{k}" for k in KEYS]

    import paho.mqtt.client as mqtt_cli
    from urllib.parse import urlparse
    _u = urlparse(broker)
    host = _u.hostname or "localhost"
    port = _u.port or 1883
    client = mqtt_cli.Client(mqtt_cli.CallbackAPIVersion.VERSION2)
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    connected = False

    def _on_connect(c, u, f, rc, props=None):
        nonlocal connected
        connected = rc == 0

    client.on_connect = _on_connect
    client.connect(host, port)
    client.loop_start()
    t0 = time.time()
    deadline = t0 + args.duration
    while not connected and time.time() < t0 + 15:
        time.sleep(0.2)
    if not connected:
        logger.error("No conectado al broker %s", broker)
        return 1
    logger.info("Conectado a %s — %d sensores, %.1f msg/s, %.0f s",
                broker, len(ids), args.rate, args.duration)

    climate = OpenMeteoClient(latitude=site_cfg["latitude"],
                              longitude=site_cfg["longitude"],
                              timezone=tz)
    from optimization.data.synthetic.generator import generate_sensors
    horizon = climate.fetch_forecast(past_days=1, forecast_days=1)
    sensors = generate_sensors(horizon, seed=args.seed, cfg=cfg, step="5min")
    rows = {k: sensors[k].iloc[0].to_dict() for k in KEYS if len(sensors[k])}

    period = 1.0 / max(0.5, args.rate)
    rng = np.random.default_rng(args.seed + 7)
    n_pub = 0
    n_err = 0
    next_t = t0
    while time.time() < deadline:
        sensor = ids[int(rng.integers(len(ids)))]
        key = sensor[len(prefix) + 1:] if sensor.startswith(prefix) else sensor
        payload = dict(rows[key])
        payload["sent_ts"] = int(time.time() * 1000)
        info = client.publish(f"DataSensor/{sensor}",
                              json.dumps(payload, default=str), qos=args.qos)
        if info.rc == 0:
            n_pub += 1
        else:
            n_err += 1
        next_t += period
        delay = next_t - time.time()
        if delay > 0:
            time.sleep(delay)

    client.disconnect()
    client.loop_stop()
    elapsed = time.time() - t0
    logger.info("Publicados %d msgs en %.1f s -> %.2f msg/s (errores %d)",
                n_pub, elapsed, n_pub / elapsed, n_err)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
