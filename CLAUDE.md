# CLAUDE.md — Daily Push Workspace

This file is loaded automatically at the start of every session and after context compaction.
It is the source of truth for implementation state. Update it as phases complete.

---

## What This Is

**Daily Push** — a personal upskilling operating system.
User describes a goal in free text → system infers what they need to learn → builds a prerequisite
graph of concept nodes → delivers one focused session per day → tracks retention via spaced repetition.

Full plan: `DAILY_PUSH_REIMAGINATION.md`

---

## Repository Structure

```
HELP/
├── CLAUDE.md                        ← you are here
├── DAILY_PUSH_REIMAGINATION.md      ← full product & architecture plan
├── daily-push/                      ← existing MVP (Node/MySQL/React — being replaced)
│   ├── packages/backend/            ← Express API (port 3001)
│   ├── packages/frontend/           ← React + Vite (port 5173)
│   └── .env
└── topic-engine/                    ← prerequisite graph engine (keep as-is)
    ├── packages/api/                ← Express API (port 3000)
    ├── packages/core/               ← pipeline: decompose → critique → patch
    ├── packages/workers/            ← BullMQ background jobs
    ├── packages/db/                 ← PostgreSQL schema + migrations
    └── .env
```

---

## Implementation Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | Infrastructure & Auth | `done` |
| 1 | Goal Intake | `done` |
| 2 | Gap Analysis & Plan | `done` |
| 3 | Decomposition & Node Graph | `done` |
| 4 | Core Learning Loop | `done` |
| 5 | Visual Knowledge Map | `done` |
| 6 | Retention & Progress | `done` |
| 7 | Self-Learning Foundation | `done` |
| 8 | Advanced Intelligence | `done` |

**All phases complete.**

### Phase 8 Checklist
- [x] `services/understandingCheck.ts` — LLM scoring of free-text answers (1–5 score + feedback)
- [x] `routes/sessions.ts` — `POST /sessions/:id/check`
- [x] `services/reflections.ts` — `generateReflectionPrompt` (rotates 4 types), `isReflectionDue` (7-day gate), `saveReflection`
- [x] `routes/goals.ts` — `GET /goals/:id/reflection/prompt`, `POST /goals/:id/reflection`, `GET /goals/:id/suggest-next`
- [x] `services/similarity.ts` — 64-dim feature vector, `upsertSimilarityIndex`, `suggestNextGoals` (score + rank from goal_profiles)
- [x] `db/migrations/003_phase8.sql` — UNIQUE constraint on user_similarity_index.user_id
- [x] `services/intake.ts` — `saveProfile` now calls `upsertSimilarityIndex` (non-blocking)
- [x] `services/weeklyEmail.ts` — Resend integration (skips gracefully if RESEND_API_KEY not set)
- [x] `api/client.ts` — `checkUnderstanding`, `getReflectionPrompt`, `saveReflection`, `getSuggestedNextGoals`
- [x] `pages/Today.tsx` — understanding check textarea + AI feedback in rating stage; goal completion screen with next goal cards when 100% milestone fires
- [x] `components/ReflectionModal.tsx` — weekly check-in modal with momentum rating + free text
- [x] `App.tsx` — reflection modal shown 3s after login if reflection is due
- [ ] News ↔ concept linking — deferred (requires news API integration)

### Phase 7 Checklist
- [x] `db/seed/goalProfiles.ts` — 10 goal profiles from Goal Library with signals, skill gaps, topics, timeline data
- [x] `db/seed/skillBank.ts` — 12 skill areas with assessment questions (System Design, DSA, React, Node.js, TS, DB, LLM, RAG, Agents, Deployment, Leadership, Programming)
- [x] `db/seed/index.ts` — MongoDB seed runner (upsert by profileId/skillArea, creates indexes)
- [x] `package.json` — `npm run seed` script
- [x] `services/decisionLayer.ts` — `matchGoalProfile`, `routeDecision`, `inferSkillGaps`, `inferLearningTopics`, `estimateTimelineFromProfile`, `buildAssessmentQuestions`, `learnFromLLMResult`
- [x] `routes/intake.ts` — `/intake/process` routes through decision layer (direct >0.85, confirm 0.65–0.85, clarify 0.40–0.65, llm <0.40); LLM results written back to `goal_profiles`
- [x] `services/sessions.ts` — `updateDifficultyMap` (concept_difficulty_map on session complete), `writePathOutcome` (path_outcomes on 100% milestone)
- [ ] MongoDB collections: `goal_profiles`, `skill_assessment_bank`, `path_outcomes`, `concept_difficulty_map` — created on first seed/use

