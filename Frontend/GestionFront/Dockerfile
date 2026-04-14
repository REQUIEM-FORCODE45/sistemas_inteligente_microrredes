# --- Build stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar dependencias primero para optimizar el caché de Docker
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copiar el código fuente y construir
COPY . .
RUN yarn build


# --- Production stage ---
FROM nginx:alpine

# Copiar los archivos construidos desde la etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# AQUI LA MEJORA: Copiamos nuestro propio archivo de configuración
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]