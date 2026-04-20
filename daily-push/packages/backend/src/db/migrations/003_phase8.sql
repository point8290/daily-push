-- Phase 8: unique constraint on user_similarity_index for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_similarity_index_user_id_key'
  ) THEN
    ALTER TABLE user_similarity_index ADD CONSTRAINT user_similarity_index_user_id_key UNIQUE (user_id);
  END IF;
END$$;
