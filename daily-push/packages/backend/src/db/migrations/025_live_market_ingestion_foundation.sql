CREATE TABLE IF NOT EXISTS role_market_sources (
  id                    VARCHAR(160) PRIMARY KEY,
  name                  VARCHAR(500) NOT NULL,
  source_type           VARCHAR(40) NOT NULL
                          CHECK (source_type IN (
                            'job_board',
                            'company_career_page',
                            'occupation_taxonomy',
                            'labor_stats',
                            'industry_report',
                            'curated_seed',
                            'outcome_signal'
                          )),
  status                VARCHAR(24) NOT NULL DEFAULT 'disabled'
                          CHECK (status IN ('enabled', 'disabled', 'degraded')),
  source_ref_type       VARCHAR(40) NOT NULL
                          CHECK (source_ref_type IN (
                            'industry_report',
                            'job_post',
                            'company_career_page',
                            'curated_expert',
                            'user_added_jd',
                            'outcome_signal'
                          )),
  base_url              TEXT,
  region                VARCHAR(120),
  auth_mode             VARCHAR(24) NOT NULL DEFAULT 'none'
                          CHECK (auth_mode IN ('none', 'api_key', 'oauth', 'manual_upload')),
  pii_risk_level        VARCHAR(16) NOT NULL DEFAULT 'low'
                          CHECK (pii_risk_level IN ('low', 'medium', 'high')),
  freshness_sla_hours   INTEGER NOT NULL CHECK (freshness_sla_hours > 0),
  owner                 VARCHAR(240),
  notes                 TEXT,
  contract_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_market_sources_status_type
  ON role_market_sources(status, source_type);

CREATE INDEX IF NOT EXISTS idx_role_market_sources_region
  ON role_market_sources(region)
  WHERE region IS NOT NULL;

CREATE TABLE IF NOT EXISTS role_market_ingestion_runs (
  id                      VARCHAR(160) PRIMARY KEY,
  source_id               VARCHAR(160) NOT NULL REFERENCES role_market_sources(id) ON DELETE RESTRICT,
  adapter_name            VARCHAR(240) NOT NULL,
  status                  VARCHAR(24) NOT NULL
                            CHECK (status IN (
                              'queued',
                              'running',
                              'succeeded',
                              'partial',
                              'failed',
                              'cancelled'
                            )),
  requested_by            VARCHAR(24) NOT NULL
                            CHECK (requested_by IN ('scheduler', 'operator', 'test_fixture')),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  documents_discovered    INTEGER NOT NULL DEFAULT 0 CHECK (documents_discovered >= 0),
  documents_created       INTEGER NOT NULL DEFAULT 0 CHECK (documents_created >= 0),
  documents_deduped       INTEGER NOT NULL DEFAULT 0 CHECK (documents_deduped >= 0),
  documents_failed        INTEGER NOT NULL DEFAULT 0 CHECK (documents_failed >= 0),
  config_snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary           TEXT,
  contract_meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_role_market_ingestion_runs_source_started
  ON role_market_ingestion_runs(source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_ingestion_runs_status_started
  ON role_market_ingestion_runs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_ingestion_runs_latest_success
  ON role_market_ingestion_runs(source_id, completed_at DESC)
  WHERE status IN ('succeeded', 'partial');

CREATE TABLE IF NOT EXISTS role_market_raw_documents (
  id                    VARCHAR(160) PRIMARY KEY,
  source_id             VARCHAR(160) NOT NULL REFERENCES role_market_sources(id) ON DELETE RESTRICT,
  ingestion_run_id      VARCHAR(160) NOT NULL REFERENCES role_market_ingestion_runs(id) ON DELETE RESTRICT,
  source_document_id    VARCHAR(240) NOT NULL,
  document_type         VARCHAR(32) NOT NULL
                          CHECK (document_type IN (
                            'job_post',
                            'company_career_page',
                            'industry_report',
                            'occupation_profile',
                            'salary_benchmark',
                            'outcome_signal',
                            'curated_note'
                          )),
  title                 VARCHAR(500) NOT NULL,
  url                   TEXT,
  publisher             VARCHAR(240),
  region                VARCHAR(120),
  published_at          TIMESTAMPTZ,
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key            TEXT NOT NULL,
  checksum              VARCHAR(160) NOT NULL,
  extracted_text        TEXT NOT NULL,
  raw_payload           JSONB,
  source_ref            JSONB NOT NULL DEFAULT '{}'::jsonb,
  contract_meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, source_document_id),
  UNIQUE (source_id, dedupe_key),
  UNIQUE (source_id, checksum)
);

CREATE INDEX IF NOT EXISTS idx_role_market_raw_documents_run
  ON role_market_raw_documents(ingestion_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_raw_documents_source_captured
  ON role_market_raw_documents(source_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_raw_documents_dedupe
  ON role_market_raw_documents(source_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_role_market_raw_documents_region_type
  ON role_market_raw_documents(region, document_type, captured_at DESC)
  WHERE region IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_role_market_raw_document_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'role_market_raw_documents are immutable audit records';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_role_market_raw_document_mutation
  ON role_market_raw_documents;

CREATE TRIGGER trg_prevent_role_market_raw_document_mutation
  BEFORE UPDATE OR DELETE ON role_market_raw_documents
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_market_raw_document_mutation();
