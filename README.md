# Daily Push — Development Workspace

Personal upskilling OS. Describe a goal in free text → system infers what to learn → builds a prerequisite graph → delivers one focused session per day → tracks retention via spaced repetition.

---

## Repository Structure

```
HELP/
├── dev.sh                    ← unified dev runner (start/stop/reset/migrate/seed)
├── daily-push/               ← main application
│   ├── packages/backend/     ← Express API (port 3001)
│   └── packages/frontend/   ← React + Vite (port 5173)
└── topic-engine/             ← prerequisite graph decomposition engine
    ├── packages/api/         ← Express API (port 3000)
    ├── packages/core/        ← pipeline: decompose → critique → patch
    ├── packages/workers/     ← BullMQ background jobs
    └── packages/db/          ← PostgreSQL schema + migrations
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | latest | PostgreSQL, MongoDB, Redis containers |
| Node.js | ≥ 20 | Backend + frontend dev servers |
| npm | ≥ 10 | Package management |
| Make | any | Topic Engine shortcuts |
| bash | ≥ 4 | dev.sh script (Git Bash on Windows) |

---

## Quick Start (Fresh Setup)

```bash
# 1. Clone and enter workspace
cd HELP

# 2. Copy environment files
cp daily-push/.env.example daily-push/.env
cp topic-engine/.env.example topic-engine/.env
# → Fill in ANTHROPIC_API_KEY and any other secrets

# 3. Start infrastructure (Docker containers)
./dev.sh start te-infra      # Topic Engine: Postgres :5433 + Redis :6379
./dev.sh start dp-infra      # Daily Push:   Postgres :5434 + MongoDB :27017

# 4. Run migrations
./dev.sh migrate             # creates all tables + schema

# 5. Seed knowledge base
./dev.sh seed                # loads 10 goal profiles + skill assessment bank

# 6. Start all app servers
./dev.sh start all
```

Frontend opens at **http://localhost:5173**

---

## dev.sh — Command Reference

Run with no arguments for an interactive menu:

```bash
./dev.sh
```

### Commands

| Command | Description |
|---------|-------------|
| `./dev.sh start [services]` | Start one or more services |
| `./dev.sh stop [services]` | Stop one or more services |
| `./dev.sh reset` | Wipe all user data, preserve seeded knowledge base |
| `./dev.sh status` | Show running services and their PIDs |
| `./dev.sh migrate` | Run Daily Push DB migrations (idempotent) |
| `./dev.sh seed` | Seed goal profiles + skill bank into MongoDB |
| `./dev.sh logs [service]` | Tail logs for a service |
| `./dev.sh --help` | Show full usage |

### Service Names

| Service | What it starts | Ports |
|---------|---------------|-------|
| `all` | Everything | all ports |
| `te` | All Topic Engine services | 3000, 5433, 6379 |
| `dp` | All Daily Push services | 3001, 5173, 5434, 27017 |
| `te-infra` | Topic Engine Docker containers | 5433 (Postgres), 6379 (Redis) |
| `te-api` | Topic Engine API server | 3000 |
| `te-workers` | Topic Engine BullMQ workers | — |
| `dp-infra` | Daily Push Docker containers | 5434 (Postgres), 27017 (MongoDB) |
| `dp-backend` | Daily Push Express API | 3001 |
| `dp-frontend` | Daily Push React/Vite app | 5173 |

### Options

```bash
./dev.sh start te --env dev    # dev environment (default)
./dev.sh start te --env qa     # qa environment
./dev.sh start te --env prod   # production environment
```

`--env` only affects Topic Engine (selects docker-compose overlay file).

---

## Environment Variables

### Daily Push (`daily-push/.env`)

```env
POSTGRES_URL=postgresql://daily_push_user:daily_push_pass@localhost:5434/daily_push_v2
MONGO_URL=mongodb://localhost:27017/daily_push_v2
JWT_SECRET=your-secret-here
ANTHROPIC_API_KEY=sk-ant-...
TOPIC_ENGINE_URL=http://localhost:3000
RESEND_API_KEY=               # optional — weekly email digests
```

### Topic Engine (`topic-engine/.env`)

```env
DATABASE_URL=postgresql://topic_engine:topic_engine@localhost:5433/topic_engine_dev
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_URL=http://localhost:11434   # optional — local LLM scoring
```

---

## Databases

| Database | Port | Used by | Managed via |
|----------|------|---------|-------------|
| PostgreSQL (Daily Push) | 5434 | users, nodes, sessions, SR queue | Docker Compose |
| MongoDB (Daily Push) | 27017 | goals, knowledge base, reflections | Docker Compose |
| PostgreSQL (Topic Engine) | 5433 | decomposition jobs, graph results | Docker Compose |
| Redis | 6379 | BullMQ job queue (Topic Engine) | Docker Compose |

---

## Fresh Reset (Wipe User Data)

To discard all user data while keeping the seeded knowledge base:

```bash
./dev.sh reset
```

This truncates all user-linked PostgreSQL tables and clears user MongoDB collections. It preserves `goal_profiles` (seeded) and `skill_assessment_bank`.

To wipe everything including the schema (e.g. after deleting Docker volumes):

```bash
./dev.sh start dp-infra       # bring containers back up
./dev.sh migrate              # recreate schema
./dev.sh seed                 # reload knowledge base
```

---

## Service URLs

| Service | URL |
|---------|-----|
| Daily Push frontend | http://localhost:5173 |
| Daily Push API | http://localhost:3001 |
| Daily Push health | http://localhost:3001/health |
| Topic Engine API | http://localhost:3000 |

---

## Logs

Logs are written to `.logs/` in the workspace root:

```bash
./dev.sh logs dp-backend      # tail Daily Push backend
./dev.sh logs dp-frontend     # tail Daily Push frontend
./dev.sh logs te-api          # tail Topic Engine API
./dev.sh logs te-workers      # tail BullMQ workers
```

PID files are stored in `.pids/` for process tracking.
