#!/usr/bin/env bash
#
# deploy_pi.sh — Despliegue de SIGE en Raspberry Pi (por etapas)
# ------------------------------------------------------------
# Guía: DESPLIEGUE_RASPBERRY.md
# Ejecuta ESTE script dentro de la Pi (p.ej. terminal de Raspberry Pi Connect).
#
# Uso:
#   chmod +x deploy_pi.sh
#   ./deploy_pi.sh all          # ejecuta todas las etapas en orden
#   ./deploy_pi.sh 1 3 5        # solo etapas 1, 3 y 5
#   ./deploy_pi.sh preflight    # solo comprueba prerrequisitos
#
# Etapas:
#   0 preflight  -> comprueba node/yarn/python3/pip/pm2/ngrok/redis
#   1 clone      -> clona el repo en ~/sistema_inteligente_microrredes
#   2 backend    -> crea Backend/.env + ecosystem.config.js + yarn install
#   3 redis      -> levanta Redis (nativo por defecto; docker opcional)
#   4 prediction -> venv + torch CPU + requirements + app pm2
#   5 frontend   -> .env.production + yarn build
#   6 pm2        -> lanza backend / prediccion / frontend con pm2 + save
#   7 ngrok      -> túnel ngrok (backend + frontend) para acceso remoto
#   8 rebuild_remote -> reconstruye el frontend apuntando a ngrok-backend (acceso remoto completo)
#   9 verify     -> chequeo end-to-end con curl
#
# ANTES de ejecutar: rellena el bloque CONFIG de abajo.
# El script se niega a correr si quedan placeholders sin cambiar.
#
set -uo pipefail

# ============================================================
# >>>>>  CONFIG — RELLENA ESTO ANTES DE EJECUTAR  <<<<<
# ============================================================
REPO_URL="https://github.com/REQUIEM-FORCODE45/sistemas_inteligente_microrredes.git"
CLONE_DIR="$HOME/sistema_inteligente_microrredes"

# --- Secretos / entorno backend (Backend/.env) ---
MONGO_URL="mongodb+srv://<user>:***@clusterinteligente.qnejnxi.mongodb.net/"   # <- CAMBIA
MONGO_DB_NAME="sistema_inteligente_db"
SECRET_JWT_SEED="CAMBIA_ESTO_por_un_string_largo_y_aleatorio"   # <- CAMBIA (p.ej. openssl rand -hex 32)
PORT="3000"
REDIS_URL="redis://localhost:6379"
CORS_ORIGINS="http://localhost:8080"            # añade http://<IP_PI>:8080,https://<ngrok>.ngrok-free.app
PREDICTION_API_URL="http://localhost:8000"
MPC_INTERVAL_MINUTES="15"
FORECASTER="patchtst"                            # openmeteo | patchtst | timesfm
SITE_TZ="America/Bogota"
GROQ_API_KEY=""                                 # opcional
OPENAI_API_KEY=""                               # opcional
LLM_PROVIDER="openai"
MQTT_BROKER="34.69.148.115"                      # broker MQTT externo de la guía

# --- Frontend (Frontend/GestionFront/.env.production) ---
# Usa IP LAN de la Pi para no reconstruir cada vez que cambia ngrok:
VITE_API_URL="http://<IP_PI>:3000/api"           # <- pon la IP real de la Pi
VITE_SOCKET_URL="http://<IP_PI>:3000"             # <- pon la IP real de la Pi

# --- Opciones de despliegue ---
USE_DOCKER_REDIS="no"        # yes | no  (no = redis nativo con apt, recomendado en Pi)
ENABLE_NGROK="yes"           # yes | no  (activado: túnel remoto para ver la paginita fuera de la Udenar)
NGROK_TARGET_PORT="3000"     # puerto del backend que expone ngrok (3000)
NGROK_FRONTEND_PORT="8080"   # puerto del frontend que tambien se expone (la paginita)

# --- Swap para Pi 2GB (solo si necesitas PatchTST en modelo pequeño) ---
SETUP_SWAP_2GB="no"          # yes | no  (no si ya tienes 4GB+)

