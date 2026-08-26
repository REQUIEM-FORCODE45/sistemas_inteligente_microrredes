# Despliegue en Raspberry Pi — Backend + Frontend + API Python + ngrok + pm2

Guía completa para desplegar la plataforma SIGE en una Raspberry Pi con `pm2` y `ngrok` (ambos ya instalados y configurados).

> **Puertos canónicos:** Backend `3000` (Express+Socket.IO), Predicción `8000` (FastAPI), Frontend `8080` (pm2 serve SPA), Redis `6379`, MQTT externo `34.69.148.115`.

---

## 1. Prerrequisitos

```bash
node -v      # >=20.19 recomendado (20.17 funciona con warnings)
yarn -v
python3 --version  # 3.10+
pip3 --version
pm2 -v
ngrok version
redis-cli ping  # PONG si ya corre
```

Instalar lo que falte:

```bash
sudo apt update && sudo apt install -y python3-venv python3-pip git redis-server
sudo npm i -g pm2 yarn
```

Verificar ngrok autenticado (ya hecho):

```bash
ngrok config check
```

---

## 2. Clonar y preparar variables de entorno

```bash
cd ~
git clone <URL_REPO> sistema_inteligente_microrredes
cd sistema_inteligente_microrredes
```

### 2.1 Backend — `Backend/.env`

Crear `Backend/.env` (está en `.gitignore`, no se sube). Plantilla mínima:

```ini
MONGO_URL=mongodb+srv://<user>:<pass>@clusterinteligente.qnejnxi.mongodb.net/
MONGO_DB_NAME=sistema_inteligente_db
PORT=3000
SECRET_JWT_SEED=<cambia_esto>
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:8080,http://<IP_PI>:8080
PREDICTION_API_URL=http://localhost:8000
MPC_INTERVAL_MINUTES=15
FORECASTER=patchtst
SITE_TZ=America/Bogota
GROQ_API_KEY=<opcional>
OPENAI_API_KEY=<opcional>
LLM_PROVIDER=openai
```

> **CORS con ngrok dinámico:** la URL de ngrok cambia en cada reinicio (plan free). Añade el dominio actual a `CORS_ORIGINS` separado por comas y reinicia el backend (ver §6.3). Para no editar en cada reinicio puedes dejar temporalmente `CORS_ORIGINS=*` en desarrollo, pero no en producción.

### 2.2 Frontend — `Frontend/GestionFront/.env.production`

`VITE_*` se **bakea en build-time** (`src/api/grid-api.js:3` usa `import.meta.env.VITE_API_URL || 'http://localhost:3000/api'`). Debe definirse **antes** de `yarn build`:

```ini
VITE_API_URL=http://<IP_PI>:3000/api
VITE_SOCKET_URL=http://<IP_PI>:3000
```

Si quieres que el frontend use el túnel ngrok (acceso remoto fuera de la LAN), usa la URL de ngrok en vez de la IP:

```ini
VITE_API_URL=https://<abc123>.ngrok-free.app/api
VITE_SOCKET_URL=https://<abc123>.ngrok-free.app
```

> Cada vez que cambie la URL de ngrok hay que reconstruir el frontend (`yarn build`) o usar IP LAN para evitarlo. Recomendado: exponer solo el backend por ngrok y servir el frontend por LAN (`8080`).

---

## 3. Redis

El `docker-compose.yml` solo trae Redis:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --protected-mode no
  ports: ["6379:6379"]
```

Opción A — Docker (recomendada):

```bash
docker compose up -d
redis-cli ping  # PONG
```

Opción B — nativo:

```bash
sudo systemctl enable --now redis-server
redis-cli ping
```

> `--protected-mode no` es obligatorio en Docker bridge; sin él hay `ECONNRESET`.

---

## 4. Backend con pm2

```bash
cd ~/sistema_inteligente_microrredes/Backend
yarn install --frozen-lockfile
```

Crear `Backend/ecosystem.config.js`:

```js
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
```

> `fork` es obligatorio (Socket.IO + MQTT + timers no soportan `cluster`).

Lanzar y persistir al boot:

```bash
pm2 start ecosystem.config.js --update-env
pm2 save
pm2 startup systemd  # copia y ejecuta el comando que imprime
pm2 logs sige-backend --lines 50
pm2 status
```

Actualizar CORS tras cambiar ngrok:

```bash
pm2 restart sige-backend --update-env
```

---

## 5. API Python de Predicción + Solver

### 5.1 Crear venv e instalar

```bash
cd ~/sistema_inteligente_microrredes
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel setuptools

# torch CPU para ARM — OBLIGATORIO aparte (no usar pip install torch por defecto)
pip install torch --index-url https://download.pytorch.org/whl/cpu  # ~92MB aarch64

