#!/usr/bin/env python3
"""
Benchmark MQTT end-to-end (Punto 11 del revisor): latencia publicación ->
recepcion y throughput sostenido, con N dispositivos simulados publicando a 1 Hz.

Requisitos:
  - paho-mqtt instalado (pip install paho-mqtt).
  - Broker MQTT accesible (por defecto el broker del proyecto; usar --broker).

Uso:
  python optimization/benchmarks/bench_mqtt.py --devices 10 --messages 100 --broker mqtt://localhost:1883
"""
import argparse
import json
import statistics
import sys
import threading
import time

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("ERROR: paho-mqtt no instalado (pip install paho-mqtt)")
    sys.exit(1)


def pct(vals, p):
    s = sorted(vals)
    k = max(0, min(len(s) - 1, int(round((p / 100.0) * (len(s) - 1)))))
    return s[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--broker", default="mqtt://34.69.148.115")
    ap.add_argument("--devices", type=int, default=10)
    ap.add_argument("--messages", type=int, default=100)
    ap.add_argument("--topic-prefix", default="DataSensor")
    args = ap.parse_args()

    broker = args.broker.replace("mqtt://", "")
    received = {}
    latencies = []
    lock = threading.Lock()

    def on_connect(c, u, f, rc, *a):
        for d in range(args.devices):
            c.subscribe(f"{args.topic_prefix}/{d}")

    def on_message(c, u, msg):
        try:
            payload = json.loads(msg.payload)
            if "sent_ts" in payload:
                rtt = (time.time() - payload["sent_ts"]) * 1000.0
                with lock:
                    latencies.append(rtt)
                    received[msg.topic] = received.get(msg.topic, 0) + 1
        except Exception:
            pass

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(broker, 1883, 60)
    client.loop_start()

    time.sleep(1.0)  # esperar conexión
    t_start = time.time()
    sent = 0
    for i in range(args.messages):
        for d in range(args.devices):
            payload = json.dumps({"sent_ts": time.time(), "v": i, "d": d})
            client.publish(f"{args.topic_prefix}/{d}", payload)
            sent += 1
        time.sleep(1.0 / max(1, args.devices))  # ~1 Hz por dispositivo
    t_total = time.time() - t_start
    time.sleep(1.0)
    client.loop_stop()

    result = {
        "broker": broker,
        "devices": args.devices,
        "messages_per_device": args.messages,
        "total_published": sent,
        "total_received": sum(received.values()),
        "rtt_latency_ms": {
            "p50": round(pct(latencies, 50), 2) if latencies else None,
            "p95": round(pct(latencies, 95), 2) if latencies else None,
            "p99": round(pct(latencies, 99), 2) if latencies else None,
        },
        "total_seconds": round(t_total, 2),
        "throughput_msg_per_sec": round(sent / t_total, 1),
    }
    print(json.dumps(result, indent=2))
    client.disconnect()


if __name__ == "__main__":
    main()
