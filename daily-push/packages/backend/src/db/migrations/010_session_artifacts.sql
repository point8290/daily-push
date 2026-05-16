CREATE TABLE IF NOT EXISTS session_artifacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id         UUID NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  task_type       VARCHAR(32) NOT NULL
                    CHECK (task_type IN ('explain', 'design', 'code', 'apply', 'review')),
  artifact_type   VARCHAR(32) NOT NULL
                    CHECK (artifact_type IN ('text', 'notes', 'plan', 'code')),
  prompt          TEXT NOT NULL,
  instructions    JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  rubric          JSONB NOT NULL DEFAULT '[]'::jsonb,
  content         TEXT,
  status          VARCHAR(32) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'evaluated')),
  score           SMALLINT CHECK (score BETWEEN 1 AND 5),
  feedback        TEXT,
  evaluation      JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_artifacts_user_created
  ON session_artifacts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_artifacts_node_status
  ON session_artifacts(node_id, status);
