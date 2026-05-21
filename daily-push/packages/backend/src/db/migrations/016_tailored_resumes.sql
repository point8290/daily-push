ALTER TABLE job_targets
  ADD COLUMN IF NOT EXISTS tailored_resume JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tailored_resume_generated_at TIMESTAMPTZ;
