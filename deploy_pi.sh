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
#   0 preflight  -> comprueba node/yarn/python3/pip/pm2/redis/docker
#   1 clone      -> clona el repo en ~/sistema_inteligente_microrredes
#   2 backend    -> crea Backend/.env + ecosystem.config.js + yarn install
#   3 redis      -> levanta Redis (nativo por defecto; docker opcional)
#   4 prediction -> venv + torch CPU + requirements + app pm2
#   5 frontend   -> .env.production (rutas relativas) + yarn build
#   6 nginx      -> reverse proxy en :80 (y :8080): SPA + /api + /socket.io en UN solo origen
#   7 pm2        -> lanza backend / prediccion con pm2 + save (el frontend lo sirve nginx)
#   8 ngrok      -> túnel ngrok en DOCKER (compose propio que GENERA el script) -> nginx :80 + API :3000
#   9 remote     -> añade los origenes ngrok a CORS_ORIGINS (sin rebuild: URLs relativas)
#   10 verify    -> chequeo end-to-end con curl
#
# Acceso al frontend:
#   LAN    -> http://<IP_PI>/  (y http://<IP_PI>:8080, mismo nginx)
#   Remoto -> URL del tunel ngrok sige-frontend (puerto 80, via Docker)
#   SPA + API + Socket.IO comparten origen -> sin CORS ni rebuild cuando cambian las URLs.
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
CORS_ORIGINS="http://localhost:8080,http://<IP_PI>,http://<IP_PI>:8080"   # <- CAMBIA <IP_PI>; los origenes ngrok los añade sola la etapa 9
PREDICTION_API_URL="http://localhost:8000"
MPC_INTERVAL_MINUTES="15"
FORECASTER="patchtst"                            # openmeteo | patchtst | timesfm
SITE_TZ="America/Bogota"
GROQ_API_KEY=""                                 # opcional
OPENAI_API_KEY=""                               # opcional
LLM_PROVIDER="openai"
MQTT_BROKER="34.69.148.115"                      # broker MQTT externo de la guía

# --- Frontend (Frontend/GestionFront/.env.production) ---
# Rutas RELATIVAS: la SPA, la API y Socket.IO comparten origen (nginx :80/:8080
# y el tunel ngrok), asi que NO hay que recompilar cuando cambian las URLs.

# --- Opciones de despliegue ---
USE_DOCKER_REDIS="no"        # yes | no  (no = redis nativo con apt, recomendado en Pi)
ENABLE_NGROK="yes"           # yes | no  (activado: túnel remoto ngrok-via-Docker para ver la paginita fuera de la Udenar)
NGROK_TARGET_PORT="3000"     # puerto del backend que expone ngrok (3000, API directa opcional)
NGROK_FRONTEND_PORT="80"     # puerto de nginx que expone ngrok (SPA + API + socket en un solo origen)

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
  # docker: obligatorio para el tunel ngrok de la etapa 8 (y opcional para redis)
  if command -v docker >/dev/null 2>&1; then
    ok "docker -> $(docker --version 2>/dev/null)"
    if docker compose version >/dev/null 2>&1; then ok "docker compose -> $(docker compose version 2>/dev/null | head -1)"
    else warn "plugin 'docker compose' NO disponible (necesario para el tunel ngrok)"; fi
  else
    warn "docker NO encontrado (necesario para el tunel ngrok de la etapa 8)"
  fi
  if command -v ngrok >/dev/null 2>&1; then ok "ngrok (binario) -> $(ngrok version 2>/dev/null)"; else warn "ngrok (binario) no instalado — bien: la etapa 8 usa la imagen Docker"; fi
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
    // pm2 resuelve 'script' RELATIVO al CWD desde donde se lanza 'pm2 start',
    // no al dir del config: sin cwd/absoluto buscaba <repo>/app.js y moria.
    script: __dirname + "/app.js",
    cwd: __dirname,
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
  # pm2 captura el entorno del shell al arrancar la app: sin esto la
  # prediccion arranca con los defaults del codigo (FORECASTER=openmeteo)
  # y SIN MONGO_URL -> /predict/sensor revienta al calibrar.
  export REDIS_URL FORECASTER SITE_TZ
  export BACKEND_ENV="$CLONE_DIR/Backend/.env"
  ok "entorno exportado (BACKEND_ENV=$BACKEND_ENV)"
  # Lanzar con pm2 (cwd importante). El delete evita que reintentos
  # acumulen entradas duplicadas de sige-prediccion peleando por el 8000.
  pm2 delete sige-prediccion >/dev/null 2>&1 || true
  # pm2 --interpreter pasa la ruta como *script* a bash, no como interprete:
  # bash intenta leer el binario ELF de .venv/bin/python y muere con
  # "source code cannot contain null bytes". La forma que si funciona es la
  # misma que usa ngrok: interprete DENTRO del comando, sin --interpreter.
  pm2 start "$CLONE_DIR/.venv/bin/python -m uvicorn prediction.main:app --host 0.0.0.0 --port 8000 --workers 1" \
    --name sige-prediccion --cwd "$CLONE_DIR/optimization" \
    --update-env || warn "pm2 prediccion no arrancó (revisa más abajo)"
  pm2 save
  sleep 3
  curl -s http://localhost:8000/predict/health || warn "health predict no responde aún"
}

