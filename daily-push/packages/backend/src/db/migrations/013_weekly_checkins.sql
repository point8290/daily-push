CREATE TABLE IF NOT EXISTS weekly_checkins (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id          VARCHAR(24) NOT NULL,
  week_start       DATE NOT NULL,
  confidence       SMALLINT NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  momentum         SMALLINT NOT NULL CHECK (momentum BETWEEN 1 AND 5),
  blockers         JSONB NOT NULL DEFAULT '[]'::jsonb,
  wins             JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes            TEXT,
  recovery_plan    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, goal_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_checkins_user_goal_week
  ON weekly_checkins(user_id, goal_id, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_checkins_week_start
  ON weekly_checkins(week_start DESC);
