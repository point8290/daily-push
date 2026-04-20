##
## Topic Engine — Makefile
##
## Prerequisites:
##   - Docker Desktop (or Docker Engine + Compose plugin)
##   - Node.js 20+
##   - npm 10+
##   - GNU Make 4+ (must be run from a POSIX shell — Git Bash, WSL, or macOS/Linux terminal)
##
## Installing Make on Windows:
##   Option A — Chocolatey:  choco install make
##   Option B — Winget:      winget install GnuWin32.Make
##   Option C — WSL:         use WSL2 (Ubuntu) and run make from there
##   Then open Git Bash (or WSL) and cd to this directory.
##
## Quick start:
##   1. make setup        # first-time: install deps, start dev infra, run migrations
##   2. make dev          # shows commands to start API + workers locally
##
## Environment targets:
##   Dev  (local app + Docker infra):  make dev-infra-up  →  make dev-api / make dev-workers
##   QA   (full Docker stack):         make qa-up         →  make qa-logs
##   Prod (full Docker stack):         make prod-up       →  make prod-logs
##

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ─── Compose file sets ────────────────────────────────────────────────────────
COMPOSE_BASE  := docker-compose.yml
COMPOSE_DEV   := docker-compose.dev.yml
COMPOSE_QA    := docker-compose.qa.yml
COMPOSE_PROD  := docker-compose.prod.yml

ENV_FILE_DEV  := .env.dev
ENV_FILE_QA   := .env.qa
ENV_FILE_PROD := .env.prod

DC_DEV  := docker compose -f $(COMPOSE_BASE) -f $(COMPOSE_DEV)  --env-file $(ENV_FILE_DEV)
DC_QA   := docker compose -f $(COMPOSE_BASE) -f $(COMPOSE_QA)   --env-file $(ENV_FILE_QA)
DC_PROD := docker compose -f $(COMPOSE_BASE) -f $(COMPOSE_PROD) --env-file $(ENV_FILE_PROD)

# Migration command (runs inside the db package via ts-node)
MIGRATE_CMD := node node_modules/.bin/ts-node \
  --transpile-only \
  --project packages/db/tsconfig.json \
  packages/db/src/migrate.ts

# ─────────────────────────────────────────────────────────────────────────────
# HELP
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "  Topic Engine — available targets"
	@echo ""
	@echo "  SETUP"
	@echo "    make install          Install all npm workspace dependencies"
	@echo "    make setup            First-time: install + start dev infra + migrate"
	@echo ""
	@echo "  DEVELOPMENT  (API/workers run locally; only infra in Docker)"
	@echo "    make dev              Start dev infra and print next steps"
	@echo "    make dev-infra-up     Start Postgres + Redis in Docker (dev)"
	@echo "    make dev-infra-down   Stop dev infra containers"
	@echo "    make dev-api          Run API server locally (ts-node, hot-reload friendly)"
	@echo "    make dev-workers      Run BullMQ workers locally"
	@echo "    make dev-logs         Tail dev infra container logs"
	@echo "    make dev-shell-db     Open psql shell (dev Postgres)"
	@echo "    make dev-shell-redis  Open redis-cli (dev Redis)"
	@echo ""
	@echo "  DATABASE"
	@echo "    make migrate          Apply all pending migrations (uses .env DATABASE_URL)"
	@echo "    make migrate-status   Show which migrations have been applied"
	@echo "    make migrate-fresh    ⚠ Drop + recreate dev DB, then re-migrate"
	@echo ""
	@echo "  QA  (full Docker stack, ports 5433/6380/3001)"
	@echo "    make qa-up            Build images + start QA stack"
	@echo "    make qa-down          Stop and remove QA containers"
	@echo "    make qa-migrate       Run migrations inside QA api container"
	@echo "    make qa-logs          Tail all QA service logs"
	@echo "    make qa-logs-api      Tail QA API logs only"
	@echo "    make qa-logs-workers  Tail QA workers logs only"
	@echo "    make qa-shell-db      Open psql shell (QA Postgres)"
	@echo "    make qa-shell-redis   Open redis-cli (QA Redis)"
	@echo "    make qa-restart-api   Restart only the QA API service"
	@echo ""
	@echo "  PROD  (full Docker stack, ports internal except API :3000)"
	@echo "    make prod-up          Build images + start prod stack (⚠ needs .env.prod filled)"
	@echo "    make prod-down        Stop and remove prod containers"
	@echo "    make prod-migrate     Run migrations inside prod api container"
	@echo "    make prod-logs        Tail all prod service logs (last 100 lines)"
	@echo "    make prod-logs-api    Tail prod API logs only"
	@echo "    make prod-shell-db    Open psql shell (prod Postgres)"
	@echo "    make prod-ps          Show prod container status"
	@echo ""
	@echo "  CODE QUALITY"
	@echo "    make typecheck        Run tsc --noEmit across all packages"
	@echo "    make eval             Run all 8 eval fixtures"
	@echo "    make eval-fixture FIXTURE=<name>   Run a single fixture"
	@echo "      Examples: FIXTURE=node-event-loop  FIXTURE=tcp-ip  FIXTURE=oauth2"
	@echo ""
	@echo "  UTILITIES"
	@echo "    make clean            Remove dist/ dirs and node_modules"
	@echo "    make clean-volumes    ⚠ Remove ALL Docker volumes (destroys data)"
	@echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SETUP
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: install
install:
	npm install