stage_frontend(){
  log "Etapa 5: frontend (build)"
  cd "$CLONE_DIR/Frontend/GestionFront" || die "no existe Frontend/GestionFront"
  # Rutas relativas: la SPA llama a /api y /socket.io en SU propio origen.
  # asi funciona igual en LAN (:80 y :8080) y en el tunel ngrok (https) sin
  # tocar CORS ni recompilar cuando cambian las URLs de ngrok.
  cat > .env.production <<'EOF'
VITE_API_URL=/api
VITE_SOCKET_URL=/
EOF
  ok "Frontend/.env.production creado (rutas relativas, mismo origen)"
  yarn install --frozen-lockfile || yarn install || die "fallo yarn install frontend"
  yarn build || die "fallo yarn build"
  ok "frontend compilado en dist/"
}

# Etapa 6: nginx como reverse proxy en UN solo origen.
#   :80  -> http://<IP_PI>/            (nueva forma de acceder; el tunel ngrok apunta aqui)
#   :8080 -> http://<IP_PI>:8080        (la URL LAN de siempre)
# Sirve dist/ directamente y hace proxy de /api y /socket.io al backend :3000.
# Al compartir origen no hay CORS y NO hace falta recompilar la SPA cuando
# cambian las URLs de ngrok. 'proxy_set_header Origin ""' elimina la cabecera
# Origin antes de que llegue al backend: el chequeo de Socket.IO (app.js:34)
# ve origen vacio -> '!origin' -> permite, sin depender de CORS_ORIGINS.
stage_nginx(){
  log "Etapa 6: nginx (SPA + API + socket en un solo origen)"
  if [[ -z "$SUDO" && "$EUID" -ne 0 ]]; then
    die "escribir en /etc/nginx exige root (y no hay sudo). Ejecuta el script como root o instala sudo."
  fi
  command -v nginx >/dev/null 2>&1 || {
    log "Instalando nginx"
    $SUDO apt update && $SUDO apt install -y nginx || die "no se pudo instalar nginx"
  }
  local conf="/etc/nginx/sites-available/sige"
  $SUDO tee "$conf" >/dev/null <<EOF
server {
    listen 80 default_server;
    listen 8080 default_server;
    server_name _;

    root $CLONE_DIR/Frontend/GestionFront/dist;
    index index.html;

    # API REST del backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # sin Origin, el backend no ve motivo para rechazar por CORS
        proxy_set_header Origin "";
    }

    # Socket.IO (polling + websocket)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Origin "";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # SPA: todo lo demas cae en index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  $SUDO ln -sfn "$conf" /etc/nginx/sites-enabled/sige
  # el site por defecto de nginx compite por 'default_server' en :80
  $SUDO rm -f /etc/nginx/sites-enabled/default
  # nginx corre como www-data: necesita atravesar $HOME hasta dist/ y leerlo.
  # Sin esto -> stat() "Permission denied" + SPA 500 (error.log lo confirma).
  # Idempotente; si dist/ aun no existe (etapa 5 pendiente) no pasa nada.
  $SUDO chmod o+x "$HOME" 2>/dev/null || true
  $SUDO chmod o+x "$CLONE_DIR" \
    "$CLONE_DIR/Frontend" \
    "$CLONE_DIR/Frontend/GestionFront" 2>/dev/null || true
  $SUDO chmod -R o+rX "$CLONE_DIR/Frontend/GestionFront/dist" 2>/dev/null || true
  # aviso temprano: sin dist/ la SPA responde 500/404 (construir en etapa 5)
  if [[ ! -f "$CLONE_DIR/Frontend/GestionFront/dist/index.html" ]]; then
    warn "falta $CLONE_DIR/Frontend/GestionFront/dist/index.html"
    warn "  si el frontend no se construyo, ejecuta la etapa 5 antes (la SPA dara 500/404)"
  fi
  # mostrar el error REAL de 'nginx -t' (no tragarlo): sin esto es ciego
  if $SUDO nginx -t 2>&1 | tee /tmp/sige-nginx-t.log >/dev/null; then
    ok "nginx -t: config valida"
  else
    warn "nginx -t detecto problemas:"
    $SUDO cat /tmp/sige-nginx-t.log
    die "config de nginx invalida ($conf). Copia el error de arriba y corrige, o consulta DESPLIEGUE_RASPBERRY.md"
  fi
  $SUDO systemctl enable --now nginx >/dev/null 2>&1 \
    || $SUDO service nginx start >/dev/null 2>&1 \
    || die "no se pudo arrancar nginx"
  $SUDO systemctl reload nginx >/dev/null 2>&1 || $SUDO service nginx reload >/dev/null 2>&1 || true
  # nginx ocupa ahora el 8080: paramos el 'pm2 serve' viejo si seguia vivo
  pm2 delete gestion-front >/dev/null 2>&1 || true
  ok "nginx sirve dist/ en :80 y :8080 con proxy de /api y /socket.io -> :3000"
}

