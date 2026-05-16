CREATE TABLE IF NOT EXISTS goal_sprints (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id                     VARCHAR(24) NOT NULL,
  sprint_type                 VARCHAR(64) NOT NULL,
  target_role                 VARCHAR(255),
  target_company              VARCHAR(255),
  target_date                 DATE,
  weekly_commitment_hours     SMALLINT,
  current_blockers            JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_evidence            JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                      VARCHAR(32) NOT NULL DEFAULT 'planned'
                                CHECK (status IN ('planned', 'on_track', 'at_risk', 'behind', 'complete')),
  risk_score                  SMALLINT,
  completion_score            SMALLINT,
  weekly_target_minutes       SMALLINT,
  recommended_daily_minutes   SMALLINT,
  forecasted_completion_date  DATE,
  buffer_days                 INTEGER,
  next_review_at              TIMESTAMPTZ,
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_sprints_user_status
  ON goal_sprints(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_goal_sprints_target_date
  ON goal_sprints(target_date);
