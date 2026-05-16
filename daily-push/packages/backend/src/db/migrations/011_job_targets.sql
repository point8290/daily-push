ALTER TABLE user_resume
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE user_resume
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS job_targets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id           VARCHAR(24) NOT NULL,
  resume_id         UUID REFERENCES user_resume(id) ON DELETE SET NULL,
  target_role       VARCHAR(255),
  target_company    VARCHAR(255),
  jd_text           TEXT,
  parsed_jd         JSONB NOT NULL DEFAULT '{}'::jsonb,
  resume_summary    JSONB NOT NULL DEFAULT '{}'::jsonb,
  gap_report        JSONB NOT NULL DEFAULT '{}'::jsonb,
  repo_url          TEXT,
  repo_summary      JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_analyzed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_job_targets_user_goal
  ON job_targets(user_id, goal_id);

CREATE INDEX IF NOT EXISTS idx_job_targets_last_analyzed
  ON job_targets(last_analyzed_at DESC);
