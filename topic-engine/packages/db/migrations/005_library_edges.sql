-- Library edges: prerequisite relationships in the cross-topic concept library
-- Edges are confirmed/contested across multiple decompositions.
CREATE TABLE library_edges (
  id                UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_concept_id   UUID  NOT NULL REFERENCES concept_library(id) ON DELETE CASCADE,
  to_concept_id     UUID  NOT NULL REFERENCES concept_library(id) ON DELETE CASCADE,
  edge_type         TEXT  NOT NULL CHECK (edge_type IN ('hard_prerequisite','soft_prerequisite','confusable','leads_to')),
  confirmations     INT   NOT NULL DEFAULT 0,
  contradictions    INT   NOT NULL DEFAULT 0,
  -- confirmed ≥0.85 ratio; probable ≥0.60; contested ≥0.40; likely_wrong <0.40
  status            TEXT  NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','confirmed','contested','likely_wrong')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per (from, to, type) triple — prevents duplicate edge entries
  UNIQUE (from_concept_id, to_concept_id, edge_type)
);

CREATE INDEX library_edges_from_concept_id_idx ON library_edges (from_concept_id);
CREATE INDEX library_edges_to_concept_id_idx   ON library_edges (to_concept_id);
