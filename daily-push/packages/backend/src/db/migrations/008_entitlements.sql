CREATE TABLE IF NOT EXISTS entitlements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key       VARCHAR(120) NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  limit_value       INTEGER CHECK (limit_value IS NULL OR limit_value >= 0),
  reset_period      VARCHAR(16)
                      CHECK (reset_period IN ('daily', 'weekly', 'monthly', 'lifetime')),
  source_plan_key   VARCHAR(64) NOT NULL,
  expires_at        TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_enabled
  ON entitlements(user_id, enabled);
