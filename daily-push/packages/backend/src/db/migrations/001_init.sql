-- Daily Push v2 — Initial Schema
-- Phase 0: users only
-- Remaining tables added in later phases as needed

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────────
-- Phase 0 — Auth
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─────────────────────────────────────────────
-- Phase 1 — User Profile
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles_structured (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Identity
  job_title             VARCHAR(255),
  role_type             VARCHAR(50) CHECK (role_type IN ('engineer','analyst','pm','designer','other')),
  seniority_level       VARCHAR(50) CHECK (seniority_level IN ('junior','mid','senior','staff','lead')),
  years_total           SMALLINT,
  employment_status     VARCHAR(50) CHECK (employment_status IN ('employed','unemployed','freelance','student')),
  primary_stack         JSONB DEFAULT '[]',
  -- Derived metadata
  derived_from          JSONB DEFAULT '[]',  -- array of MongoDB raw input IDs
  derived_at            TIMESTAMPTZ,
  derived_by            VARCHAR(100),        -- model name
  -- Preferences
  available_mins_day    SMALLINT,
  available_days_week   SMALLINT,
  timezone              VARCHAR(100),
  digest_time           TIME,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles_structured(user_id);

CREATE TABLE IF NOT EXISTS user_skills (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name            VARCHAR(255) NOT NULL,
  skill_category        VARCHAR(50) CHECK (skill_category IN ('engineering','tools','soft_skills','domain','ai_native')),
  self_assessed_level   VARCHAR(50) CHECK (self_assessed_level IN ('none','aware','familiar','proficient','expert')),
  verified              BOOLEAN NOT NULL DEFAULT FALSE,
  source                VARCHAR(50) CHECK (source IN ('self_reported','resume_parsed','quiz_verified')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);

CREATE TABLE IF NOT EXISTS user_resume (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text    TEXT NOT NULL,
  parsed_data JSONB,
  parsed_at   TIMESTAMPTZ,
  source      VARCHAR(50) CHECK (source IN ('upload','linkedin_paste','manual'))
);

-- ─────────────────────────────────────────────
-- Phase 3 — Concept Graph
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concept_nodes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id               VARCHAR(24),           -- MongoDB ObjectId
  learning_topic_id     VARCHAR(24),           -- MongoDB ObjectId
  topic_engine_node_id  UUID,
  -- Content
  title                 VARCHAR(500) NOT NULL,
  description           TEXT,
  depth_level           VARCHAR(50) CHECK (depth_level IN ('surface','foundational','intermediate','advanced')),
  boundary_type         VARCHAR(50) CHECK (boundary_type IN ('core','optional_depth')),
  node_type             VARCHAR(50) CHECK (node_type IN ('concept','skill','milestone')),
  estimated_mins        SMALLINT,
  -- Longevity
  longevity             VARCHAR(20) CHECK (longevity IN ('high','medium','low')),
  ai_relationship       VARCHAR(20) CHECK (ai_relationship IN ('amplified','replaced','unaffected')),
  -- Resources
  resources             JSONB DEFAULT '[]',
  -- State
  status                VARCHAR(50) NOT NULL DEFAULT 'locked'
                          CHECK (status IN ('locked','available','in_progress','done','review_due')),
  confidence            SMALLINT CHECK (confidence BETWEEN 1 AND 5),
  last_studied_at       TIMESTAMPTZ,
  next_review_at        TIMESTAMPTZ,
  position              SMALLINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_nodes_user_id ON concept_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_concept_nodes_goal_id ON concept_nodes(goal_id);
CREATE INDEX IF NOT EXISTS idx_concept_nodes_status ON concept_nodes(user_id, status);

CREATE TABLE IF NOT EXISTS concept_edges (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id           VARCHAR(24),
  learning_topic_id VARCHAR(24),
  from_node_id      UUID NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  to_node_id        UUID NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  edge_type         VARCHAR(50) CHECK (edge_type IN ('hard_prerequisite','soft_prerequisite','leads_to'))
);

CREATE INDEX IF NOT EXISTS idx_concept_edges_from ON concept_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_concept_edges_to ON concept_edges(to_node_id);

-- ─────────────────────────────────────────────
-- Phase 4 — Sessions & Spaced Repetition
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS study_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id           UUID NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  session_type      VARCHAR(20) NOT NULL CHECK (session_type IN ('new','review','revisit')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  duration_mins     SMALLINT,
  confidence_before SMALLINT CHECK (confidence_before BETWEEN 1 AND 5),
  confidence_after  SMALLINT CHECK (confidence_after BETWEEN 1 AND 5),
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_node_id ON study_sessions(node_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at ON study_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS spaced_repetition_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id           UUID NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at            TIMESTAMPTZ NOT NULL,
  interval_days     SMALLINT NOT NULL DEFAULT 1,
  repetition_count  SMALLINT NOT NULL DEFAULT 0,
  last_confidence   SMALLINT CHECK (last_confidence BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_sr_queue_user_due ON spaced_repetition_queue(user_id, due_at);

-- ─────────────────────────────────────────────
-- Phase 7 — User Similarity (pgvector)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_similarity_index (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  features      vector(64),
  feature_meta  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