pip install -r optimization/requirements.txt
```

Contenido de `optimization/requirements.txt`: `fastapi`, `uvicorn`, `pyomo`, `gurobipy`, `highspy`, `redis`, `pandas`, `pvlib`, `scikit-learn`, `pymongo`, `paho-mqtt`, `transformers`, `accelerate`, etc. Los modelos PatchTST (`prediction/patchtst/patchtst_best.pt` 9.2MB) ya están en el repo.

> **No instalar `timesfm`** en Pi (`pip install timesfm` ~2GB). Solo si `FORECASTER=timesfm` y Pi con >4GB RAM.

### 5.2 Variables para la predicción

La API lee `Backend/.env` vía `dev.sh` (`source ../Backend/.env`). Para pm2 exporta:

```bash
export REDIS_URL=redis://localhost:6379
export FORECASTER=patchtst   # openmeteo | patchtst | timesfm
export SITE_TZ=America/Bogota
```

| FORECASTER | RAM requerida | Notas Pi |
|---|---|---|
| `openmeteo` | ~100MB | Recomendado Pi 2GB, sin torch, solo NWP Open-Meteo |
| `patchtst` | ~400-600MB | Recomendado Pi 4GB+, 2.1M params, primera inferencia ~2s |
| `timesfm` | >1.5GB | No recomendado en Pi (200M params, descarga 800MB) |

Añade swap si es Pi 2GB:

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

### 5.3 Lanzar con pm2

Desde `optimization/` la API se lanza como:

```bash
python3 -m uvicorn prediction.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Con pm2 (cwd importante):

```bash
cd ~/sistema_inteligente_microrredes
pm2 start "python3 -m uvicorn prediction.main:app --host 0.0.0.0 --port 8000 --workers 1" \
  --name sige-prediccion \
  --cwd ./optimization \
  --interpreter ./../.venv/bin/python
pm2 save
```

O añadir al `ecosystem.config.js` raíz:

```js
{
  name: "sige-prediccion",
  cwd: "./optimization",
  script: "../.venv/bin/python",
  args: "-m uvicorn prediction.main:app --host 0.0.0.0 --port 8000 --workers 1",
  exec_mode: "fork",
  autorestart: true,
  env: { FORECASTER: "patchtst", REDIS_URL: "redis://localhost:6379" }
}
```

Verificar:

```bash
curl -s http://localhost:8000/predict/health | jq
curl -s "http://localhost:8000/predict/weather?hours=24" | head
curl -s http://localhost:8000/docs  # Swagger
pm2 logs sige-prediccion
```

### 5.4 Solver

**Modo batch (recomendado):** no hay que lanzar nada. `Backend/services/mpcScheduler.js:260` hace `exec("python3 optimization/solver/run_once.py")` por cada job vía Redis (`optimization:pending` → `optimization:result:<jobId>`).

**Modo daemon opcional** (si no quieres spawn por job):

```bash
pm2 start "python3 -m solver.main" --name sige-solver --cwd ./optimization --interpreter ./../.venv/bin/python
```

**Gurobi vs HiGHS en ARM:** `gurobipy` free está limitado a ~200 vars y el MILP usa 648 binarias → falla y hace fallback automático a `HiGHS` (`highspy` 2.1MB aarch64, MILP linealizado `PW_DIESEL_N_PTS=10`). Si `pip` falla, pin `highspy==1.11.0`.

---

## 6. Frontend con pm2

```bash
cd ~/sistema_inteligente_microrredes/Frontend/GestionFront
yarn install --frozen-lockfile

# Definir destino del backend ANTES de build
export VITE_API_URL=http://<IP_PI>:3000/api
export VITE_SOCKET_URL=http://<IP_PI>:3000
yarn build  # genera dist/
```

Servir SPA con pm2:

```bash
pm2 serve dist 8080 --name gestion-front --spa
pm2 save
pm2 logs gestion-front
```

> `--spa` activa `try_files $uri /index.html` (como `nginx.conf:9`).

**Alternativa Docker nginx** (si prefieres `nginx.conf`):

```bash
# Corregir proxy para Linux/Pi: host.docker.internal no existe en Docker nativo
# En nginx.conf cambiar proxy_pass http://host.docker.internal:3000
# por http://172.17.0.1:3000 o http://host-gateway:3000
docker build --build-arg VITE_API_URL=http://<IP_PI>:3000/api \
             --build-arg VITE_SOCKET_URL=http://<IP_PI>:3000 -t gestion-front .
docker run -d -p 80:80 --add-host=host.docker.internal:host-gateway gestion-front
```

