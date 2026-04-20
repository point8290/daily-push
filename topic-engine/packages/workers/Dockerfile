# ─── Workers service Dockerfile ──────────────────────────────────────────────
# Build context: repo root (docker compose -f ... build)
# Runs all 5 BullMQ workers in a single process.

FROM node:20-alpine

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

CMD ["node", "node_modules/.bin/ts-node", \
     "--transpile-only", \
     "--project", "packages/workers/tsconfig.json", \
     "packages/workers/src/index.ts"]