stage_pm2(){
  log "Etapa 7: lanzar servicios con pm2"
  cd "$CLONE_DIR" || die "no existe $CLONE_DIR"
  # Backend: delete previo (igual que sige-prediccion) para que un intento
  # fallido anterior con la ruta vieja no deje un registro stale compitiendo.
  pm2 delete sige-backend >/dev/null 2>&1 || true
  pm2 start Backend/ecosystem.config.js --update-env
  sleep 2
  pm2 describe sige-backend --no-color 2>/dev/null | grep -qE 'status\s+online' \
    || warn "sige-backend no quedo online (mira: pm2 logs sige-backend --lines 40)"
  # El frontend ya NO lo sirve pm2 (nginx ocupa el 80 y el 8080); limpiamos
  # cualquier instancia vieja de 'pm2 serve' para que no pelee por el puerto.
  pm2 delete gestion-front >/dev/null 2>&1 || true
  pm2 save
  log "Estado pm2:"
  pm2 status
  log "Para que arranca solo al encender la Pi, ejecuta UNA vez:"
  echo "  $SUDO env PATH=\"\$PATH:/$(command -v node | sed 's#/node##')\" pm2 startup systemd -u $USER --hp $HOME"
  echo "  pm2 save"
}

# URL publica del tunel que da a un puerto. ngrok nombra el tunel segun su
# config ('sige-backend'/'sige-frontend' en ngrok.yml), no segun el proceso,
# asi que filtrar por name del proceso nunca sirve. Prioridad:
#   1) nombre de la config (sige-backend / sige-frontend)
#   2) config.addr que apunte al puerto buscado
# addr puede venir como 'http://localhost:80', 'localhost:80' o '80'
# segun se arranque; por eso se toleran los tres formatos.
# OJO: el fallback de "unico tunel" SOLO aplica cuando ngrok no reporta
# addr. Si el addr existe y apunta a otro puerto, devolver esa URL seria
# dar la URL de un tunel equivocado.
ngrok_url_for_port(){
  local port="$1" name="${2:-}"
  curl -s --max-time 5 http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "
import json,sys
port=sys.argv[1]
name=sys.argv[2] if len(sys.argv)>2 else ''
try:
    ts=json.load(sys.stdin).get('tunnels',[])
except Exception:
    ts=[]
def addr_matches(t):
    a=str(t.get('config',{}).get('addr',''))
    if a.split('/')[-1].endswith(':'+port): return True
    return a.rstrip('/')==port
def addr_known(t):
    return str(t.get('config',{}).get('addr','')).strip()!=''
if name:
    hit=[t for t in ts if t.get('name')==name]
    if not hit:
        hit=[t for t in ts if addr_matches(t)]
else:
    hit=[t for t in ts if addr_matches(t)]
if not hit and len(ts)==1 and not addr_known(ts[0]):
    hit=ts
print(hit[0]['public_url'] if hit else '')
" "$port" "$name" 2>/dev/null
}

