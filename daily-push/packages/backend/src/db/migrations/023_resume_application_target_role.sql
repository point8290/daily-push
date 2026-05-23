ALTER TABLE resume_applications
  ADD COLUMN IF NOT EXISTS target_role_id UUID REFERENCES candidate_target_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resume_applications_target_role
  ON resume_applications(user_id, target_role_id, created_at DESC);
