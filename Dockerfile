# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ---- Production stage ----
FROM node:22-alpine

WORKDIR /app

# Instalar openssl para Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY --from=builder /app/dist ./dist/

EXPOSE 3000

# Ejecutar migraciones y luego arrancar el servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
