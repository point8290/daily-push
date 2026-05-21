CREATE TABLE IF NOT EXISTS candidate_evidence_claims (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_key           VARCHAR(120) NOT NULL,
  normalized_claim    TEXT NOT NULL,
  skill_labels        JSONB NOT NULL DEFAULT '[]'::jsonb,
  role_labels         JSONB NOT NULL DEFAULT '[]'::jsonb,
  project_name        VARCHAR(255),
  company_name        VARCHAR(255),
  metric              VARCHAR(255),
  seniority_signal    VARCHAR(16) NOT NULL DEFAULT 'none'
                        CHECK (seniority_signal IN ('none', 'some', 'strong')),
  source_type         VARCHAR(32) NOT NULL
                        CHECK (source_type IN (
                          'resume',
                          'linkedin',
                          'manual',
                          'github',
                          'portfolio',
                          'sprint_artifact',
                          'application_outcome',
                          'user_correction'
                        )),
  source_id           VARCHAR(120),
  source_section      VARCHAR(120),
  original_snippet    TEXT NOT NULL,
  confidence          SMALLINT NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 0 AND 100),
  user_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, claim_key)
);

CREATE INDEX IF NOT EXISTS idx_candidate_evidence_claims_user_updated
  ON candidate_evidence_claims(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_evidence_claims_source
  ON candidate_evidence_claims(user_id, source_type, source_id);

