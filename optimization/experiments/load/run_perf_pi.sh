#!/usr/bin/env bash
#
# run_perf_pi.sh — Experimento C (R5/R6) de rendimiento contra la página
# desplegada en la Raspberry Pi. Corre los 6 tests, imprime tablas por
# consola y genera un informe Markdown.
#
# Tests:
#   1) REST backend puro (localhost:3000)          — sin carga y bajo carga
#   2) REST vía LAN y vía túnel Cloudflare
#   3) SPA (assets estáticos: index, bundle, plotly) vía LAN y túnel
#   4) Ingest MQTT end-to-end + muestreo de recursos (CPU/RAM)
#   5) WebSocket push (sensor_update end-to-end)
#   6) Ciclo MPC (mpc_cycle_e2e_ms + mpc_solver_total_s desde /performance)
#
# Requiere: servicios activos (pm2 backend+prediccion, nginx, redis), Docker
# (para el túnel Cloudflare opcional) y que corra desde el clone del repo.
#
# Uso:
#   ./run_perf_pi.sh
#   ./run_perf_pi.sh --skip-mqtt --skip-tunnel
#   ./run_perf_pi.sh --mqtt-duration 300 --rest-duration 20
#
set -uo pipefail

# --- Rutas (el script vive en optimization/experiments/load) ---------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT" || exit 1

LOAD_DIR="optimization/experiments/load"
MOD="optimization.experiments.load"
RESULTS_DIR="results/pasto_narino/experiments"

# Python del venv de predicción (tiene pandas/psutil); fallback al del sistema.
PY="$ROOT/.venv/bin/python"
[[ -x "$PY" ]] || PY="$(command -v python3)"

# --- Flags ------------------------------------------------------------------
REST_DURATION=30
CONCURRENT=50
MQTT_DURATION=600
MQTT_RATE=10
WS_CYCLES=200
SPA_SAMPLES=20
SKIP_MQTT=0
SKIP_TUNNEL=0
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rest-duration) REST_DURATION="$2"; shift 2 ;;
    --concurrent)    CONCURRENT="$2"; shift 2 ;;
    --mqtt-duration) MQTT_DURATION="$2"; shift 2 ;;
    --mqtt-rate)     MQTT_RATE="$2"; shift 2 ;;
    --ws-cycles)     WS_CYCLES="$2"; shift 2 ;;
    --spa-samples)   SPA_SAMPLES="$2"; shift 2 ;;
    --skip-mqtt)     SKIP_MQTT=1; shift ;;
    --skip-tunnel)   SKIP_TUNNEL=1; shift ;;
    --out)           OUT="$2"; shift 2 ;;
    -h|--help)       sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "flag desconocida: $1" >&2; exit 1 ;;
  esac
done

TS="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"
[[ -n "$OUT" ]] || OUT="$RESULTS_DIR/expC_pi_report_${TS}.md"

