-- Concept edges: prerequisite relationships within a decomposed graph
CREATE TABLE concept_edges (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id        UUID    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  edge_slug       TEXT    NOT NULL,   -- nanoid from pipeline
  from_node_id    UUID    NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  to_node_id      UUID    NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  edge_type       TEXT    NOT NULL CHECK (edge_type IN ('hard_prerequisite','soft_prerequisite','confusable','leads_to')),
  confidence      FLOAT,              -- L4: edge confidence overall
  -- L6: per-learner-level Bayesian beliefs
  -- Shape: { beginner: {belief, sampleCount}, intermediate: {...}, advanced: {...} }
  belief_by_level JSONB   NOT NULL DEFAULT '{}',
  confirmations   INT     NOT NULL DEFAULT 0,
  contradictions  INT     NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','contested','deprecated')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (topic_id, edge_slug)
);

CREATE INDEX concept_edges_from_node_id_idx ON concept_edges (from_node_id);
CREATE INDEX concept_edges_to_node_id_idx   ON concept_edges (to_node_id);
CREATE INDEX concept_edges_topic_id_idx     ON concept_edges (topic_id);
