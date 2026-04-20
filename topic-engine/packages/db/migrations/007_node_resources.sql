-- Node resources: external learning materials linked to concept nodes (L5 resource signals)
-- Populated asynchronously by the resource discovery worker.
CREATE TABLE node_resources (
  id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id        UUID  NOT NULL REFERENCES concept_nodes(id) ON DELETE CASCADE,
  url            TEXT  NOT NULL,
  resource_type  TEXT  NOT NULL CHECK (resource_type IN ('article','video','course','docs','paper','github')),
  -- 0-1: how much of the concept does this resource cover?
  coverage_score FLOAT CHECK (coverage_score BETWEEN 0 AND 1),
  -- 0-1: how well does the resource depth match the node's depth_level?
  depth_match    FLOAT CHECK (depth_match BETWEEN 0 AND 1),
  -- 0-1: overall quality (recency, source authority, completeness)
  quality_score  FLOAT CHECK (quality_score BETWEEN 0 AND 1),
  validated_at   TIMESTAMPTZ,  -- NULL = pending validation
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (node_id, url)
);

CREATE INDEX node_resources_node_id_idx ON node_resources (node_id);
