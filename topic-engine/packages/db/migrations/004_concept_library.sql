-- Concept library: cross-topic canonical concept store (L2 semantic memory)
-- Concepts graduate here once they appear with high confidence across multiple topics.
CREATE TABLE concept_library (
  id               UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_title  TEXT    NOT NULL UNIQUE,
  alt_titles       TEXT[]  NOT NULL DEFAULT '{}',  -- other titles seen for same concept
  description      TEXT    NOT NULL,
  depth_level      TEXT    NOT NULL CHECK (depth_level IN ('surface','foundational','intermediate','advanced','expert')),
  embedding        vector(1536),  -- embed(canonical_title + ' ' + description)
  -- candidate: seen but not confirmed; confirmed: meets promotion thresholds;
  -- contested: conflicting evidence about this concept's scope
  status           TEXT    NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','confirmed','contested')),
  topics_seen      TEXT[]  NOT NULL DEFAULT '{}',  -- topic titles where this concept appeared
  decomps_seen     INT     NOT NULL DEFAULT 0,      -- number of decompositions that included it
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for semantic dedup lookup (L2: ≥0.92 = merge, 0.80-0.92 = flag)
CREATE INDEX concept_library_embedding_idx
  ON concept_library
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
