#!/usr/bin/env bash
# =============================================================================
# dev.sh — Daily Push + Topic Engine development runner
# =============================================================================
# Usage:
#   ./dev.sh                          Interactive menu
#   ./dev.sh start [services]         Start services
#   ./dev.sh stop  [services]         Stop services
#   ./dev.sh reset                    Wipe all user data (fresh start)
#   ./dev.sh status                   Show what's running
#   ./dev.sh migrate                  Run DB migrations
#   ./dev.sh seed                     Seed Daily Push knowledge base
#   ./dev.sh logs [service]           Tail logs for a service
#
# Services:
#   all         Everything (default)
#   te          All Topic Engine services
#   dp          All Daily Push services
#   te-infra    Topic Engine Docker (Postgres :5433 + Redis :6379)
#   te-api      Topic Engine API (:3000)
#   te-workers  Topic Engine BullMQ workers
#   dp-infra    Daily Push Docker (Postgres :5434 + MongoDB :27017)
#   dp-backend  Daily Push backend (:3001)
#   dp-frontend Daily Push frontend (:5173)
#
# Options:
#   --env ENV   Environment: dev (default) | qa | prod  [Topic Engine only]
#   -h, --help  Show this help
# =============================================================================

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TE="$ROOT/topic-engine"
DP="$ROOT/daily-push"
DP_BACKEND="$DP/packages/backend"
LOGS="$ROOT/.logs"
PIDS="$ROOT/.pids"

mkdir -p "$LOGS" "$PIDS"

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()    { echo -e "${GREEN}  ✓${RESET}  $*"; }
info()   { echo -e "${BLUE}  →${RESET}  $*"; }
warn()   { echo -e "${YELLOW}  ⚠${RESET}  $*"; }
err()    { echo -e "${RED}  ✗${RESET}  $*" >&2; }
header() { echo -e "\n${BOLD}${CYAN}━━  $*  ━━${RESET}"; }
dim()    { echo -e "\033[2m  $*${RESET}"; }

# ─── Parse args ───────────────────────────────────────────────────────────────
ENV="dev"
COMMAND=""
SERVICES=()

for arg in "$@"; do
  case "$arg" in
    --env=*) ENV="${arg#--env=}" ;;
  esac
done

i=0
args=("$@")
while [[ $i -lt ${#args[@]} ]]; do
  arg="${args[$i]}"
  case "$arg" in
    start|stop|reset|status|migrate|seed|logs)
      COMMAND="$arg"; i=$((i + 1)) ;;
    --env|-e)
      ENV="${args[$((i+1))]}"; i=$((i + 2)) ;;
    --env=*) i=$((i + 1)) ;;
    -h|--help)
      sed -n '3,30p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    *)
      SERVICES+=("$arg"); i=$((i + 1)) ;;
  esac
done

# Default services to "all" for start/stop
if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=("all")
fi

# ─── Topic Engine compose wrapper ─────────────────────────────────────────────
te_compose() {
  local env_file overlay compose_args=(-f docker-compose.yml)
  case "$ENV" in
    dev)  env_file=".env.dev";  overlay="docker-compose.dev.yml" ;;
    qa)   env_file=".env.qa";   overlay="docker-compose.qa.yml" ;;
    prod) env_file=".env.prod"; overlay="docker-compose.prod.yml" ;;
    *)    err "Unknown env: $ENV (use dev, qa, prod)"; exit 1 ;;
  esac

  # Only include overlay if it exists
  [[ -f "$TE/$overlay" ]] && compose_args+=(-f "$overlay")
  # Only include env-file if it exists
  [[ -f "$TE/$env_file" ]] && compose_args+=(--env-file "$env_file")

  (cd "$TE" && docker compose "${compose_args[@]}" "$@")
}

# ─── PID helpers ──────────────────────────────────────────────────────────────
pid_file()  { echo "$PIDS/$1.pid"; }
log_file()  { echo "$LOGS/$1.log"; }