# Escribe NGROK_AUTHTOKEN en $CLONE_DIR/.env (gitignored) para que docker
# compose lo interpolate (ver docker-compose.yml -> servicio ngrok). Busca el
# token en la variable de entorno NGROK_AUTHTOKEN o en la config classica del
# agente (~/.config/ngrok/ngrok.yml...). Idempotente: si .env ya lo tiene, no
# se toca; solo se añade la linea, sin reescribir el resto del archivo.
write_ngrok_authtoken(){
  local envf="$CLONE_DIR/.env" tok="${NGROK_AUTHTOKEN:-}"
  if [[ -f "$envf" ]] && grep -q '^NGROK_AUTHTOKEN=..*' "$envf" 2>/dev/null; then
    ok ".env ya tiene NGROK_AUTHTOKEN (se conserva)"
    return 0
  fi
  if [[ -z "$tok" ]]; then
    tok=$(
      python3 - "$HOME/.config/ngrok/ngrok.yml" "$HOME/.ngrok2/ngrok.yml" "$HOME/.config/ngrok/ngrok2.yml" <<'PY'
import re, sys
for path in sys.argv[1:]:
    try:
        data = open(path, encoding='utf-8', errors='ignore').read()
    except OSError:
        continue
    m = re.search(r'^\s*authtoken\s*:\s*(\S+)', data, re.M)
    if m:
        print(m.group(1).strip('"\''))
        break
PY
    )
  fi
  if [[ -z "$tok" ]]; then
    warn "no encontre el authtoken de ngrok (~/.config/ngrok/ ni NGROK_AUTHTOKEN)"
    warn "crea $envf con una linea:  NGROK_AUTHTOKEN=<tu-token>   (ngrok.com -> Your Authtoken)"
    return 1
  fi
  # si el .env existe y no termina en salto de linea, append pegaria lineas
  if [[ -f "$envf" && -s "$envf" && "$(tail -c1 "$envf" | wc -l)" -eq 0 ]]; then
    echo >> "$envf"
  fi
  printf 'NGROK_AUTHTOKEN=%s\n' "$tok" >> "$envf"
  ok "NGROK_AUTHTOKEN escrito en $envf"
}

