#!/usr/bin/env bash
# ============================================================================
# dev.sh — Lanzador de DESARROLLO de SIGE
# Arranca los 3 servicios de desarrollo con un solo comando:
#   1) Backend Node   (nodemon app.js)      -> puerto 3000
#   2) API Python     (uvicorn)             -> puerto 8000
#   3) Frontend       (yarn dev / Vite HMR) -> puerto 5173
#
# Uso:
#   ./dev.sh             arranca todo (alias de 'up')
#   ./dev.sh up          arranca todo
#   ./dev.sh down        detiene todo
#   ./dev.sh status      estado de cada servicio
#   ./dev.sh logs [svc]  tail de logs: backend | prediccion | frontend | all
#
# Los logs y PIDs viven en .dev-logs/ (ignorado por git).
# Redis/Mongo no se tocan: Redis ya corre local; Mongo es Atlas (Backend/.env).
# ============================================================================
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$ROOT/.dev-logs"

BACKEND_PID="$LOGDIR/backend.pid"
PRED_PID="$LOGDIR/prediccion.pid"
FRONT_PID="$LOGDIR/frontend.pid"

PYTHON="${PYTHON:-/usr/bin/python3}"

mkdir -p "$LOGDIR"

# --- helpers ----------------------------------------------------------------
is_running() { # $1 = pidfile
    [ -f "$1" ] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null
}

# pid del proceso que escucha en un puerto (o vacio si libre)
port_pid() { # $1 = puerto
    ss -ltnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | head -1
}

save_pid() { # $1 = pidfile, $2 = pid
    echo "$2" > "$1"
}

start_backend() {
    if is_running "$BACKEND_PID"; then
        echo "  [backend] ya corriendo (pid $(cat "$BACKEND_PID"))"
        return
    fi
    local existing
    existing="$(port_pid 3000)"
    if [ -n "$existing" ]; then
        echo "  [backend] puerto 3000 en uso por pid $existing; se asume el servicio existente"
        echo "$existing" > "$BACKEND_PID"
        return
    fi
    echo "  [backend] arrancando nodemon app.js ..."
    (cd "$ROOT/Backend" && setsid nohup nodemon app.js > "$LOGDIR/backend.log" 2>&1 & echo $! > "$BACKEND_PID")
    sleep 1
    echo "    pid $(cat "$BACKEND_PID") | log: .dev-logs/backend.log"
}

start_prediccion() {
    if is_running "$PRED_PID"; then
        echo "  [prediccion] ya corriendo (pid $(cat "$PRED_PID"))"
        return
    fi
    local existing
    existing="$(port_pid 8000)"
    if [ -n "$existing" ]; then
        echo "  [prediccion] puerto 8000 en uso por pid $existing; se asume el servicio existente"
        echo "$existing" > "$PRED_PID"
        return
    fi
    echo "  [prediccion] arrancando uvicorn (con env de Backend/.env) ..."
    (cd "$ROOT/optimization" && set -a && source ../Backend/.env 2>/dev/null && set +a \
        && setsid nohup "$PYTHON" -m uvicorn prediction.main:app --port 8000 \
             > "$LOGDIR/prediccion.log" 2>&1 & echo $! > "$PRED_PID")
    sleep 2
    echo "    pid $(cat "$PRED_PID") | log: .dev-logs/prediccion.log"
}

start_frontend() {
    if is_running "$FRONT_PID"; then
        echo "  [frontend] ya corriendo (pid $(cat "$FRONT_PID"))"
        return
    fi
    local existing
    existing="$(port_pid 5173)"
    if [ -n "$existing" ]; then
        echo "  [frontend] puerto 5173 en uso por pid $existing; se asume el servicio existente"
        echo "$existing" > "$FRONT_PID"
        return
    fi
    echo "  [frontend] arrancando yarn dev ..."
    (cd "$ROOT/Frontend/GestionFront" && setsid nohup yarn dev > "$LOGDIR/frontend.log" 2>&1 & echo $! > "$FRONT_PID")
    sleep 1
    echo "    pid $(cat "$FRONT_PID") | log: .dev-logs/frontend.log"
}

