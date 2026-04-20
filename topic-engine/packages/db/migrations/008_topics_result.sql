-- Add result_json to topics so GET /topics/:id is a single fast query
-- without needing to JOIN concept_nodes + concept_edges back into the graph shape.
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS result_json JSONB,
  ADD COLUMN IF NOT EXISTS user_input  TEXT;
