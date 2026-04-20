-- User behavior events: raw learner interaction log (L6 user behavior)
-- Used by the Bayesian belief updater to adjust edge confidence per learner level.
CREATE TABLE user_behavior_events (
  id            UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT  NOT NULL,
  node_id       UUID  NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  -- start: began studying; complete: finished; skip: skipped;
  -- revisit: returned after completion; stuck: reported difficulty
  event_type    TEXT  NOT NULL CHECK (event_type IN ('start','complete','skip','revisit','stuck')),
  -- free-form context: { prereqsCompleted, timeSpentMins, attemptNumber, ... }
  context       JSONB NOT NULL DEFAULT '{}',
  -- outcome recorded after the fact: { successAtDependent, timeToComplete, ... }
  outcome       JSONB,
  learner_level TEXT  CHECK (learner_level IN ('beginner','intermediate','advanced')),
  -- signal weight: 1.0 standard; higher for direct outcomes
  weight        FLOAT NOT NULL DEFAULT 1.0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_behavior_events_node_id_idx    ON user_behavior_events (node_id);
CREATE INDEX user_behavior_events_user_id_idx    ON user_behavior_events (user_id);
CREATE INDEX user_behavior_events_created_at_idx ON user_behavior_events (created_at DESC);
