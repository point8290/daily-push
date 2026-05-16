CREATE TABLE IF NOT EXISTS llm_usage_events (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id            VARCHAR(24),
  feature_key        VARCHAR(120) NOT NULL,
  operation_key      VARCHAR(120) NOT NULL,
  provider           VARCHAR(32) NOT NULL,
  model              VARCHAR(120) NOT NULL,
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  total_tokens       INTEGER,
  estimated_cost_usd NUMERIC(12, 6),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_user_created
  ON llm_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_feature_created
  ON llm_usage_events(feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_goal
  ON llm_usage_events(goal_id);
