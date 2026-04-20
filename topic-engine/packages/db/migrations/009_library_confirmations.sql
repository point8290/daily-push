-- Add confirmations column to concept_library (referenced by writeback.ts but missing from 004)
ALTER TABLE concept_library
  ADD COLUMN IF NOT EXISTS confirmations INT NOT NULL DEFAULT 0;