stage_ngrok(){
  if [[ "$ENABLE_NGROK" != "yes" ]]; then
    warn "Etapa 8 (ngrok) omitida (ENABLE_NGROK=no). Actívala si quieres túnel remoto."
    return
  fi
  log "Etapa 8: ngrok en DOCKER (compose propio generado por este script) -> API ($NGROK_TARGET_PORT) + nginx ($NGROK_FRONTEND_PORT)"
  command -v docker >/dev/null 2>&1 \
    || die "docker no instalado (obligatorio para el tunel ngrok). Instala: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || die "falta el plugin 'docker compose'"
  write_ngrok_authtoken || die "falta NGROK_AUTHTOKEN en $CLONE_DIR/.env"
  # --- archivos de ngrok: los genera ESTE script, no viven en el repo
  # (el docker-compose.yml de la raiz queda intacto para redis/dev.sh).
  # ngrok.yml: heredoc sin comillas -> expande los puertos del CONFIG.
  cat > "$CLONE_DIR/ngrok.yml" <<EOF
version: "3"
tunnels:
  sige-backend:
    proto: http
    addr: $NGROK_TARGET_PORT
  sige-frontend:
    proto: http
    addr: $NGROK_FRONTEND_PORT
EOF
  # compose del tunel: heredoc COMILLADO -> \${NGROK_AUTHTOKEN:-} queda literal
  # para que el archivo parsee aunque el token falle (lo exige write_ngrok_authtoken).
  cat > "$CLONE_DIR/docker-compose.ngrok.yml" <<'EOF'
# Generado por deploy_pi.sh (etapa 8). Fuera del repo a proposito.
# Uso:
#   docker compose -f docker-compose.ngrok.yml up -d ngrok
#   docker compose -f docker-compose.ngrok.yml logs ngrok
# network_mode: host -> el contenedor ve localhost:3000/:80 (no existe
# host.docker.internal en Docker nativo) y deja la API de inspeccion en
# localhost:4040 para leer las URLs publicas.
services:
  ngrok:
    image: ngrok/ngrok:latest
    container_name: sige-ngrok
    restart: unless-stopped
    network_mode: host
    environment:
      NGROK_AUTHTOKEN: ${NGROK_AUTHTOKEN:-}
    volumes:
      - ./ngrok.yml:/etc/ngrok/ngrok.yml:ro
    command: ["start", "--all", "--config", "/etc/ngrok/ngrok.yml"]
EOF
  ok "ngrok.yml + docker-compose.ngrok.yml escritos en $CLONE_DIR"
  # docker debe estar habilitado al boot para que el tunel sobreviva a reinicios
  $SUDO systemctl enable --now docker >/dev/null 2>&1 \
    || warn "no pude habilitar docker al arranque (revisa: $SUDO systemctl enable docker)"
  # limpiar la forma vieja (pm2 + binario ngrok instalado a mano)
  pm2 delete ngrok-backend ngrok-frontend sige-ngrok >/dev/null 2>&1 || true
  # UN SOLO agente con los dos tuneles: 'start --all' es la forma documentada
  # de correr varios endpoints en un contenedor.
  ( cd "$CLONE_DIR" && docker compose -f docker-compose.ngrok.yml up -d ngrok ) \
    || die "fallo 'docker compose -f docker-compose.ngrok.yml up -d ngrok'"
  ok "contenedor ngrok lanzado"
  log "Esperando los dos tuneles de ngrok..."
  local NG="" FRONT=""
  for _ in $(seq 1 25); do
    NG=$(ngrok_url_for_port "$NGROK_TARGET_PORT" sige-backend)
    FRONT=$(ngrok_url_for_port "$NGROK_FRONTEND_PORT" sige-frontend)
    [[ -n "$NG" && -n "$FRONT" ]] && break
    sleep 2
  done
  if [[ -z "$NG" && -z "$FRONT" ]]; then
    warn "ngrok no levanto ningun tunel. Diagnostica con:"
    warn "  docker compose -f $CLONE_DIR/docker-compose.ngrok.yml logs ngrok --tail 40"
    warn "  curl -s http://localhost:4040/api/tunnels | python3 -m json.tool"
    return
  fi
  if [[ -z "$NG" ]]; then
    warn "tunel del backend ($NGROK_TARGET_PORT) no subio"
  else
    ok "API      -> $NG"
  fi
  if [[ -z "$FRONT" ]]; then
    warn "tunel de nginx ($NGROK_FRONTEND_PORT) no subio"
  else
    ok "Frontend -> $FRONT"
  fi
  warn "Las URLs cambian en cada reinicio de la Pi: vuelve a correr la etapa 9."
  if [[ -n "$NG" && -n "$FRONT" ]]; then
    ok "los dos tuneles activos"
  fi
}

# Añade un origen (una sola URL, sin comas) a CORS_ORIGINS dentro de
# Backend/.env, sin reescribir el resto del archivo. Si el origen ya esta
# listado, no hace nada. La coma es el separador; se une sin espacios.
allow_origin_ngrok(){
  local envf="$CLONE_DIR/Backend/.env" origin="$1"
  if [[ ! -f "$envf" ]]; then
    warn "no existe $envf (ejecuta la etapa 2 antes)"
    return 1
  fi
  python3 - "$envf" "$origin" <<'PY'
import re, sys
path, origin = sys.argv[1], sys.argv[2]
data = open(path, encoding='utf-8').read()
m = re.search(r'^CORS_ORIGINS=(.*)$', data, re.M)
cur = m.group(1).strip() if m else ''
origins = [o for o in cur.split(',') if o]
if origin in origins:
    print('  ya estaba en CORS_ORIGINS:', origin)
    sys.exit(0)
origins.append(origin)
line = 'CORS_ORIGINS=' + ','.join(origins)
if m:
    data = data[:m.start()] + line + data[m.end():]
else:
    data = data.rstrip('\n') + '\n' + line + '\n'
open(path, 'w', encoding='utf-8').write(data)
print('  añadido a CORS_ORIGINS:', origin)
PY
}

