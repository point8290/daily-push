import { query, transaction } from '@topic-engine/db';
import type { RunResult, GraphAnalytics } from '@topic-engine/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredTopic {
  id: string;
  title: string;
  userInput: string;
  createdAt: string;
  result: RunResult;
}

// ─── Save ─────────────────────────────────────────────────────────────────────

/**
 * Persists a pipeline result to PostgreSQL.
 *
 * Writes to three tables in one transaction:
 *   1. topics — full result_json blob for fast reads
 *   2. concept_nodes — normalised rows for L2/L5/L6 lookups
 *   3. concept_edges — normalised rows with confidence + belief_by_level
 *
 * Returns the generated topic UUID.
 */
export async function saveGraph(
  result: RunResult,
  topic: string,
  userInput: string
): Promise<string> {
  return transaction(async (q) => {
    // 1. Insert topic row
    const topicRows = await q(
      `INSERT INTO topics (title, user_input, result_json)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [topic, userInput, JSON.stringify(result)]
    ) as Array<{ id: string }>;

    const topicId = topicRows[0].id;

    // 2. Insert concept nodes
    for (const node of result.graph.nodes) {
      await q(
        `INSERT INTO concept_nodes
           (topic_id, node_slug, canonical_title, description,
            depth_level, boundary_type, estimated_mins,
            confidence_overall, confidence_effective)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          topicId,
          node.id,
          node.title,
          node.description,
          node.depthLevel,
          node.boundaryType,
          node.estimatedMins,
          node.confidence?.overall ?? null,
          node.confidence?.effective ?? null,
        ]
      );
    }

    // 3. Build slug → UUID map for edge insertion
    const nodeRows = await q(
      `SELECT id, node_slug FROM concept_nodes WHERE topic_id = $1`,
      [topicId]
    ) as Array<{ id: string; node_slug: string }>;

    const slugToUUID = new Map(nodeRows.map((r) => [r.node_slug, r.id]));

    // 4. Insert edges (only when both endpoints resolved)
    for (const edge of result.graph.edges) {
      const fromNodeId = slugToUUID.get(edge.fromId);
      const toNodeId   = slugToUUID.get(edge.toId);
      if (!fromNodeId || !toNodeId) continue;

      await q(
        `INSERT INTO concept_edges
           (topic_id, edge_slug, from_node_id, to_node_id,
            edge_type, confidence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          topicId,
          edge.id,
          fromNodeId,
          toNodeId,
          edge.type,
          edge.confidence?.overall ?? null,
        ]
      );
    }

    return topicId;
  });
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Loads a persisted topic by UUID.
 * Reads directly from result_json — no expensive JOINs needed.
 */
export async function loadGraph(topicId: string): Promise<StoredTopic | null> {
  const rows = await query<{
    id: string;
    title: string;
    user_input: string;
    created_at: string;
    result_json: RunResult;
  }>(
    `SELECT id, title, user_input, created_at, result_json
     FROM topics
     WHERE id = $1`,
    [topicId]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: row.id,
    title: row.title,
    userInput: row.user_input,
    createdAt: row.created_at,
    result: row.result_json,
  };
}

/**
 * Loads the analytics (learning paths) for a topic.
 * Parses from the stored result_json.
 */
export async function loadAnalytics(topicId: string): Promise<GraphAnalytics | null> {
  const stored = await loadGraph(topicId);
  return stored?.result.analytics ?? null;
}

/**
 * Returns the concept_nodes UUID for a given topic + node slug.
 * Used by the progress endpoint to record user behavior events.
 */
export async function resolveNodeId(
  topicId: string,
  nodeSlug: string
): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM concept_nodes WHERE topic_id = $1 AND node_slug = $2`,
    [topicId, nodeSlug]
  );
  return rows[0]?.id ?? null;
}
