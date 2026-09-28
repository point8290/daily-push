#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

chmod +x "$ROOT/dev.sh" "$ROOT/.cursor/scripts/"*.sh 2>/dev/null || true

LOGS="$ROOT/.logs"
PIDS="$ROOT/.pids"
mkdir -p "$LOGS" "$PIDS"

source_env() {
  if [[ -f daily-push/.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source daily-push/.env
    set +a
  fi
}

wait_port() {
  local port="$1" label="$2" max="${3:-90}"
  local i=0
  until nc -z localhost "$port" 2>/dev/null; do
    i=$((i + 1))
    [[ $i -ge $max ]] && { echo "$label not ready on :$port" >&2; return 1; }
    sleep 1
  done
}

start_bg() {
  local name="$1"; shift
  local pf="$PIDS/$name.pid" lf="$LOGS/$name.log"
  if [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null; then
    return 0
  fi
  nohup "$@" >"$lf" 2>&1 &
  echo $! >"$pf"
}

"$ROOT/.cursor/scripts/cloud-docker.sh"

echo "Starting database containers..."
./dev.sh start te-infra
./dev.sh start dp-infra

echo "Running migrations..."
./dev.sh migrate

echo "Seeding knowledge base (idempotent)..."
./dev.sh seed

echo "Starting application servers..."
./dev.sh start te-api
./dev.sh start dp-backend
./dev.sh start dp-frontend

wait_port 3001 "Daily Push API"
wait_port 5173 "Daily Push frontend"
wait_port 3000 "Topic Engine API"

source_env
EMAIL="cloud-agent-$(date +%s)@example.com"
PASS="CloudAgentTest1!"
REGISTER=$(curl -sf -X POST "http://localhost:3001/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"name\":\"Cloud Agent\"}") || true

if [[ -n "$REGISTER" ]]; then
  echo "Auth register OK for ${EMAIL}"
else
  echo "Auth register skipped or failed (API may already be warming up)"
fi

curl -sf "http://localhost:3001/health" >/dev/null
curl -sf "http://localhost:3000/health" >/dev/null 2>&1 || curl -sf "http://localhost:3000/" >/dev/null

echo "Cloud start complete: frontend :5173, DP API :3001, TE API :3000"