# Etapa 9: registrar las URLs ngrok actuales como origenes permitidos.
# NO se reconstruye el frontend (usa rutas relativas); solo se toca el CORS
# del backend para que la SPA servida desde el tunel (origen https://xxx.ngrok-free.app)
# pueda llamar a /api y a socket.io. Las URLs ngrok cambian en cada reinicio
# de la Pi, asi que esta etapa hay que repetirla.
stage_remote(){
  log "Etapa 9: añadir origenes ngrok a CORS_ORIGINS (sin rebuild)"
  if [[ "$ENABLE_NGROK" != "yes" ]]; then
    warn "ENABLE_NGROK=no: no hay túnel. Omito etapa 9."
    return
  fi
  local NG FRONT
  NG=$(ngrok_url_for_port "$NGROK_TARGET_PORT" sige-backend)
  FRONT=$(ngrok_url_for_port "$NGROK_FRONTEND_PORT" sige-frontend)
  if [[ -z "$NG" && -z "$FRONT" ]]; then
    die "no hay tuneles ngrok. Ejecuta la etapa 8 primero y espera a que suban."
  fi
  if [[ -n "$NG" ]]; then
    ok "tunel API -> $NG"
    allow_origin_ngrok "$NG" || warn "no pude tocar Backend/.env"
  fi
  if [[ -n "$FRONT" ]]; then
    ok "tunel SPA -> $FRONT"
    allow_origin_ngrok "$FRONT" || warn "no pude tocar Backend/.env"
  else
    warn "tunel de nginx ($NGROK_FRONTEND_PORT) no encontrado; repite la etapa 9 cuando suba"
  fi
  # el backend arranco con los CORS anteriores: reinicio con --update-env.
  # los tuneles de ngrok (contenedor) no se tocan.
  pm2 restart sige-backend --update-env >/dev/null 2>&1 \
    || warn "no pude reiniciar sige-backend"
  sleep 2
  log "Abre (fuera de la Udenar):"
  if [[ -n "$FRONT" ]]; then
    echo "  $FRONT   <- SPA (nginx :$NGROK_FRONTEND_PORT, mismo origen que /api y socket.io)"
  fi
  if [[ -n "$NG" ]]; then
    echo "  $NG   <- API directa (opcional)"
  fi
  warn "Las URLs ngrok cambian en cada reinicio de la Pi: vuelve a correr la etapa 9."
}

stage_verify(){
  log "Etapa 10: verificación end-to-end"
  pm2 status
  redis-cli ping
  echo "--- backend :3000 (requiere JWT en x-token) ---"
  curl -s -o /dev/null -w "backend HTTP %{http_code}\n" http://localhost:3000/api/front/sensors
  echo "--- prediccion :8000 ---"
  curl -s http://localhost:8000/predict/health || warn "predict no responde"
  echo "--- nginx :80 (SPA + /api mismo origen) ---"
  spa80=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/ || true)
  spa8080=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/ || true)
  apin=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/front/sensors || true)
  echo "SPA via :80    HTTP $spa80"
  echo "SPA via :8080  HTTP $spa8080"
  echo "api via nginx  HTTP $apin"
  if [[ "$spa80" == "500" || "$spa8080" == "500" ]]; then
    warn "SPA 500 = www-data no puede leer dist/ (permisos)"
    warn "  sol.: ./deploy_pi.sh 6  |  diag.: sudo tail -40 /var/log/nginx/error.log"
  fi
  if [[ ! -f "$CLONE_DIR/Frontend/GestionFront/dist/index.html" ]]; then
    warn "la SPA da 500 porque no hay build en dist/ -> ejecuta: ./deploy_pi.sh 5"
  fi
  echo "--- ngrok tunnels (docker) ---"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi ngrok; then
    ok "contenedor ngrok corriendo"
    local NG FRONT_URL
    NG=$(ngrok_url_for_port "$NGROK_TARGET_PORT" sige-backend)
    FRONT_URL=$(ngrok_url_for_port "$NGROK_FRONTEND_PORT" sige-frontend)
    [[ -n "$NG" ]] && echo "  API      -> $NG"
    if [[ -n "$FRONT_URL" ]]; then
      echo "  Frontend -> $FRONT_URL"
      curl -s --max-time 20 -o /dev/null -w "  SPA via ngrok HTTP %{http_code}\n" "$FRONT_URL/" \
        || warn "la SPA no responde a traves del tunel"
    fi
  else
    warn "contenedor ngrok no corre (etapa 8 o ENABLE_NGROK=no)"
  fi
  verify_failures
}