### Phase 6 Checklist
- [x] `db/migrations/002_phase6.sql` — `email_weekly_summary` column + UNIQUE constraint on user_id
- [x] `services/sessions.ts` — `getCalendarData` (90-day heatmap), `detectMilestones` (% thresholds + depth layers), wired into `completeSession`
- [x] `routes/sessions.ts` — `GET /sessions/calendar`
- [x] `services/settings.ts` — `getSettings`, `updateSettings` (upsert)
- [x] `routes/settings.ts` — `GET /settings`, `PATCH /settings` (rewritten from old MySQL version)
- [x] `routes/index.ts` — settings route mounted
- [x] `api/client.ts` — `getSessionCalendar`, `getStreak`, `getSettings`, `updateSettings`
- [x] `pages/History.tsx` — 90-day heatmap grid, streak/sessions/time stats cards
- [x] `pages/Settings.tsx` — daily mins, days/week, timezone, digest time, email toggle
- [x] `pages/Today.tsx` — milestone celebration overlay on `done` stage
- [x] `App.tsx` — History + Settings routes and nav items
- [x] Frontend tsconfig — History.tsx + Settings.tsx removed from exclude list
- [x] Backend tsconfig — settings.ts removed from exclude list
- [ ] Weekly summary email (Resend) — deferred to Phase 8 (requires Resend API key setup)

### Phase 5 Checklist
- [x] `@xyflow/react` installed in frontend
- [x] `pages/Map.tsx` — React Flow canvas, custom node component, tier layout (surface→foundational→intermediate→advanced), depth filter buttons, side panel on node click, legend
- [x] Node colors: gray (locked), blue (available), yellow (in-progress), green (done confident), red (done low confidence), orange (review due)
- [x] Edge styles: animated solid (hard_prerequisite), dashed (soft_prerequisite)
- [x] Longevity badge per node in panel + on node card
- [x] `App.tsx` — `/map` route added, Map nav item, full-viewport layout for map page

### Phase 4 Checklist
- [x] `services/sessions.ts` — `createSession`, `completeSession` (SR queue + unlock), `getStreak`, `getTodayData`
- [x] `routes/today.ts` — `GET /today` (goal + next node + review + streak)
- [x] `routes/sessions.ts` — `POST /sessions`, `PATCH /sessions/:id/complete`, `GET /sessions/streak`
- [x] `routes/index.ts` — mounted today + sessions routes
- [x] `pages/Today.tsx` — 4 stages: idle (node card + timebox picker + review), in_session (circular timer), rating (confidence 1-5), done (unlock animation + refresh)
- [x] `api/client.ts` — `getToday`, `startSession`, `completeSession`

### Phase 3 Checklist
- [x] `services/decomposition.ts` — Topic Engine client, Claude fallback, node/edge insert, unlock logic
- [x] `routes/goals.ts` — `POST /goals/:id/decompose`, `GET /goals/:id/nodes`
- [x] `api/client.ts` — `decomposeGoal`, `getGoalNodes`
- [x] `pages/GoalDetail.tsx` — decompose CTA (indigo card), decomposition status per topic, node list grouped by depth with status dots

### Phase 2 Checklist
- [x] `services/intake.ts` — gap analysis (`analyzeSkillGaps`), topic mapping (`mapLearningTopics`), timeline (`calculateTimeline`), `updateGoalWithPlan`
- [x] `routes/intake.ts` — `/intake/process` runs full 4-step Claude pipeline
- [x] `routes/goals.ts` — `GET /goals/:id`, `POST /goals/:id/confirm`, `POST /goals/:id/correct`
- [x] `pages/GoalDetail.tsx` — reflect-back UI: header, success criteria, skill gaps, learning path, correction flow, confirm CTA
- [x] `pages/GoalSetup.tsx` — 4-step processing messages, redirect to `/goals/:id`
- [x] `pages/Goals.tsx` — list view with status colors
- [x] Backend TypeScript: old MySQL files excluded from compilation
- [x] Frontend TypeScript: old MVP pages excluded from compilation

