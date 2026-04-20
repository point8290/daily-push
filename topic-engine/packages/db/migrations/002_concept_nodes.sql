-- Topics: one row per decomposition run
CREATE TABLE topics (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Concept nodes: one row per node in a decomposed graph
CREATE TABLE concept_nodes (
  id                    UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id              UUID    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  node_slug             TEXT    NOT NULL,   -- kebab-case ID from LLM (e.g. "event-loop")
  canonical_title       TEXT    NOT NULL,
  description           TEXT    NOT NULL,
  depth_level           TEXT    NOT NULL CHECK (depth_level IN ('surface','foundational','intermediate','advanced','expert')),
  boundary_type         TEXT    NOT NULL CHECK (boundary_type IN ('core','optional_depth','out_of_scope')),
  estimated_mins        INT     NOT NULL CHECK (estimated_mins > 0),
  confidence_overall    FLOAT,              -- L4: 0-1 overall confidence
  confidence_effective  FLOAT,              -- L4: propagated effective confidence
  embedding             vector(1536),       -- L2: text-embedding-3-small output
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (topic_id, node_slug)
);

-- IVFFlat index for fast cosine similarity search (L2 semantic memory)
-- lists=100 is appropriate for datasets up to ~1M rows
CREATE INDEX concept_nodes_embedding_idx
  ON concept_nodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX concept_nodes_topic_id_idx ON concept_nodes (topic_id);
