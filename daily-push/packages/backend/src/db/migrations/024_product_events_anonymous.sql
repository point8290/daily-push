ALTER TABLE product_events
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE product_events
  ADD COLUMN IF NOT EXISTS anonymous_id VARCHAR(120);

ALTER TABLE product_events
  ADD CONSTRAINT product_events_actor_check
    CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_product_events_anonymous_created
  ON product_events(anonymous_id, created_at DESC)
  WHERE anonymous_id IS NOT NULL;