# Chequeo final: lista TODO lo que este caido. Devuelve 1 si hay fallos
# para que un script/CI pueda detectarlo, pero sin abortar con die.
verify_failures(){
  local bad=0 st code
  st=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    apps = json.load(sys.stdin)
except Exception:
    apps = []
print(' '.join(a.get('name','?') for a in apps
               if a.get('pm2_env',{}).get('status') != 'online'))" 2>/dev/null)
  if [[ -n "${st:-}" ]]; then warn "apps pm2 NO online: $st"; bad=1; fi
  redis-cli ping >/dev/null 2>&1 || { warn "redis no responde"; bad=1; }
  curl -sf --max-time 5 -o /dev/null http://localhost:8000/predict/health \
    || { warn "predict (:8000) no responde"; bad=1; }
  # 401 en /api/front/sensors es ESPERADO (JWT); lo unico fatal es no conectar (000)
  code=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://localhost/api/front/sensors 2>/dev/null || true)
  if [[ -z "$code" || "$code" == "000" ]]; then warn "nginx no responde en :80"; bad=1; fi
  # nginx -t como non-root muere al escribir /run/nginx.pid (falsa alarma);
  # con sudo el test ES valido y solo reporta errores reales de sintaxis.
  if ! $SUDO nginx -t 2>&1 | tee /tmp/sige-nginx-t-verify.log >/dev/null; then
    warn "config de nginx invalida (nginx -t):"
    cat /tmp/sige-nginx-t-verify.log
    bad=1
  fi
  # SPA 500 via nginx casi siempre = dist sin construir (try_files -> /index.html inexistente)
  # o, si existe, permisos: www-data no puede atravesar/leer el docroot ($HOME 750...).
  if [[ ! -f "$CLONE_DIR/Frontend/GestionFront/dist/index.html" ]]; then
    warn "no hay build del frontend ($CLONE_DIR/Frontend/GestionFront/dist/index.html)"
    warn "  la SPA da 500 via nginx. Ejecuta: ./deploy_pi.sh 5 (frontend)"
    bad=1
  elif ! $SUDO -u www-data stat -c '%n' "$CLONE_DIR/Frontend/GestionFront/dist/index.html" >/dev/null 2>&1; then
    warn "www-data NO puede leer dist/index.html (permisos)"
    warn "  sol.: ./deploy_pi.sh 6 (hace chmod o+x \$HOME / \$CLONE_DIR + o+rX dist)"
    bad=1
  fi
  if [[ -x "$CLONE_DIR/.venv/bin/python" ]]; then
    "$CLONE_DIR/.venv/bin/python" -c "import pyomo, numpy, pandas" 2>/dev/null \
      || { warn "faltan dependencias del solver en .venv (pyomo/numpy/pandas)"; bad=1; }
  fi
  if [[ "$ENABLE_NGROK" == "yes" ]]; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi ngrok; then
      if [[ -z "$(ngrok_url_for_port "$NGROK_FRONTEND_PORT" sige-frontend)" ]]; then
        warn "ngrok corre pero el tunel :$NGROK_FRONTEND_PORT no subio"
        warn "  docker compose -f $CLONE_DIR/docker-compose.ngrok.yml logs ngrok --tail 40"
        bad=1
      fi
    else
      warn "contenedor ngrok no corre"
      warn "  cd $CLONE_DIR && docker compose -f docker-compose.ngrok.yml up -d ngrok"
      bad=1
    fi
  fi
  if [[ $bad -eq 1 ]]; then
    warn "verificación con problemas (mira avisos arriba)"
    return 1
  fi
  ok "verificación end-to-end sin fallos"
}

# ============================================================
# Dispatcher
# ============================================================
main(){
  check_config
  local stages=("$@")
  if [[ ${#stages[@]} -eq 0 || "${stages[0]}" == "all" ]]; then
    stages=(preflight clone backend redis prediction frontend nginx pm2 ngrok remote verify)
  fi
  for s in "${stages[@]}"; do
    case "$s" in
      0|preflight)  stage_preflight ;;
      1|clone)      stage_clone ;;
      2|backend)    stage_backend ;;
      3|redis)      stage_redis ;;
      4|prediction) stage_prediction ;;
      5|frontend)   stage_frontend ;;
      6|nginx)      stage_nginx ;;
      7|pm2)        stage_pm2 ;;
      8|ngrok)      stage_ngrok ;;
      9|remote|rebuild_remote) stage_remote ;;
      10|verify)    stage_verify ;;
      *) warn "etapa desconocida: $s (usa 0..10 o nombres)" ;;
    esac
  done
  ok "Script completado."
}

main "$@"
