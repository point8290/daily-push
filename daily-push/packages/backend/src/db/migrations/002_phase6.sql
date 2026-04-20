-- Phase 6: add email preference + unique constraint to user_profiles_structured
ALTER TABLE user_profiles_structured
  ADD COLUMN IF NOT EXISTS email_weekly_summary BOOLEAN NOT NULL DEFAULT true;

-- Ensure only one profile row per user (needed for ON CONFLICT upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_structured_user_id_key'
  ) THEN
    ALTER TABLE user_profiles_structured ADD CONSTRAINT user_profiles_structured_user_id_key UNIQUE (user_id);
  END IF;
END$$;
