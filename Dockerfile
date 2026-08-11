# syntax=docker/dockerfile:1
# ============================================================
# Image de production de l'API MyBDE (NestJS + Prisma)
# Construction en deux étapes pour une image finale légère.
# ============================================================

# --- Étape 1 : construction ---
FROM node:20-alpine AS build
WORKDIR /app

# Dépendances (avec devDependencies pour compiler et générer Prisma).
# --include=dev est explicite : les plateformes de déploiement injectent
# souvent NODE_ENV=production au build, ce qui ferait sauter @nestjs/cli.
COPY package*.json ./
RUN npm ci --include=dev

# Client Prisma + compilation TypeScript
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# --- Étape 2 : exécution ---
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# curl est requis par le healthcheck de Coolify, exécuté dans le conteneur.
RUN apk add --no-cache curl

# Dépendances de production uniquement
COPY package*.json ./
RUN npm ci --omit=dev

# Client Prisma généré + build + schéma (pour les migrations)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

# Applique les migrations puis démarre l'API.
# (npx prisma migrate deploy nécessite le paquet prisma ; sur Coolify, on peut
#  aussi lancer les migrations dans une commande de déploiement dédiée.)
CMD ["node", "dist/main.js"]
