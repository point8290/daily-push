#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

chmod +x "$ROOT/.cursor/scripts/cloud-docker.sh" "$ROOT/.cursor/scripts/cloud-start.sh" "$ROOT/dev.sh" 2>/dev/null || true

# Local env files (never overwrite existing secrets)
if [[ ! -f daily-push/.env ]]; then
  cp daily-push/.env.example daily-push/.env
  if [[ -z "${JWT_SECRET:-}" ]]; then
    JWT_SECRET="dev-cloud-agent-jwt-secret-min-32-chars"
  fi
  grep -q '^JWT_SECRET=' daily-push/.env \
    && sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" daily-push/.env \
    || echo "JWT_SECRET=${JWT_SECRET}" >> daily-push/.env
fi

if [[ ! -f topic-engine/.env ]]; then
  cp topic-engine/.env.example topic-engine/.env
fi

if [[ ! -f topic-engine/.env.dev ]]; then
  cat > topic-engine/.env.dev <<'EOF'
POSTGRES_DB=topic_engine_dev
POSTGRES_USER=topic_engine
POSTGRES_PASSWORD=topic_engine
EOF
fi

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" daily-push/.env 2>/dev/null || true
  sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" topic-engine/.env 2>/dev/null || true
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${OPENAI_API_KEY}|" daily-push/.env 2>/dev/null || true
  sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${OPENAI_API_KEY}|" topic-engine/.env 2>/dev/null || true
fi

echo "Installing Daily Push npm workspaces..."
(cd daily-push && npm ci)
echo "Building Daily Push shared package..."
(cd daily-push && npm run build --workspace=packages/shared)

echo "Installing Topic Engine npm workspaces..."
(cd topic-engine && npm ci)
