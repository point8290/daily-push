CREATE TABLE IF NOT EXISTS product_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id     VARCHAR(24),
  session_id  UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
  event_key   VARCHAR(100) NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_user_created
  ON product_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_goal
  ON product_events(goal_id);

CREATE INDEX IF NOT EXISTS idx_product_events_event_key
  ON product_events(event_key, created_at DESC);