.PHONY: setup
setup: install
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ Created .env from .env.example — fill in your API keys before continuing."; \
	else \
		echo "✓ .env already exists — skipping copy."; \
	fi
	@$(MAKE) dev-infra-up
	@echo "Waiting for Postgres to be ready..."
	@$(DC_DEV) exec -T postgres sh -c 'until pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB; do sleep 1; done'
	@$(MAKE) migrate
	@echo ""
	@echo "✓ Setup complete. Next steps:"
	@echo "   make dev-api        # terminal 1 — API server"
	@echo "   make dev-workers    # terminal 2 — BullMQ workers"

# ─────────────────────────────────────────────────────────────────────────────
# DEVELOPMENT
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: dev
dev: dev-infra-up
	@echo ""
	@echo "✓ Dev infra is up (Postgres :5433, Redis :6379)"
	@echo ""
	@echo "  Open two more terminals and run:"
	@echo "    make dev-api        # Fastify API on :3000"
	@echo "    make dev-workers    # BullMQ workers"
	@echo ""

.PHONY: dev-infra-up
dev-infra-up:
	$(DC_DEV) up -d
	@echo "✓ Dev infra started (Postgres :5433, Redis :6379)"

.PHONY: dev-infra-down
dev-infra-down:
	$(DC_DEV) down

.PHONY: dev-api
dev-api:
	npm run dev --workspace=@topic-engine/api

.PHONY: dev-workers
dev-workers:
	npm run start --workspace=@topic-engine/workers

.PHONY: dev-logs
dev-logs:
	$(DC_DEV) logs -f

.PHONY: dev-shell-db
dev-shell-db:
	$(DC_DEV) exec postgres psql -U topic_engine -d topic_engine_dev

.PHONY: dev-shell-redis
dev-shell-redis:
	$(DC_DEV) exec redis redis-cli

# ─────────────────────────────────────────────────────────────────────────────
# DATABASE MIGRATIONS
# ─────────────────────────────────────────────────────────────────────────────

# Build DATABASE_URL from .env.dev so migrate works even if .env is not fully filled in.
# Environment variables set before the command take precedence over dotenv file loading.
_DEV_DB_URL = $(shell \
	PGDB=$$(grep '^POSTGRES_DB=' $(ENV_FILE_DEV) | cut -d= -f2); \
	PGUSER=$$(grep '^POSTGRES_USER=' $(ENV_FILE_DEV) | cut -d= -f2); \
	PGPASS=$$(grep '^POSTGRES_PASSWORD=' $(ENV_FILE_DEV) | cut -d= -f2); \
	echo "postgresql://$$PGUSER:$$PGPASS@localhost:5433/$$PGDB")

.PHONY: migrate
migrate:
	@echo "Running migrations..."
	DATABASE_URL="$(_DEV_DB_URL)" npm run migrate --workspace=@topic-engine/db
	@echo "✓ Migrations complete"

.PHONY: migrate-status
migrate-status:
	DATABASE_URL="$(_DEV_DB_URL)" npm run migrate --workspace=@topic-engine/db -- status

.PHONY: migrate-fresh
migrate-fresh: _confirm-destructive
	@POSTGRES_DB=$$(grep POSTGRES_DB $(ENV_FILE_DEV) | cut -d= -f2); \
	POSTGRES_USER=$$(grep POSTGRES_USER $(ENV_FILE_DEV) | cut -d= -f2); \
	echo "Dropping and recreating $$POSTGRES_DB..."; \
	$(DC_DEV) exec -T postgres psql -U $$POSTGRES_USER -c \
		"DROP DATABASE IF EXISTS $$POSTGRES_DB; CREATE DATABASE $$POSTGRES_DB;"
	@$(MAKE) migrate

# ─────────────────────────────────────────────────────────────────────────────
# QA
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: qa-up
qa-up: _check-qa-keys
	$(DC_QA) up -d --build
	@echo ""
	@echo "✓ QA stack started"
	@echo "   API:      http://localhost:3001"
	@echo "   Postgres: localhost:5433"
	@echo "   Redis:    localhost:6380"
	@echo ""
	@echo "Run migrations: make qa-migrate"

.PHONY: qa-down
qa-down:
	$(DC_QA) down

.PHONY: qa-migrate
qa-migrate:
	$(DC_QA) run --rm api $(MIGRATE_CMD)

.PHONY: qa-logs
qa-logs:
	$(DC_QA) logs -f

.PHONY: qa-logs-api
qa-logs-api:
	$(DC_QA) logs -f api

.PHONY: qa-logs-workers
qa-logs-workers:
	$(DC_QA) logs -f workers

