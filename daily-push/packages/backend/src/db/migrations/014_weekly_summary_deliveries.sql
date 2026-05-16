CREATE TABLE IF NOT EXISTS weekly_summary_deliveries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id           VARCHAR(24) NOT NULL,
  week_start        DATE NOT NULL,
  delivery_channel  VARCHAR(24) NOT NULL DEFAULT 'email'
                      CHECK (delivery_channel IN ('email')),
  delivery_status   VARCHAR(24) NOT NULL DEFAULT 'processing'
                      CHECK (delivery_status IN ('processing', 'sent', 'failed')),
  timezone          VARCHAR(80) NOT NULL DEFAULT 'UTC',
  digest_time       VARCHAR(16) NOT NULL DEFAULT '08:00',
  subject           TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_summary_deliveries_unique
  ON weekly_summary_deliveries(user_id, goal_id, week_start, delivery_channel);

CREATE INDEX IF NOT EXISTS idx_weekly_summary_deliveries_status
  ON weekly_summary_deliveries(delivery_status, week_start DESC, updated_at DESC);
