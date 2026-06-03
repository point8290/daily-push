CREATE TABLE IF NOT EXISTS role_market_profile_versions (
  id                      VARCHAR(160) PRIMARY KEY,
  role_profile_id         VARCHAR(160) NOT NULL,
  version                 INTEGER NOT NULL CHECK (version > 0),
  status                  VARCHAR(24) NOT NULL
                            CHECK (status IN ('draft', 'in_review', 'published', 'rejected', 'archived')),
  source_mode             VARCHAR(16) NOT NULL
                            CHECK (source_mode IN ('curated', 'hybrid', 'live')),
  profile_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  aggregate_id            VARCHAR(160) REFERENCES role_market_signal_aggregates(id) ON DELETE SET NULL,
  previous_version_id     VARCHAR(160) REFERENCES role_market_profile_versions(id) ON DELETE SET NULL,
  source_refs             JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_summary          TEXT NOT NULL,
  validation_result       JSONB,
  created_by              VARCHAR(240) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by             VARCHAR(240),
  reviewed_at             TIMESTAMPTZ,
  published_at            TIMESTAMPTZ,
  rollback_of_version_id  VARCHAR(160) REFERENCES role_market_profile_versions(id) ON DELETE SET NULL,
  contract_meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_profile_id, version),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  CHECK (status <> 'published' OR validation_result IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_market_profile_versions_one_published
  ON role_market_profile_versions(role_profile_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_role_market_profile_versions_role_status
  ON role_market_profile_versions(role_profile_id, status, version DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_profile_versions_aggregate
  ON role_market_profile_versions(aggregate_id)
  WHERE aggregate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_market_profile_versions_published
  ON role_market_profile_versions(role_profile_id, published_at DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS role_market_publish_audit (
  id                  VARCHAR(160) PRIMARY KEY,
  profile_version_id  VARCHAR(160) NOT NULL REFERENCES role_market_profile_versions(id) ON DELETE CASCADE,
  action              VARCHAR(32) NOT NULL
                        CHECK (action IN (
                          'submit_for_review',
                          'approve',
                          'reject',
                          'publish',
                          'rollback',
                          'archive',
                          'request_changes'
                        )),
  actor_user_id       VARCHAR(240) NOT NULL,
  reason              TEXT NOT NULL,
  before_status       VARCHAR(24) NOT NULL
                        CHECK (before_status IN ('draft', 'in_review', 'published', 'rejected', 'archived')),
  after_status        VARCHAR(24) NOT NULL
                        CHECK (after_status IN ('draft', 'in_review', 'published', 'rejected', 'archived')),
  contract_meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_market_publish_audit_profile_created
  ON role_market_publish_audit(profile_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_publish_audit_actor_created
  ON role_market_publish_audit(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_market_publish_audit_action_created
  ON role_market_publish_audit(action, created_at DESC);