# ============================================================
# Fin CONFIG
# ============================================================

log(){ printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok(){ printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[AVISO]\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31m[ERROR]\033[0m %s\n' "$*"; exit 1; }

# Detectar sudo disponible
SUDO=""
if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

# Comprobar placeholders sin cambiar
check_config(){
  local bad=0
  if [[ "$MONGO_URL" == *"<user>"* ]]; then warn "MONGO_URL sigue con placeholder <user>"; bad=1; fi
  if [[ "$SECRET_JWT_SEED" == CAMBIA* ]]; then warn "SECRET_JWT_SEED no fue cambiado"; bad=1; fi
  if [[ "$VITE_API_URL" == *"<IP_PI>"* ]]; then warn "VITE_API_URL sigue con <IP_PI>"; bad=1; fi
  if [[ "$VITE_SOCKET_URL" == *"<IP_PI>"* ]]; then warn "VITE_SOCKET_URL sigue con <IP_PI>"; bad=1; fi
  if [[ "$CORS_ORIGINS" == *"<IP_PI>"* || "$CORS_ORIGINS" == *"<ngrok>"* ]]; then warn "CORS_ORIGINS tiene placeholders"; bad=1; fi
  if [[ $bad -eq 1 ]]; then
    die "Corrige el bloque CONFIG arriba antes de ejecutar. (Los placeholders <...> deben reemplazarse.)"
  fi
}

stage_preflight(){
  log "Etapa 0: prerrequisitos"
  for c in node yarn python3 pip3 pm2 redis-cli; do
    if command -v "$c" >/dev/null 2>&1; then ok "$c -> $(command -v $c)"; else warn "$c NO encontrado"; fi
  done
  if command -v ngrok >/dev/null 2>&1; then ok "ngrok -> $(ngrok version 2>/dev/null)"; else warn "ngrok NO encontrado (opcional si ENABLE_NGROK=no)"; fi
  echo "node: $(node -v 2>/dev/null) | yarn: $(yarn -v 2>/dev/null) | python3: $(python3 --version 2>&1)"
}

stage_clone(){
  log "Etapa 1: clonar repo"
  if [[ -d "$CLONE_DIR/.git" ]]; then
    warn "$CLONE_DIR ya existe. Haciendo git pull en la rama actual..."
    ( cd "$CLONE_DIR" && git pull --ff-only )
  else
    git clone "$REPO_URL" "$CLONE_DIR" || die "fallo al clonar"
  fi
  ( cd "$CLONE_DIR" && git branch --show-current )
}

stage_backend(){
  log "Etapa 2: backend (.env + ecosystem + install)"
  cd "$CLONE_DIR/Backend" || die "no existe $CLONE_DIR/Backend"
  cat > .env <<EOF
MONGO_URL=$MONGO_URL
MONGO_DB_NAME=$MONGO_DB_NAME
PORT=$PORT
SECRET_JWT_SEED=$SECRET_JWT_SEED
REDIS_URL=$REDIS_URL
CORS_ORIGINS=$CORS_ORIGINS
PREDICTION_API_URL=$PREDICTION_API_URL
MPC_INTERVAL_MINUTES=$MPC_INTERVAL_MINUTES
FORECASTER=$FORECASTER
SITE_TZ=$SITE_TZ
GROQ_API_KEY=$GROQ_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
LLM_PROVIDER=$LLM_PROVIDER
EOF
  ok "Backend/.env creado"
  cat > ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: "sige-backend",
    script: "app.js",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    watch: false,
    env: { NODE_ENV: "production", PORT: 3000 }
  }]
};
EOF
  ok "Backend/ecosystem.config.js creado"
  yarn install --frozen-lockfile || yarn install || die "fallo yarn install backend"
  ok "backend instalado"
}