is_running() {
  local pf; pf="$(pid_file "$1")"
  [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null
}

run_bg() {
  local name="$1"; shift
  local lf; lf="$(log_file "$name")"
  local pf; pf="$(pid_file "$name")"

  if is_running "$name"; then
    warn "$name is already running (PID $(cat "$pf"))"
    return
  fi

  nohup "$@" > "$lf" 2>&1 &
  echo $! > "$pf"
  log "$name started  $(dim_inline "PID $! · logs: .logs/$name.log")"
}

dim_inline() { echo -e "\033[2m$*${RESET}"; }

# Returns the Windows PID for a given Cygwin/MSYS PID (column 4 of ps output).
get_winpid() { ps -p "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }

stop_svc() {
  local name="$1"
  local pf; pf="$(pid_file "$name")"
  if is_running "$name"; then
    local pid; pid=$(cat "$pf")

    # On Windows/Git Bash, killing only the Cygwin bash PID leaves npm → ts-node-dev → node
    # alive as Windows orphans that keep holding their ports.
    # taskkill /T /F kills the entire Windows process tree atomically before any orphaning occurs.
    local winpid; winpid=$(get_winpid "$pid")
    if [[ -n "$winpid" ]] && command -v taskkill >/dev/null 2>&1; then
      MSYS_NO_PATHCONV=1 taskkill /PID "$winpid" /T /F >/dev/null 2>&1 || true
    else
      kill "$pid" 2>/dev/null || true
    fi

    # Wait up to 5 s for the Cygwin PID to die (confirms OS released the port).
    local i=0
    while kill -0 "$pid" 2>/dev/null && [[ $i -lt 20 ]]; do
      sleep 0.25
      i=$((i + 1))
    done
    rm -f "$pf"
    log "$name stopped"
  else
    dim "  $name was not running"
  fi
}

wait_healthy() {
  local label="$1"; shift
  local max=30 i=0
  info "Waiting for $label to be ready..."
  until "$@" &>/dev/null; do
    i=$((i + 1))
    [[ $i -ge $max ]] && { err "$label did not become healthy in time"; exit 1; }
    sleep 1
  done
  log "$label is ready"
}

# ─── Individual service actions ───────────────────────────────────────────────

start_te_infra() {
  header "Topic Engine infra  [env: $ENV]"
  te_compose up -d
  wait_healthy "Topic Engine Postgres" \
    docker exec te-postgres-dev pg_isready -U topic_engine -d topic_engine_dev
  log "Postgres :5433  ·  Redis :6379"
}

stop_te_infra() {
  header "Stopping Topic Engine infra"
  te_compose down
  log "Containers stopped"
}

start_te_api() {
  header "Topic Engine API"
  run_bg "te-api" bash -c "cd '$TE' && npm run dev --workspace=@topic-engine/api"
  dim "  http://localhost:3000"
}

stop_te_api() { stop_svc "te-api"; }

start_te_workers() {
  header "Topic Engine workers"
  run_bg "te-workers" bash -c "cd '$TE' && npm run start --workspace=@topic-engine/workers"
}

stop_te_workers() { stop_svc "te-workers"; }

start_dp_infra() {
  header "Daily Push infra"
  (cd "$DP" && docker compose up -d)
  wait_healthy "Daily Push Postgres" \
    docker exec daily-push-postgres pg_isready -U daily_push_user -d daily_push_v2
  wait_healthy "Daily Push MongoDB" \
    docker exec daily-push-mongo mongosh --eval "db.adminCommand('ping')" --quiet
  log "Postgres :5434  ·  MongoDB :27017"
}

stop_dp_infra() {
  header "Stopping Daily Push infra"
  (cd "$DP" && docker compose down)
  log "Containers stopped"
}

start_dp_backend() {
  header "Daily Push backend"
  run_bg "dp-backend" bash -c "cd '$DP' && npm run dev:backend"
  dim "  http://localhost:3001"
}

stop_dp_backend() { stop_svc "dp-backend"; }

start_dp_frontend() {
  header "Daily Push frontend"
  run_bg "dp-frontend" bash -c "cd '$DP' && npm run dev:frontend"
  dim "  http://localhost:5173"
}

stop_dp_frontend() { stop_svc "dp-frontend"; }

# ─── Migrate ──────────────────────────────────────────────────────────────────
do_migrate() {
  header "Running migrations"

  info "Topic Engine..."
  local pg_url
  pg_url="$(grep '^POSTGRES_' "$TE/.env.dev" | \
    awk -F= 'BEGIN{u="";p="";d="";h="localhost:5433"}
    /POSTGRES_USER/{u=$2} /POSTGRES_PASSWORD/{p=$2} /POSTGRES_DB/{d=$2}
    END{print "postgresql://"u":"p"@"h"/"d}')"
  (cd "$TE" && DATABASE_URL="$pg_url" npm run migrate --workspace=@topic-engine/db)
  log "Topic Engine migrations done"

  info "Daily Push..."
  (cd "$DP_BACKEND" && npm run migrate)
  log "Daily Push migrations done"
}

# ─── Seed ────────────────────────────────────────────────────────────────────
do_seed() {
  header "Seeding Daily Push knowledge base"
  (cd "$DP_BACKEND" && npm run seed)
  log "Seed complete"
}

# ─── Reset ───────────────────────────────────────────────────────────────────
do_reset() {
  header "Fresh Reset"
  echo -e "${YELLOW}  This will wipe ALL user data from Daily Push (Postgres + MongoDB).${RESET}"
  echo -e "${YELLOW}  Seeded knowledge base data will be preserved.${RESET}\n"
  read -rp "  Type 'yes' to continue: " confirm
  [[ "$confirm" != "yes" ]] && { echo "  Aborted."; exit 0; }

  (cd "$DP_BACKEND" && npm run reset)
}

# ─── Status ───────────────────────────────────────────────────────────────────
do_status() {
  header "Service Status"

  # Docker containers
  echo -e "\n  ${BOLD}Docker containers${RESET}"
  for container in te-postgres-dev te-redis-dev daily-push-postgres daily-push-mongo; do
    local state
    state=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "not found")
    if [[ "$state" == "running" ]]; then
      echo -e "  ${GREEN}●${RESET}  $container  ${GREEN}running${RESET}"
    else
      echo -e "  ${RED}○${RESET}  $container  ${RED}$state${RESET}"
    fi
  done

  # Background processes
  echo -e "\n  ${BOLD}Background processes${RESET}"
  for svc in te-api te-workers dp-backend dp-frontend; do
    if is_running "$svc"; then
      echo -e "  ${GREEN}●${RESET}  $svc  ${GREEN}running${RESET}  $(dim_inline "PID $(cat "$(pid_file "$svc")")")"
    else
      echo -e "  ${RED}○${RESET}  $svc  ${RED}stopped${RESET}"
    fi
  done

  # Port summary
  echo -e "\n  ${BOLD}Ports${RESET}"
  for port in 5433 5434 6379 27017 3000 3001 5173; do
    if nc -z localhost "$port" 2>/dev/null; then
      echo -e "  ${GREEN}●${RESET}  :$port  ${GREEN}open${RESET}"
    else
      echo -e "  ${RED}○${RESET}  :$port  ${RED}closed${RESET}"
    fi
  done
  echo ""
}

# ─── Logs ────────────────────────────────────────────────────────────────────
do_logs() {
  local svc="${SERVICES[0]:-}"
  if [[ -z "$svc" || "$svc" == "all" ]]; then
    err "Specify a service: te-api, te-workers, dp-backend, dp-frontend"
    exit 1
  fi
  local lf; lf="$(log_file "$svc")"
  if [[ ! -f "$lf" ]]; then
    err "No log file found for $svc (has it been started?)"; exit 1
  fi
  tail -f "$lf"
}

# ─── Service dispatcher ───────────────────────────────────────────────────────
resolve_services() {
  local action="$1"; shift   # "start" or "stop"
  local -a svcs=("$@")

  # Expand aliases
  local -a expanded=()
  for s in "${svcs[@]}"; do
    case "$s" in
      all) expanded+=(te-infra te-api te-workers dp-infra dp-backend dp-frontend) ;;
      te)  expanded+=(te-infra te-api te-workers) ;;
      dp)  expanded+=(dp-infra dp-backend dp-frontend) ;;
      *)   expanded+=("$s") ;;
    esac
  done

  # Deduplicate while preserving order
  local seen=()
  local -a unique=()
  for s in "${expanded[@]}"; do
    if [[ ! " ${seen[*]} " =~ " $s " ]]; then
      seen+=("$s"); unique+=("$s")
    fi
  done

  for svc in "${unique[@]}"; do
    case "${action}_${svc}" in
      start_te-infra)    start_te_infra ;;
      start_te-api)      start_te_api ;;
      start_te-workers)  start_te_workers ;;
      start_dp-infra)    start_dp_infra ;;
      start_dp-backend)  start_dp_backend ;;
      start_dp-frontend) start_dp_frontend ;;
      stop_te-infra)     stop_te_infra ;;
      stop_te-api)       stop_te_api ;;
      stop_te-workers)   stop_te_workers ;;
      stop_dp-infra)     stop_dp_infra ;;
      stop_dp-backend)   stop_dp_backend ;;
      stop_dp-frontend)  stop_dp_frontend ;;
      *)
        err "Unknown service: $svc"
        echo "  Valid: all, te, dp, te-infra, te-api, te-workers, dp-infra, dp-backend, dp-frontend"
        exit 1 ;;
    esac
  done
}