# --- Colores / helpers ------------------------------------------------------
log(){ printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok(){ printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[AVISO]\033[0m %s\n' "$*"; }

# Percentiles p50/p95/p99/max a partir de valores por stdin (uno por linea).
pct_node='let a=[];process.stdin.on("data",d=>{const v=parseFloat(d);if(!isNaN(v))a.push(v)});
process.stdin.on("end",()=>{a.sort((x,y)=>x-y);const p=x=>a.length?a[Math.min(a.length-1,Math.max(0,Math.floor(x*a.length)))]:null;
const r=v=>v==null?null:Math.round(v*1000)/1000;
console.log(JSON.stringify({n:a.length,p50:r(p(0.5)),p95:r(p(0.95)),p99:r(p(0.99)),max:r(a.length?a[a.length-1]:null)}))})'
pct_stats(){ node -e "$pct_node"; }

http_code(){ curl -so /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null; }

# --- Preflight --------------------------------------------------------------
log "Preflight"
HW_ARCH=$(uname -m)
HW_CPU=$(nproc)
HW_RAM=$(free -h | awk '/^Mem:/{print $2}')
NODE_V=$(node -v 2>/dev/null || echo "n/a")
PY_V=$("$PY" --version 2>&1 | awk '{print $2}')
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
NGINX_CODE=$(http_code http://127.0.0.1/)
pm2 status 2>/dev/null | grep -E 'sige-(backend|prediccion)' || warn "pm2 no muestra sige-backend/prediccion"

TUNNEL_URL=""
if [[ $SKIP_TUNNEL -eq 0 ]]; then
  TUNNEL_URL=$(./deploy_pi.sh url 2>/dev/null | tail -n1)
  [[ "$TUNNEL_URL" =~ ^https://.*trycloudflare\.com$ ]] || TUNNEL_URL=""
fi

echo "  arch=$HW_ARCH cores=$HW_CPU ram=$HW_RAM node=$NODE_V python=$PY_V"
echo "  nginx :80 -> $NGINX_CODE | LAN=$LAN_IP | tunel=${TUNNEL_URL:-NO}"

# --- Token ------------------------------------------------------------------
log "Mintendo token de prueba"
TOKEN=$(node "$LOAD_DIR/mint_token.js" 2>/dev/null | tail -n1)
if [[ -z "$TOKEN" || ${#TOKEN} -lt 20 ]]; then
  echo "ERROR: no se pudo mintear el token (¿Backend/.env con SECRET_JWT_SEED?)" >&2
  exit 1
fi
ok "token listo (${#TOKEN} chars)"

# --- Acumuladores (temporales; solo el .md y el CSV sobreviven) -------------
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
RES1="$TMPD/res1.tsv"; RES2="$TMPD/res2.tsv"; RES3="$TMPD/res3.tsv"
: > "$RES1"; : > "$RES2"; : > "$RES3"
SNAP_FINAL="$TMPD/snap.json"; : > "$SNAP_FINAL"
RES_SRC="$RESULTS_DIR/expC_pi_resources.csv"
WS_OUT="$TMPD/ws.json"

perf_reset(){ curl -s -H "x-token: $TOKEN" "http://127.0.0.1:3000/api/front/performance?reset=1" >/dev/null; }
perf_snap(){ curl -s -H "x-token: $TOKEN" "http://127.0.0.1:3000/api/front/performance"; }
# load_rest/load_ws imprimen una cabecera ANTES del JSON: extraer solo {..}
compact(){ sed -n '/^{/,$p' | tr -d '\n '; }

# --- Test 1: REST backend puro (localhost) ----------------------------------
log "Test 1/6: REST backend puro (localhost:3000) — $CONCURRENT conc x ${REST_DURATION}s x2"
perf_reset
R1=$(node "$LOAD_DIR/load_rest.js" "$TOKEN" --url http://127.0.0.1:3000 --concurrent "$CONCURRENT" --duration "$REST_DURATION" | compact)
R2=$(node "$LOAD_DIR/load_rest.js" "$TOKEN" --url http://127.0.0.1:3000 --concurrent "$CONCURRENT" --duration "$REST_DURATION" | compact)
printf 'sin_carga\t%s\n' "$R1" >> "$RES1"
printf 'bajo_carga\t%s\n' "$R2" >> "$RES1"
echo "  sin carga : $R1"
echo "  bajo carga: $R2"
perf_snap > "$SNAP_FINAL"

# --- Test 2: REST vía LAN (nginx) y vía túnel -------------------------------
log "Test 2/6: REST vía LAN (nginx :80)"
RLAN=$(node "$LOAD_DIR/load_rest.js" "$TOKEN" --url http://127.0.0.1 --concurrent "$CONCURRENT" --duration "$REST_DURATION" | compact)
printf 'lan\t%s\n' "$RLAN" >> "$RES2"
echo "  LAN: $RLAN"
if [[ -n "$TUNNEL_URL" && $SKIP_TUNNEL -eq 0 ]]; then
  log "Test 2/6: REST vía túnel ($TUNNEL_URL)"
  RTUN=$(node "$LOAD_DIR/load_rest.js" "$TOKEN" --url "$TUNNEL_URL" --concurrent "$CONCURRENT" --duration "$REST_DURATION" | compact)
  printf 'tunel\t%s\n' "$RTUN" >> "$RES2"
  echo "  tunel: $RTUN"
else
  warn "sin túnel: se omite la medición de red para el túnel"
fi

# --- Test 3: SPA assets (página) --------------------------------------------
log "Test 3/6: SPA assets estáticos (LAN + túnel), $SPA_SAMPLES muestras"
measure_asset(){ for _ in $(seq 1 "$SPA_SAMPLES"); do curl -so /dev/null -w '%{time_total}\n' --max-time 20 "$1" 2>/dev/null; done | pct_stats; }
IDX=$(curl -s http://127.0.0.1/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
SPA_ASSETS=("/" "/plotly.min.js")
[[ -n "$IDX" ]] && SPA_ASSETS+=("/$IDX")
for a in "${SPA_ASSETS[@]}"; do
  L=$(measure_asset "http://127.0.0.1$a")
  printf 'lan\t%s\t%s\n' "$a" "$L" >> "$RES3"
  if [[ -n "$TUNNEL_URL" && $SKIP_TUNNEL -eq 0 ]]; then
    T=$(measure_asset "$TUNNEL_URL$a")
    printf 'tunel\t%s\t%s\n' "$a" "$T" >> "$RES3"
  fi
done

# --- Test 4/5: MQTT + recursos + WS (paralelo) ------------------------------
if [[ $SKIP_MQTT -eq 0 ]]; then
  log "Test 4/6 + 5/6: MQTT (${MQTT_RATE} msg/s, ${MQTT_DURATION}s) + recursos + WS push"
  perf_reset
  "$PY" -m "$MOD".sample_resources --duration "$MQTT_DURATION" --interval 5 --out "$RES_SRC" > "$TMPD/resources.log" 2>&1 &
  RES_PID=$!
  timeout "$((MQTT_DURATION + 120))" node "$LOAD_DIR/load_ws.js" "$TOKEN" --url http://127.0.0.1 --cycles "$WS_CYCLES" > "$WS_OUT" 2> "$WS_OUT.err" &
  WS_PID=$!
  "$PY" -m "$MOD".load_mqtt --rate "$MQTT_RATE" --duration "$MQTT_DURATION" 2>&1 | tail -n3
  wait "$RES_PID" 2>/dev/null
  wait "$WS_PID" 2>/dev/null
  ok "carga MQTT + muestreo + WS finalizados"
  perf_snap > "$SNAP_FINAL"
else
  warn "MQTT omitido (--skip-mqtt): se captura snapshot actual"
  perf_snap > "$SNAP_FINAL"
fi

# --- Test 6: MPC (métricas acumuladas) --------------------------------------
log "Test 6/6: ciclo MPC (desde /performance)"
python3 - "$SNAP_FINAL" <<'PY'
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    for m in d.get("metrics",[]):
        if m["name"].startswith("mpc_"):
            print(f"  {m['name']}: n={m['n']} p50={m['p50_ms']} p95={m['p95_ms']} max={m['max_ms']}")
except Exception as e:
    print("  (sin snapshot MPC):", e)
PY

# ============================================================================ #
#                                INFORME .md
# ============================================================================ #
log "Generando informe: $OUT"

RES_SUM=""
if [[ -f "$RES_SRC" ]]; then
  RES_SUM=$(awk -F, 'NR>1 && $2!="" {cpu[$2]+=$4; n[$2]++; if($4>cmax[$2])cmax[$2]=$4; rss[$2]+=$5; if($5>rmax[$2])rmax[$2]=$5}
    END{for(s in n) printf "| %s | %.1f%% | %.1f%% | %.1f MB | %.1f MB |\n", s, cpu[s]/n[s], cmax[s], rss[s]/n[s], rmax[s]}' "$RES_SRC" | sort)
fi

SNAP_METRICS=$(python3 - "$SNAP_FINAL" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: print("| (sin snapshot) | - | - | - | - |"); raise SystemExit
order=["mqtt_latency_end_to_end_ms","mongodb_insert_ms","ws_push_emit_ms",
       "ws_push_end_to_end_ms","mpc_cycle_e2e_ms","mpc_solver_total_s"]
names={m["name"]:m for m in d.get("metrics",[])}
for k in order:
    if k in names:
        m=names[k]
        print(f"| {k} | {m['n']} | {m['p50_ms']} | {m['p95_ms']} | {m['p99_ms']} | {m['max_ms']} |")
PY
)
SNAP_SUM=$(python3 - "$SNAP_FINAL" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: print("(sin snapshot)"); raise SystemExit
mm=d.get("memory_mb",{})
print(f"uptime_s={d.get('uptime_s')} node={d.get('node')} rss={mm.get('rss')}MB heap={mm.get('heap')}MB")
PY
)
WS_SUM=$(python3 - "$WS_OUT" <<'PY'
import json,sys
try:
    t=open(sys.argv[1]).read()
    i=t.find('{'); j=t.rfind('}')
    d=json.loads(t[i:j+1])
    p=d.get("push_latency_ms",{})
    print(f"| sensor_update E2E | {d.get('samples')} | {p.get('mean')} | {p.get('p50')} | {p.get('p95')} | {p.get('max')} |")
except Exception:
    print("| sensor_update E2E | (sin datos) | - | - | - | - |")
PY
)

# Tablas 1 y 2 (req/s + latencias) desde los JSON compactos
T1=$(python3 - "$RES1" <<'PY'
import sys,json
fmt=lambda v: "-" if v is None else v
for line in open(sys.argv[1]):
    line=line.rstrip("\n")
    if not line.strip(): continue
    label,j=line.split("\t",1)
    try:
        d=json.loads(j); l=d.get("latency_ms",{})
        print(f"| {label} | {fmt(d.get('req_s'))} | {fmt(l.get('p50'))} | {fmt(l.get('p95'))} | {fmt(l.get('p99'))} | {fmt(l.get('max'))} | {fmt(d.get('errors'))} |")
    except Exception:
        print(f"| {label} | - | - | - | - | - | - |")
PY
)
T2=$(python3 - "$RES2" <<'PY'
import sys,json
fmt=lambda v: "-" if v is None else v
for line in open(sys.argv[1]):
    line=line.rstrip("\n")
    if not line.strip(): continue
    label,j=line.split("\t",1)
    try:
        d=json.loads(j); l=d.get("latency_ms",{})
        print(f"| {label} | {fmt(d.get('req_s'))} | {fmt(l.get('p50'))} | {fmt(l.get('p95'))} | {fmt(l.get('p99'))} | {fmt(l.get('max'))} | {fmt(d.get('errors'))} |")
    except Exception:
        print(f"| {label} | - | - | - | - | - | - |")
PY
)
T3=$(python3 - "$RES3" <<'PY'
import sys,json
for line in open(sys.argv[1]):
    line=line.rstrip("\n")
    if not line.strip(): continue
    o,a,j=line.split("\t",2)
    try:
        d=json.loads(j)
        print(f"| {o} | `{a}` | {d['n']} | {d['p50']} | {d['p95']} | {d['p99']} | {d['max']} |")
    except Exception:
        print(f"| {o} | `{a}` | - | - | - | - | - |")
PY
)

cat > "$OUT" <<MD
# Experimento C en la Pi — Rendimiento de la página desplegada (R5/R6)

**Generado**: $(date '+%Y-%m-%d %H:%M:%S') · **Serie**: ${TS}

## Condiciones

| Item | Valor |
|---|---|
| Arquitectura | \`$HW_ARCH\` |
| Núcleos | $HW_CPU |
| RAM | $HW_RAM |
| Node | \`$NODE_V\` |
| Python | \`$PY_V\` |
| nginx :80 | $NGINX_CODE |
| Túnel | ${TUNNEL_URL:-no} |
| REST conc. | $CONCURRENT |
| REST duración | ${REST_DURATION}s |
| MQTT | ${MQTT_RATE} msg/s x ${MQTT_DURATION}s |

## Test 1 — REST backend puro (localhost:3000)

| Escenario | req/s | p50 | p95 | p99 | max | errores |
|---|---|---|---|---|---|---|
$T1

## Test 2 — REST vía LAN y túnel

| Origen | req/s | p50 | p95 | p99 | max | errores |
|---|---|---|---|---|---|---|
$T2

## Test 3 — SPA assets estáticos (latencia, s)

| Origen | Asset | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
$T3

## Test 4/6 — MQTT end-to-end + recursos

| Métrica | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
$SNAP_METRICS

### Recursos durante la carga (CPU/RAM)

| Servicio | CPU media | CPU máx | RAM media | RAM máx |
|---|---|---|---|---|
${RES_SUM:-| (sin datos de recursos) | - | - | - | - |}

Snapshot backend: \`$SNAP_SUM\`

## Test 5/6 — WebSocket push end-to-end

| Evento | n | mean | p50 | p95 | max |
|---|---|---|---|---|---|
$WS_SUM

## Test 6/6 — Ciclo MPC

Las métricas \`mpc_cycle_e2e_ms\` y \`mpc_solver_total_s\` (si aparecen arriba en el snapshot) provienen de ciclos reales ejecutados por el backend (automático cada 15 min o disparo manual). Para forzar uno: dispara una optimización desde el Dashboard y reconsulta \`/api/front/performance\`.

---

*Nota: la vía LAN/localhost mide el rendimiento del servidor; la vía túnel incluye Cloudflare + internet de la Pi y no debe mezclarse con la primera.*
MD

ok "Informe escrito: $OUT"
echo
echo "=========================== RESUMEN (consola) ==========================="
cat "$OUT"
echo "========================================================================"
