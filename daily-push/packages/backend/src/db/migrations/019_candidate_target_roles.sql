CREATE TABLE IF NOT EXISTS candidate_target_roles (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_profile_id          VARCHAR(120) NOT NULL,
  title                    VARCHAR(255) NOT NULL,
  status                   VARCHAR(32) NOT NULL DEFAULT 'saved'
                             CHECK (status IN (
                               'saved',
                               'assessed',
                               'upgrade_plan_created',
                               'sprint_active',
                               'paused',
                               'archived'
                             )),
  candidate_input          JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_assessment_id     UUID,
  linked_goal_id           VARCHAR(24),
  linked_sprint_id         UUID REFERENCES goal_sprints(id) ON DELETE SET NULL,
  created_from             VARCHAR(32) NOT NULL DEFAULT 'market_analyzer'
                             CHECK (created_from IN (
                               'market_analyzer',
                               'resume_analysis',
                               'manual',
                               'application_workspace'
                             )),
  client_draft_id          VARCHAR(120),
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_target_roles_user_status
  ON candidate_target_roles(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_target_roles_user_role
  ON candidate_target_roles(user_id, role_profile_id, status);

CREATE INDEX IF NOT EXISTS idx_candidate_target_roles_latest_assessment
  ON candidate_target_roles(latest_assessment_id);

CREATE INDEX IF NOT EXISTS idx_candidate_target_roles_linked_goal
  ON candidate_target_roles(user_id, linked_goal_id);

CREATE INDEX IF NOT EXISTS idx_candidate_target_roles_client_draft
  ON candidate_target_roles(user_id, client_draft_id)
  WHERE client_draft_id IS NOT NULL;