stop_service() { # $1 = nombre, $2 = pidfile, $3 = puerto
    # 1) mata el pid del pidfile (ej. wrapper/nodemon)
    if is_running "$2"; then
        local pid
        pid="$(cat "$2")"
        echo "  [$1] deteniendo pid $pid ..."
        kill "$pid" 2>/dev/null
        sleep 2
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null
        fi
    fi
    rm -f "$2"
    # 2) mata el listener REAL del puerto (por si el proceso difiere del pidfile)
    local lpid
    lpid="$(port_pid "$3")"
    if [ -n "$lpid" ]; then
        echo "  [$1] deteniendo listener $lpid (puerto $3) ..."
        kill "$lpid" 2>/dev/null
        sleep 2
        if kill -0 "$lpid" 2>/dev/null; then
            kill -9 "$lpid" 2>/dev/null
        fi
        [ -z "$(port_pid "$3")" ] && echo "  [$1] puerto $3 liberado"
    else
        [ ! -f "$2" ] && echo "  [$1] no estaba corriendo"
    fi
}

wait_health() { # $1 = url, $2 = nombre, $3 = timeout segundos
    local i=0
    until curl -s -o /dev/null --max-time 2 "$1"; do
        i=$((i + 1))
        if [ "$i" -ge "$3" ]; then
            echo "  [!] $2 no respondio en $3s (revisa .dev-logs/)"
            return 1
        fi
        sleep 1
    done
    echo "  [ok] $2 responde en $1"
}

status_service() { # $1 = nombre, $2 = pidfile, $3 = puerto
    local lpid
    lpid="$(port_pid "$3")"
    if [ -n "$lpid" ]; then
        echo "  $1  -> CORRIENDO (pid $lpid, puerto $3)"
    else
        echo "  $1  -> detenido"
    fi
}

# --- comandos ---------------------------------------------------------------
cmd_up() {
    echo "=== Arrancando servicios de desarrollo (SIGE) ==="
    start_prediccion
    start_backend
    start_frontend
    echo "=== Esperando health checks ==="
    wait_health "http://localhost:8000/predict/health" "prediccion" 30 || true
    wait_health "http://localhost:3000/api/front/sensors" "backend" 20 || true
    wait_health "http://localhost:5173" "frontend" 20 || true
    echo
    echo "Todo listo:"
    echo "  Frontend  -> http://localhost:5173"
    echo "  Backend   -> http://localhost:3000"
    echo "  Prediccion-> http://localhost:8000  (docs: /docs)"
    echo
    echo "Logs: ./dev.sh logs [backend|prediccion|frontend|all]"
}

cmd_down() {
    echo "=== Deteniendo servicios de desarrollo ==="
    stop_service "backend" "$BACKEND_PID" 3000
    stop_service "prediccion" "$PRED_PID" 8000
    stop_service "frontend" "$FRONT_PID" 5173
    echo "Listo."
}

cmd_status() {
    echo "=== Estado de servicios de desarrollo ==="
    status_service "backend    " "$BACKEND_PID" 3000
    status_service "prediccion " "$PRED_PID" 8000
    status_service "frontend   " "$FRONT_PID" 5173
}

cmd_logs() {
    local svc="${1:-all}"
    case "$svc" in
        backend)    tail -f "$LOGDIR/backend.log" ;;
        prediccion) tail -f "$LOGDIR/prediccion.log" ;;
        frontend)   tail -f "$LOGDIR/frontend.log" ;;
        all)        tail -f "$LOGDIR/backend.log" "$LOGDIR/prediccion.log" "$LOGDIR/frontend.log" ;;
        *) echo "Servicio invalido: $svc (backend|prediccion|frontend|all)"; exit 1 ;;
    esac
}

# --- dispatch ---------------------------------------------------------------
case "${1:-up}" in
    up)      cmd_up ;;
    down)    cmd_down ;;
    status)  cmd_status ;;
    logs)    cmd_logs "${2:-all}" ;;
    *) echo "Uso: ./dev.sh [up|down|status|logs [svc]]"; exit 1 ;;
esac
