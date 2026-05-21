CREATE TABLE IF NOT EXISTS candidate_upgrade_plans (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role_id            UUID NOT NULL REFERENCES candidate_target_roles(id) ON DELETE CASCADE,
  readiness_report_id       UUID NOT NULL REFERENCES candidate_role_assessments(id) ON DELETE CASCADE,
  plan_key                  VARCHAR(160) NOT NULL,
  duration_weeks            SMALLINT NOT NULL CHECK (duration_weeks IN (2, 4, 6, 8)),
  weekly_commitment_hours   SMALLINT NOT NULL CHECK (weekly_commitment_hours BETWEEN 1 AND 40),
  plan                      JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_goal_id            VARCHAR(24),
  linked_sprint_id          UUID REFERENCES goal_sprints(id) ON DELETE SET NULL,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_role_id, readiness_report_id, plan_key)
);

CREATE INDEX IF NOT EXISTS idx_candidate_upgrade_plans_target_updated
  ON candidate_upgrade_plans(user_id, target_role_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_upgrade_plans_readiness
  ON candidate_upgrade_plans(readiness_report_id);