.PHONY: qa-shell-db
qa-shell-db:
	@POSTGRES_USER=$$(grep POSTGRES_USER $(ENV_FILE_QA) | cut -d= -f2); \
	POSTGRES_DB=$$(grep POSTGRES_DB $(ENV_FILE_QA) | cut -d= -f2); \
	$(DC_QA) exec postgres psql -U $$POSTGRES_USER -d $$POSTGRES_DB

.PHONY: qa-shell-redis
qa-shell-redis:
	$(DC_QA) exec redis redis-cli

.PHONY: qa-restart-api
qa-restart-api:
	$(DC_QA) restart api

.PHONY: qa-ps
qa-ps:
	$(DC_QA) ps

# ─────────────────────────────────────────────────────────────────────────────
# PROD
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: prod-up
prod-up: _check-prod-keys
	$(DC_PROD) up -d --build
	@echo ""
	@echo "✓ Prod stack started"
	@echo "   API: http://localhost:3000"
	@echo ""
	@echo "Run migrations: make prod-migrate"

.PHONY: prod-down
prod-down:
	$(DC_PROD) down

.PHONY: prod-migrate
prod-migrate:
	$(DC_PROD) run --rm api $(MIGRATE_CMD)

.PHONY: prod-logs
prod-logs:
	$(DC_PROD) logs -f --tail=100

.PHONY: prod-logs-api
prod-logs-api:
	$(DC_PROD) logs -f --tail=100 api

.PHONY: prod-shell-db
prod-shell-db:
	@POSTGRES_USER=$$(grep POSTGRES_USER $(ENV_FILE_PROD) | cut -d= -f2); \
	POSTGRES_DB=$$(grep POSTGRES_DB $(ENV_FILE_PROD) | cut -d= -f2); \
	$(DC_PROD) exec postgres psql -U $$POSTGRES_USER -d $$POSTGRES_DB

.PHONY: prod-ps
prod-ps:
	$(DC_PROD) ps

# ─────────────────────────────────────────────────────────────────────────────
# CODE QUALITY
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: typecheck
typecheck:
	@echo "Typechecking all packages..."
	@npm run typecheck
	@echo "✓ All packages typecheck clean"

.PHONY: eval
eval:
	npm run eval

.PHONY: eval-fixture
eval-fixture:
	@test -n "$(FIXTURE)" || \
		(echo "Usage: make eval-fixture FIXTURE=<name>" && \
		 echo "Available fixtures:" && \
		 ls evals/ground-truth/*.json | xargs -n1 basename | sed 's/.json//' | sed 's/^/  /' && \
		 exit 1)
	npm run eval -- --fixture $(FIXTURE)

# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	@echo "Removing dist directories..."
	rm -rf packages/*/dist evals/dist
	@echo "Removing node_modules..."
	rm -rf node_modules packages/*/node_modules evals/node_modules
	@echo "✓ Clean complete. Run 'make install' to reinstall."

.PHONY: clean-volumes
clean-volumes: _confirm-destructive
	@echo "Removing all Docker volumes..."
	$(DC_DEV) down -v  2>/dev/null || true
	$(DC_QA) down -v   2>/dev/null || true
	$(DC_PROD) down -v 2>/dev/null || true
	@echo "✓ All volumes removed"

# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: _confirm-destructive
_confirm-destructive:
	@echo "⚠  This is a destructive operation and cannot be undone."
	@read -p "Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || \
		(echo "Aborted." && exit 1)

.PHONY: _check-qa-keys
_check-qa-keys:
	@ANTHROPIC_KEY=$$(grep ANTHROPIC_API_KEY $(ENV_FILE_QA) | cut -d= -f2); \
	if [ -z "$$ANTHROPIC_KEY" ]; then \
		echo "⚠  ANTHROPIC_API_KEY is not set in $(ENV_FILE_QA)"; \
		echo "   Edit .env.qa and add your key before running qa-up."; \
		exit 1; \
	fi

.PHONY: _check-prod-keys
_check-prod-keys:
	@ANTHROPIC_KEY=$$(grep ANTHROPIC_API_KEY $(ENV_FILE_PROD) | cut -d= -f2); \
	POSTGRES_PASS=$$(grep POSTGRES_PASSWORD $(ENV_FILE_PROD) | cut -d= -f2); \
	CORS=$$(grep CORS_ORIGIN $(ENV_FILE_PROD) | cut -d= -f2); \
	MISSING=""; \
	[ -z "$$ANTHROPIC_KEY" ]  && MISSING="$$MISSING ANTHROPIC_API_KEY"; \
	[ -z "$$POSTGRES_PASS" ]  && MISSING="$$MISSING POSTGRES_PASSWORD"; \
	[ -z "$$CORS" ]           && MISSING="$$MISSING CORS_ORIGIN"; \
	if [ -n "$$MISSING" ]; then \
		echo "⚠  Required vars not set in $(ENV_FILE_PROD):$$MISSING"; \
		echo "   Edit .env.prod before running prod-up."; \
		exit 1; \
	fi