# ─── Interactive menu ──────────────────────────────────────────────────────────
interactive_menu() {
  echo -e "\n${BOLD}${CYAN}  Daily Push — Dev Runner${RESET}\n"

  PS3=$'\n  Choose an action: '
  local options=(
    "Start everything (fresh boot)"
    "Start Topic Engine only"
    "Start Daily Push only"
    "Start specific service"
    "Stop everything"
    "Stop specific service"
    "Fresh reset (wipe user data)"
    "Run migrations"
    "Seed knowledge base"
    "Show status"
    "Tail logs"
    "Exit"
  )

  select opt in "${options[@]}"; do
    case "$opt" in
      "Start everything (fresh boot)")
        select_env
        resolve_services start all
        post_start_summary
        break ;;
      "Start Topic Engine only")
        select_env
        resolve_services start te
        break ;;
      "Start Daily Push only")
        resolve_services start dp
        break ;;
      "Start specific service")
        pick_service start
        break ;;
      "Stop everything")
        resolve_services stop all
        break ;;
      "Stop specific service")
        pick_service stop
        break ;;
      "Fresh reset (wipe user data)")
        do_reset
        break ;;
      "Run migrations")
        do_migrate
        break ;;
      "Seed knowledge base")
        do_seed
        break ;;
      "Show status")
        do_status
        break ;;
      "Tail logs")
        SERVICES=()
        pick_log_service
        break ;;
      "Exit")
        exit 0 ;;
    esac
  done
}

