CREATE TABLE IF NOT EXISTS role_market_normalized_signals (
  id                    VARCHAR(160) PRIMARY KEY,
  source_id             VARCHAR(160) NOT NULL REFERENCES role_market_sources(id) ON DELETE RESTRICT,
  ingestion_run_id      VARCHAR(160) NOT NULL REFERENCES role_market_ingestion_runs(id) ON DELETE RESTRICT,
  raw_document_id       VARCHAR(160) NOT NULL REFERENCES role_market_raw_documents(id) ON DELETE RESTRICT,
  source_document_id    VARCHAR(240) NOT NULL,
  source_ref            JSONB NOT NULL DEFAULT '{}'::jsonb,
  signal_type           VARCHAR(40) NOT NULL
                          CHECK (signal_type IN (
                            'role_demand',
                            'requirement',
                            'skill',
                            'tool',
                            'domain',
                            'seniority',
                            'salary',
                            'remote_policy',
                            'ai_impact',
                            'interview_signal'
                          )),
  canonical_role_id     VARCHAR(160),
  observed_role_title   VARCHAR(500) NOT NULL,
  canonical_skill_id    VARCHAR(160),
  normalized_label      VARCHAR(500) NOT NULL,
  requirement_category  VARCHAR(40),
  requirement_priority  VARCHAR(40),
  seniority_band        VARCHAR(40),
  region                VARCHAR(120),
  signal_value          TEXT NOT NULL,
  keywords              JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_text         TEXT NOT NULL,
  direction             VARCHAR(24) NOT NULL
                          CHECK (direction IN ('increasing', 'stable', 'declining', 'uncertain')),
  observed_at           TIMESTAMPTZ NOT NULL,
  confidence            SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  contract_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_market_normalized_signals_role_observed
  ON role_market_normalized_signals(canonical_role_id, observed_at DESC)
  WHERE canonical_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_market_normalized_signals_type_observed
  ON role_market_normalized_signals(signal_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_normalized_signals_region_type
  ON role_market_normalized_signals(region, signal_type, observed_at DESC)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_market_normalized_signals_raw_document
  ON role_market_normalized_signals(raw_document_id);

CREATE INDEX IF NOT EXISTS idx_role_market_normalized_signals_source_document
  ON role_market_normalized_signals(source_id, source_document_id);

CREATE INDEX IF NOT EXISTS idx_role_market_normalized_signals_skill
  ON role_market_normalized_signals(canonical_skill_id, observed_at DESC)
  WHERE canonical_skill_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS role_market_signal_aggregates (
  id                    VARCHAR(160) PRIMARY KEY,
  role_profile_id       VARCHAR(160) NOT NULL,
  role_title            VARCHAR(500) NOT NULL,
  category              VARCHAR(40) NOT NULL,
  region                VARCHAR(120),
  source_mode           VARCHAR(16) NOT NULL
                          CHECK (source_mode IN ('curated', 'hybrid', 'live')),
  window_start          TIMESTAMPTZ NOT NULL,
  window_end            TIMESTAMPTZ NOT NULL,
  window_days           INTEGER NOT NULL CHECK (window_days > 0),
  sample_size           INTEGER NOT NULL CHECK (sample_size >= 0),
  source_count          INTEGER NOT NULL CHECK (source_count >= 0),
  demand_score          SMALLINT NOT NULL CHECK (demand_score BETWEEN 0 AND 100),
  freshness_score       SMALLINT NOT NULL CHECK (freshness_score BETWEEN 0 AND 100),
  confidence            SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  aggregate_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_refs           JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at          TIMESTAMPTZ NOT NULL,
  contract_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (window_end >= window_start)
);

CREATE INDEX IF NOT EXISTS idx_role_market_signal_aggregates_role_generated
  ON role_market_signal_aggregates(role_profile_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_signal_aggregates_region_generated
  ON role_market_signal_aggregates(region, generated_at DESC)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_market_signal_aggregates_mode_generated
  ON role_market_signal_aggregates(source_mode, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_signal_aggregates_sample_confidence
  ON role_market_signal_aggregates(role_profile_id, sample_size DESC, confidence DESC);
