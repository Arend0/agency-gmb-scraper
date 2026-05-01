# Root build context: agency-finder/
# Single service: Express API + Vite static (production)

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

RUN npm ci --prefix client && npm ci --prefix server

COPY client ./client
COPY server ./server

RUN npm run build --prefix client \
  && npm run build --prefix server

# ---

FROM node:22-bookworm-slim AS runner

WORKDIR /app/server

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist /app/client/dist

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
