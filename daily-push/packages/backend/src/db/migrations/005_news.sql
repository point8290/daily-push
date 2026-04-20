-- News items linked to concept nodes (Phase 8 — News ↔ Concept Linking)

CREATE TABLE IF NOT EXISTS news_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_node_id  UUID REFERENCES concept_nodes(id) ON DELETE CASCADE,
  source           VARCHAR(50)   NOT NULL DEFAULT 'hackernews',
  external_id      VARCHAR(500)  NOT NULL,
  title            VARCHAR(1000) NOT NULL,
  url              VARCHAR(2000) NOT NULL,
  fetched_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ,
  UNIQUE(user_id, external_id)
);

CREATE INDEX IF NOT EXISTS news_items_user_id_idx  ON news_items(user_id);
CREATE INDEX IF NOT EXISTS news_items_node_id_idx  ON news_items(concept_node_id);
CREATE INDEX IF NOT EXISTS news_items_read_at_idx  ON news_items(user_id, read_at);
