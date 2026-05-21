CREATE TABLE IF NOT EXISTS candidate_role_assessments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role_id        UUID NOT NULL REFERENCES candidate_target_roles(id) ON DELETE CASCADE,
  role_profile_id       VARCHAR(120) NOT NULL,
  evidence_profile      JSONB NOT NULL DEFAULT '{}'::jsonb,
  report                JSONB NOT NULL DEFAULT '{}'::jsonb,
  readiness_label       VARCHAR(24) NOT NULL
                          CHECK (readiness_label IN ('early', 'building', 'close', 'ready')),
  verdict               VARCHAR(32) NOT NULL
                          CHECK (verdict IN ('apply_now', 'apply_after_edits', 'upgrade_first')),
  overall_score         SMALLINT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  confidence            SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  generated_by          VARCHAR(64) NOT NULL DEFAULT 'deterministic_v1',
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_role_assessments_target_created
  ON candidate_role_assessments(user_id, target_role_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_role_assessments_role_profile
  ON candidate_role_assessments(role_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_readiness_history (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role_id        UUID NOT NULL REFERENCES candidate_target_roles(id) ON DELETE CASCADE,
  assessment_id         UUID NOT NULL REFERENCES candidate_role_assessments(id) ON DELETE CASCADE,
  overall_score         SMALLINT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  readiness_label       VARCHAR(24) NOT NULL
                          CHECK (readiness_label IN ('early', 'building', 'close', 'ready')),
  verdict               VARCHAR(32) NOT NULL
                          CHECK (verdict IN ('apply_now', 'apply_after_edits', 'upgrade_first')),
  score_breakdown       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_readiness_history_target_created
  ON candidate_readiness_history(user_id, target_role_id, created_at DESC);

