# ─── API service Dockerfile ───────────────────────────────────────────────────
# Build context: repo root (docker compose -f ... build)
# --transpile-only skips type checking at runtime (tsc runs in CI separately)

FROM node:20-alpine

# Install wget for the healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# ── Dependency layer (cached until any package.json changes) ──────────────────
COPY package.json package-lock.json ./
COPY packages/api/package.json     ./packages/api/
COPY packages/core/package.json    ./packages/core/
COPY packages/db/package.json      ./packages/db/
COPY packages/memory/package.json  ./packages/memory/
COPY packages/workers/package.json ./packages/workers/
COPY evals/package.json            ./evals/

RUN npm ci

# ── Source ────────────────────────────────────────────────────────────────────
COPY packages/ ./packages/

EXPOSE 3000

# dotenv.config() in server.ts loads /app/.env — not present in containers.
# All env vars are injected by docker-compose environment: section.
CMD ["node", "node_modules/.bin/ts-node", \
     "--transpile-only", \
     "--project", "packages/api/tsconfig.json", \
     "packages/api/src/server.ts"]