stage_redis(){
  log "Etapa 3: Redis"
  if [[ "$USE_DOCKER_REDIS" == "yes" ]]; then
    warn "Redis vía Docker (requiere docker instalado)"
    ( cd "$CLONE_DIR" && docker compose up -d redis ) || die "fallo docker compose"
  else
    if ! command -v redis-server >/dev/null 2>&1; then
      log "Instalando redis-server (nativo)"
      $SUDO apt update && $SUDO apt install -y redis-server || die "no se pudo instalar redis"
    fi
    $SUDO systemctl enable --now redis-server 2>/dev/null || $SUDO service redis-server start 2>/dev/null || redis-server --daemonize yes
  fi
  sleep 1
  redis-cli ping && ok "Redis responde PONG" || warn "Redis no responde PONG (revisa servicio)"
  # swap para Pi 2GB
  if [[ "$SETUP_SWAP_2GB" == "yes" ]]; then
    log "Configurando swap 2GB (Pi 2GB + PatchTST)"
    $SUDO dphys-swapfile swapoff 2>/dev/null
    $SUDO sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
    $SUDO dphys-swapfile setup && $SUDO dphys-swapfile swapon || warn "no se pudo ajustar swap"
  fi
}

stage_prediction(){
  log "Etapa 4: API Python de predicción + solver"
  cd "$CLONE_DIR" || die "no existe $CLONE_DIR"
  if [[ ! -d .venv ]]; then
    python3 -m venv .venv || die "no se pudo crear venv"
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install --upgrade pip wheel setuptools
  # torch CPU para ARM (OBLIGATORIO aparte)
  pip install torch --index-url https://download.pytorch.org/whl/cpu || die "fallo torch CPU"
  pip install -r optimization/requirements.txt || die "fallo requirements"
  ok "entorno python listo"
  # Lanzar con pm2 (cwd importante)
  pm2 start "python3 -m uvicorn prediction.main:app --host 0.0.0.0 --port 8000 --workers 1" \
    --name sige-prediccion --cwd ./optimization --interpreter ./.venv/bin/python \
    --update-env || warn "pm2 prediccion no arrancó (revisa más abajo)"
  pm2 save
  sleep 3
  curl -s http://localhost:8000/predict/health || warn "health predict no responde aún"
}

stage_frontend(){
  log "Etapa 5: frontend (build)"
  cd "$CLONE_DIR/Frontend/GestionFront" || die "no existe Frontend/GestionFront"
  cat > .env.production <<EOF
VITE_API_URL=$VITE_API_URL
VITE_SOCKET_URL=$VITE_SOCKET_URL
EOF
  ok "Frontend/.env.production creado"
  yarn install --frozen-lockfile || yarn install || die "fallo yarn install frontend"
  yarn build || die "fallo yarn build"
  ok "frontend compilado en dist/"
}

stage_pm2(){
  log "Etapa 6: lanzar servicios con pm2"
  cd "$CLONE_DIR" || die "no existe $CLONE_DIR"
  # Backend
  pm2 start Backend/ecosystem.config.js --update-env
  # Frontend (servir SPA)
  pm2 serve Frontend/GestionFront/dist 8080 --name gestion-front --spa
  pm2 save
  log "Estado pm2:"
  pm2 status
  log "Para que arranque solo al encender la Pi, ejecuta UNA vez:"
  echo "  $SUDO env PATH=\"\$PATH:/$(command -v node | sed 's#/node##')\" pm2 startup systemd -u $USER --hp $HOME"
  echo "  pm2 save"
}

stage_ngrok(){
  if [[ "$ENABLE_NGROK" != "yes" ]]; then
    warn "Etapa 7 (ngrok) omitida (ENABLE_NGROK=no). Actívala si quieres túnel remoto."
    return
  fi
  log "Etapa 7: ngrok túneles -> backend ($NGROK_TARGET_PORT) + frontend ($NGROK_FRONTEND_PORT)"
  command -v ngrok >/dev/null 2>&1 || die "ngrok no instalado"
  # Túnel del backend (API + Socket.IO)
  pm2 start "ngrok http $NGROK_TARGET_PORT --log stdout" --name "ngrok-backend"
  # Túnel del frontend (la paginita, accesible desde fuera)
  pm2 start "ngrok http $NGROK_FRONTEND_PORT --log stdout" --name "ngrok-frontend"
  pm2 save
  sleep 4
  log "URLs públicas (cambian en cada reinicio de la Pi):"
  curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; [print('  ',t['name'],'->',t['public_url']) for t in json.load(sys.stdin).get('tunnels',[])]" \
    2>/dev/null || warn "no se pudo leer URL ngrok"
  warn "Como el frontend apunta a la IP LAN, para acceso remoto real debes reconstruirlo con VITE_API_URL/SOCKET_URL = la URL de ngrok-backend (ver Etapa 7.1 de la guía)."
}

