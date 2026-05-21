CREATE TABLE IF NOT EXISTS resume_applications (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id                     UUID REFERENCES user_resume(id) ON DELETE SET NULL,
  title                         VARCHAR(255),
  target_role                   VARCHAR(255),
  target_company                VARCHAR(255),
  jd_text                       TEXT NOT NULL,
  parsed_jd                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  resume_summary                JSONB NOT NULL DEFAULT '{}'::jsonb,
  gap_report                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tailored_resume               JSONB NOT NULL DEFAULT '{}'::jsonb,
  tailored_resume_generated_at  TIMESTAMPTZ,
  linked_goal_id                VARCHAR(24),
  linked_sprint_created_at      TIMESTAMPTZ,
  last_analyzed_at              TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_applications_user_created
  ON resume_applications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_applications_linked_goal
  ON resume_applications(user_id, linked_goal_id);