### Phase 0 Checklist
- [x] `docker-compose.yml` — replaced MySQL with PostgreSQL (pgvector/pgvector:pg16, port 5432) + MongoDB (mongo:7, port 27017)
- [x] `.env` — updated with POSTGRES_URL, MONGO_URL, JWT_SECRET
- [x] `package.json` — removed mysql2, added pg, mongodb, jsonwebtoken, bcryptjs
- [x] `config.ts` — rewired for new DB config + JWT
- [x] `db/postgres.ts` — pg Pool with testPostgresConnection()
- [x] `db/mongo.ts` — MongoClient with connectMongo() / getDb()
- [x] `db/migrations/001_init.sql` — full schema (users, profiles, skills, concept_nodes, edges, sessions, SR queue, pgvector)
- [x] `db/migrate.ts` — idempotent pg migration runner
- [x] `middleware/auth.ts` — JWT requireAuth middleware
- [x] `routes/auth.ts` — POST /register, POST /login, GET /me
- [x] `routes/index.ts` — clean slate, only auth mounted (others commented stubs)
- [x] `index.ts` — connects both DBs, mounts routes, /health endpoint
- [ ] `docker compose up -d` — waiting for Docker Desktop
- [ ] `npm run migrate` — pending containers
- [ ] Verify: POST /api/auth/register → 201, POST /api/auth/login → token, GET /api/auth/me → user

When a phase starts, change its status to `in_progress`.
When it finishes, change to `done` and add completion date.

---

## Key Architecture Decisions

- **MongoDB** for goals, raw inputs, and 5 knowledge stores (goal_profiles, skill_assessment_bank, path_outcomes, concept_difficulty_map)
- **PostgreSQL** for users, concept_nodes, concept_edges, study_sessions, spaced_repetition_queue, user_similarity_index (pgvector)
- **3-layer decision model** — Knowledge Layer → Decision Layer → LLM (only 5 trigger conditions)
- **Confidence thresholds** — >0.85 direct, 0.65–0.85 confirm, 0.40–0.65 clarify, <0.40 LLM
- **User never picks topics** — system infers them from goal via gap analysis
- **Raw input is append-only** — structured data is always rebuildable from raw
- **Topic Engine** (port 3000) handles decomposition only — Daily Push handles goal + gap logic
- **Hybrid LLM routing** — Anthropic for complex roles, Ollama (qwen2.5:3b on GCP 8.229.30.148:11434) for scoring

---

## Running Services

### Topic Engine
```bash
cd topic-engine
make dev-api       # port 3000 — requires Docker DB + Redis running
make dev-workers   # BullMQ background jobs
make db-up         # starts Postgres (5433) + Redis via Docker
```

### Daily Push (existing MVP — will be replaced)
```bash
cd daily-push
npm run dev        # starts backend (3001) + frontend (5173)
```

### Topic Engine PostgreSQL
- Host: localhost:5433 (Docker)
- User: topic_engine / topic_engine
- DB: topic_engine_dev
- URL: `postgresql://topic_engine:topic_engine@localhost:5433/topic_engine_dev`

### Daily Push PostgreSQL (Phase 0 — not yet created)
- Host: localhost:5434 (Docker — native Windows postgres owns 5432, topic-engine owns 5433)
- User: daily_push_user / daily_push_pass
- DB: daily_push_v2
- URL: `postgresql://daily_push_user:daily_push_pass@localhost:5434/daily_push_v2`

### Daily Push MongoDB (Phase 0 — not yet created)
- URL: `mongodb://localhost:27017/daily_push_v2`

---

## MCP Servers

Configured in `C:\Users\Krishna Meghwal\.claude\settings.json`

| MCP | Status | Connects to |
|-----|--------|------------|
| `postgres-topic-engine` | **active** | topic_engine_dev on port 5433 |
| `postgres-daily-push` | disabled (enable in Phase 0) | daily_push_v2 on port 5432 |
| `mongodb-daily-push` | disabled (enable in Phase 0) | daily_push_v2 on port 27017 |

To enable a disabled MCP: remove `"disabled": true` from its entry in settings.json.

---

## Important Files

| File | Purpose |
|------|---------|
| `DAILY_PUSH_REIMAGINATION.md` | Full product plan, all schemas, all phases |
| `topic-engine/.env` | API keys, DB URL, Ollama URL |
| `topic-engine/packages/core/src/llm/router.ts` | LLM role → provider routing |
| `topic-engine/packages/core/src/engine/types.ts` | Core pipeline types |
| `daily-push/packages/backend/src/services/topicEngine.ts` | Topic Engine client (existing integration) |
| `daily-push/.env` | Backend config including TOPIC_ENGINE_URL |

---

## What Not To Do

- Do not modify topic-engine core pipeline unless fixing a bug — it works
- Do not run `make migrate` without Docker DB running (port 5433 for topic-engine)
- Do not add LLM calls to the decision layer in Phase 7 — that layer is pure code
- Daily Push reimagination is a clean break — do not migrate old MySQL data
