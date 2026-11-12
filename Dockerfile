# P9 (D-100): the backend container (Azure App Service / Container Apps later, D-054).
# Build from the repo root: docker build -t tgseccsl-backend .
# Runs pending migrations, the bootstrap (G3: fills an empty database, first Super Admin), then the API on :4100. Config comes from the environment
# (DATABASE_URL, JWT_SECRET, DATA_ENCRYPTION_KEY, CORS_ORIGIN, ...; see backend/.env.example).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# Only the backend and the packages it imports (domain, types, mock-data for the seed).
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY packages/domain/package.json packages/domain/
COPY packages/types/package.json packages/types/
COPY packages/mock-data/package.json packages/mock-data/
RUN npm ci --omit=dev -w @tgs/backend --include-workspace-root=false && npm cache clean --force
COPY packages/domain/src packages/domain/src
COPY packages/types/src packages/types/src
COPY packages/mock-data/src packages/mock-data/src
COPY backend/src backend/src
COPY tsconfig.base.json ./
COPY backend/tsconfig.json backend/
WORKDIR /app/backend
USER node
EXPOSE 4100
HEALTHCHECK CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/db/bootstrap.ts && exec npx tsx src/server.ts"]
