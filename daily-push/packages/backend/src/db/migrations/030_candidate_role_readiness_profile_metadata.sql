ALTER TABLE candidate_role_assessments
  ADD COLUMN IF NOT EXISTS profile_version_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS profile_source_mode VARCHAR(16)
    CHECK (profile_source_mode IN ('curated', 'hybrid', 'live')),
  ADD COLUMN IF NOT EXISTS profile_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_candidate_role_assessments_profile_version
  ON candidate_role_assessments(profile_version_id)
  WHERE profile_version_id IS NOT NULL;