stage_rebuild_remote(){
  log "Etapa 8: reconstruir frontend apuntando a ngrok-backend (acceso remoto completo)"
  if [[ "$ENABLE_NGROK" != "yes" ]]; then
    warn "ENABLE_NGROK=no: no hay túnel. Omito rebuild remoto."
    return
  fi
  # Obtener la URL pública del túnel del backend
  local NG=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; ts=json.load(sys.stdin).get('tunnels',[]); print(next((t['public_url'] for t in ts if t.get('name')=='ngrok-backend'),''))" 2>/dev/null)
  if [[ -z "$NG" ]]; then
    die "No se encontró el túnel ngrok-backend. Ejecuta la etapa 7 (ngrok) primero y espera a que esté listo."
  fi
  ok "ngrok-backend URL = $NG"
  # Reescribir .env.production con la URL remota
  cd "$CLONE_DIR/Frontend/GestionFront" || die "no existe Frontend/GestionFront"
  cat > .env.production <<EOF
VITE_API_URL=$NG/api
VITE_SOCKET_URL=$NG
EOF
  ok "Frontend/.env.production actualizado para acceso remoto"
  yarn install --frozen-lockfile >/dev/null 2>&1 || true
  yarn build || die "fallo yarn build (rebuild remoto)"
  ok "frontend reconstruido"
  pm2 restart gestion-front --update-env 2>/dev/null || pm2 serve Frontend/GestionFront/dist 8080 --name gestion-front --spa
  pm2 save
  log "Ahora abre en tu navegador (fuera de la Udenar):"
  echo "  $NG  <- esta es la API; la paginita queda en su túnel ngrok-frontend (mira 'pm2 logs ngrok-frontend')"
}

stage_verify(){
  log "Etapa 9: verificación end-to-end"
  pm2 status
  redis-cli ping
  echo "--- backend health (requiere JWT en x-token) ---"
  curl -s -o /dev/null -w "backend HTTP %{http_code}\n" http://localhost:3000/api/front/sensors
  echo "--- prediccion health ---"
  curl -s http://localhost:8000/predict/health || warn "predict no responde"
  echo "--- frontend ---"
  curl -s -o /dev/null -w "frontend HTTP %{http_code}\n" http://localhost:8080
  echo "--- ngrok tunnels ---"
  curl -s http://localhost:4040/api/tunnels 2>/dev/null | head -c 300 || true
}

# ============================================================
# Dispatcher
# ============================================================
main(){
  check_config
  local stages=("$@")
  if [[ ${#stages[@]} -eq 0 || "${stages[0]}" == "all" ]]; then
    stages=(preflight clone backend redis prediction frontend pm2 ngrok rebuild_remote verify)
  fi
  for s in "${stages[@]}"; do
    case "$s" in
      0|preflight)  stage_preflight ;;
      1|clone)      stage_clone ;;
      2|backend)    stage_backend ;;
      3|redis)      stage_redis ;;
      4|prediction) stage_prediction ;;
      5|frontend)   stage_frontend ;;
      6|pm2)        stage_pm2 ;;
      7|ngrok)      stage_ngrok ;;
      8|rebuild_remote) stage_rebuild_remote ;;
      9|verify)     stage_verify ;;
      *) warn "etapa desconocida: $s (usa 0..8 o nombres)" ;;
    esac
  done
  ok "Script completado."
}

main "$@"
