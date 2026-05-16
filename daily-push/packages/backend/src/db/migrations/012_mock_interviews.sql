CREATE TABLE IF NOT EXISTS mock_interview_runs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id          VARCHAR(24) NOT NULL,
  mode             VARCHAR(32) NOT NULL
                     CHECK (mode IN ('system_design', 'behavioral', 'project_deep_dive')),
  status           VARCHAR(32) NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  target_role      VARCHAR(255),
  focus_area       VARCHAR(255),
  prompt_context   TEXT,
  opening_prompt   TEXT NOT NULL,
  latest_prompt    TEXT NOT NULL,
  transcript_summary TEXT,
  overall_score    SMALLINT CHECK (overall_score BETWEEN 1 AND 5),
  evaluation       JSONB NOT NULL DEFAULT '{}'::jsonb,
  quota_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mock_interview_runs_user_created
  ON mock_interview_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mock_interview_runs_goal_status
  ON mock_interview_runs(goal_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS mock_interview_turns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id           UUID NOT NULL REFERENCES mock_interview_runs(id) ON DELETE CASCADE,
  turn_index       INTEGER NOT NULL,
  role             VARCHAR(16) NOT NULL
                     CHECK (role IN ('interviewer', 'candidate')),
  content          TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, turn_index, role)
);

CREATE INDEX IF NOT EXISTS idx_mock_interview_turns_run_created
  ON mock_interview_turns(run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS mock_interview_scores (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id           UUID NOT NULL REFERENCES mock_interview_runs(id) ON DELETE CASCADE,
  dimension        VARCHAR(32) NOT NULL,
  score            SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  feedback         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_mock_interview_scores_run
  ON mock_interview_scores(run_id);