select_env() {
  echo -e "\n  ${BOLD}Topic Engine environment${RESET}"
  PS3=$'  Select: '
  select e in "dev (local)" "qa" "prod"; do
    case "$e" in
      "dev (local)") ENV="dev"; break ;;
      "qa")          ENV="qa";  break ;;
      "prod")        ENV="prod"; break ;;
    esac
  done
}

pick_service() {
  local action="$1"
  echo -e "\n  ${BOLD}Select service${RESET}"
  PS3=$'  Select: '
  local svcs=(te-infra te-api te-workers dp-infra dp-backend dp-frontend)
  select s in "${svcs[@]}"; do
    [[ -n "$s" ]] && { resolve_services "$action" "$s"; break; }
  done
}

pick_log_service() {
  echo -e "\n  ${BOLD}Select service to tail${RESET}"
  PS3=$'  Select: '
  select s in te-api te-workers dp-backend dp-frontend; do
    [[ -n "$s" ]] && { SERVICES=("$s"); do_logs; break; }
  done
}

post_start_summary() {
  echo -e "\n${BOLD}${GREEN}  All services started${RESET}\n"
  echo -e "  ${CYAN}Frontend${RESET}     http://localhost:5173"
  echo -e "  ${CYAN}DP API${RESET}       http://localhost:3001"
  echo -e "  ${CYAN}TE API${RESET}       http://localhost:3000"
  echo -e "\n  Logs: .logs/  ·  PIDs: .pids/"
  echo -e "  Run ${BOLD}./dev.sh status${RESET} to check health\n"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  case "$COMMAND" in
    start)
      [[ "$ENV" != "dev" ]] && info "Topic Engine env: $ENV"
      resolve_services start "${SERVICES[@]}"
      post_start_summary
      ;;
    stop)
      resolve_services stop "${SERVICES[@]}"
      ;;
    reset)
      do_reset
      ;;
    status)
      do_status
      ;;
    migrate)
      do_migrate
      ;;
    seed)
      do_seed
      ;;
    logs)
      do_logs
      ;;
    "")
      interactive_menu
      ;;
    *)
      err "Unknown command: $COMMAND"
      echo "  Run ./dev.sh --help for usage"
      exit 1
      ;;
  esac
}

main
