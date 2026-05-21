CREATE TABLE IF NOT EXISTS user_resume_workspaces (
  user_id                       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  resume_id                     UUID REFERENCES user_resume(id) ON DELETE SET NULL,
  target_role                   VARCHAR(255),
  target_company                VARCHAR(255),
  jd_text                       TEXT,
  parsed_jd                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  resume_summary                JSONB NOT NULL DEFAULT '{}'::jsonb,
  gap_report                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tailored_resume               JSONB NOT NULL DEFAULT '{}'::jsonb,
  tailored_resume_generated_at  TIMESTAMPTZ,
  last_analyzed_at              TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_resume_workspaces_last_analyzed
  ON user_resume_workspaces(last_analyzed_at DESC);