---

## 7. ngrok en segundo plano con pm2 (dominio dinámico)

Ya tienes `ngrok` autenticado. Exponer el backend:

```bash
pm2 start "ngrok http 3000 --log stdout" --name ngrok-backend
pm2 save
pm2 logs ngrok-backend
```

Si quieres exponer también el frontend:

```bash
pm2 start "ngrok http 8080 --log stdout" --name ngrok-frontend
pm2 save
```

Obtener la URL dinámica (cambia en cada reinicio):

```bash
curl -s http://localhost:4040/api/tunnels | jq '.tunnels[].public_url'
# o ver en pm2 logs:
pm2 logs ngrok-backend --lines 20
```

### 7.1 Actualizar tras reinicio de ngrok

Cada vez que ngrok genere una URL nueva `https://<nuevo>.ngrok-free.app`:

1. Añadir a `Backend/.env` → `CORS_ORIGINS=http://<IP_PI>:8080,https://<nuevo>.ngrok-free.app`
2. `pm2 restart sige-backend --update-env`
3. Si el frontend apunta a ngrok, reconstruir:
   ```bash
   cd Frontend/GestionFront
   VITE_API_URL=https://<nuevo>.ngrok-free.app/api VITE_SOCKET_URL=https://<nuevo>.ngrok-free.app yarn build
   pm2 restart gestion-front --update-env
   ```

> Para evitar el paso 3, sirve el frontend solo por LAN y usa ngrok solo para el backend. El dashboard en LAN usa `http://<IP_PI>:8080` y las llamadas van a `https://<nuevo>.ngrok-free.app` solo si accedes remoto.

Persistir todo al boot:

```bash
pm2 save
pm2 startup systemd  # ya ejecutado arriba, una vez basta
```

---

## 8. Verificación end-to-end

```bash
pm2 status
redis-cli ping
curl -s http://localhost:3000/api/front/sensors -H "x-token: <JWT>" | head
curl -s http://localhost:8000/predict/health | jq
curl -s http://localhost:8000/predict/power?hours=24 | head
curl -s http://localhost:8080 | head
curl -s http://localhost:4040/api/tunnels | jq
```

Flujo de optimización:

```bash
curl -X POST http://localhost:3000/api/front/optimization/trigger \
  -H "Content-Type: application/json" -H "x-token: <JWT>" \
  -d '{"topology": {...}}'
curl http://localhost:3000/api/front/optimization/mpc-status -H "x-token: <JWT>"
```

---

## 9. Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `ECONNRESET` Redis | `protected-mode yes` en Docker bridge | Usar `redis-server --protected-mode no` (ya en compose) |
| `server.listen(undefined)` | Falta `PORT` en `.env` | Definir `PORT=3000` y `pm2 restart --update-env` |
| Frontend en blanco / 404 tras refresh | Falta `--spa` en `pm2 serve` | `pm2 delete gestion-front && pm2 serve dist 8080 --spa` |
| `VITE_API_URL` no cambia | Bake en build-time | Reconstruir `yarn build` tras cambiar `.env.production` |
| CORS bloqueado con ngrok | `CORS_ORIGINS` sin dominio ngrok | Añadir `https://<nuevo>.ngrok-free.app` y reiniciar backend |
| `host.docker.internal` no resuelve | Linux/Pi sin Docker Desktop | Usar `172.17.0.1`, `host-gateway` o IP LAN |
| `Gurobi fallo: ...` | Licencia size-limited | Automático fallback a HiGHS; pin `highspy==1.11.0` si falla |
| `ModuleNotFoundError: torch` | Falta wheel CPU ARM | `pip install torch --index-url https://download.pytorch.org/whl/cpu` |
| OOM en Pi 2GB | PatchTST + torch ~500MB | Cambiar `FORECASTER=openmeteo` y activar swap 2GB |
| pm2 no arranca al boot | Falta `pm2 startup` | Ejecutar el comando que imprime `pm2 startup systemd` y `pm2 save` |

---

## 10. Cheatsheet

```bash
pm2 status
pm2 logs sige-backend --lines 50
pm2 logs sige-prediccion --lines 50
pm2 logs ngrok-backend --lines 50
pm2 restart sige-backend --update-env
pm2 restart gestion-front --update-env
pm2 stop all && pm2 delete all
pm2 save

curl http://localhost:4040/api/tunnels | jq
redis-cli ping
docker compose logs redis --tail 20
```

**Archivos clave:** `Backend/ecosystem.config.js`, `Backend/.env`, `Frontend/GestionFront/.env.production`, `optimization/requirements.txt`, `Frontend/GestionFront/nginx.conf:19-41`, `docker-compose.yml`.
