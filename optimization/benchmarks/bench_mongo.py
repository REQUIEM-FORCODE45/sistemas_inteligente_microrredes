#!/usr/bin/env python3
"""
Benchmark de MongoDB (Punto 11 del revisor): latencia de inserción y throughput
de escritura bajo carga.

Requisitos:
  - pymongo instalado.
  - MongoDB accesible en MONGO_URL (o --mongo-url).
  - Una colección de prueba se crea y se limpia al final.

Uso:
  python optimization/benchmarks/bench_mongo.py --docs 10000 --batch 500
"""
import argparse
import os
import statistics
import sys
import time

try:
    from pymongo import MongoClient
except ImportError:
    print("ERROR: pymongo no instalado (pip install pymongo)")
    sys.exit(1)


def pct(vals, p):
    s = sorted(vals)
    k = max(0, min(len(s) - 1, int(round((p / 100.0) * (len(s) - 1)))))
    return s[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mongo-url", default=os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    ap.add_argument("--docs", type=int, default=10000)
    ap.add_argument("--batch", type=int, default=500)
    ap.add_argument("--coll", default="bench_microgrid")
    args = ap.parse_args()

    client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=5000)
    db = client["sigebench"]
    coll = db[args.coll]
    coll.delete_many({})

    latencies = []
    docs = [{"v": float(i % 400), "ts": i} for i in range(args.docs)]

    t_start = time.time()
    for i in range(0, args.docs, args.batch):
        batch = docs[i:i + args.batch]
        t0 = time.time()
        coll.insert_many(batch)
        latencies.append((time.time() - t0) * 1000.0)
    t_total = time.time() - t_start

    import json
    result = {
        "docs_inserted": args.docs,
        "insert_latency_ms": {
            "p50": round(pct(latencies, 50), 3),
            "p95": round(pct(latencies, 95), 3),
            "p99": round(pct(latencies, 99), 3),
        },
        "total_seconds": round(t_total, 2),
        "throughput_docs_per_sec": round(args.docs / t_total, 1),
    }
    print("MongoDB benchmark:", json.dumps(result, indent=2))
    coll.delete_many({})
    client.close()


if __name__ == "__main__":
    main()
