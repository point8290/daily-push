ALTER TABLE role_market_profile_versions
  ADD COLUMN IF NOT EXISTS profile_diff JSONB;

CREATE INDEX IF NOT EXISTS idx_role_market_profile_versions_diff_materiality
  ON role_market_profile_versions ((profile_diff->>'materiality'))
  WHERE profile_diff IS NOT NULL;
