/**
 * Topic Engine client.
 *
 * Calls the Topic Engine API to decompose a learning topic into a
 * prerequisite graph, then converts the result into Daily Push study items
 * ordered by learning dependency (surface → foundational → intermediate → advanced).
 *
 * Topic Engine must be running at TOPIC_ENGINE_URL (default: http://localhost:3000).
 */

import { config } from '../config';
import { pool } from '../db/connection';
import type { Resource } from '../types/index';

// ─── Topic Engine response shapes ─────────────────────────────────────────────

type DepthLevel = 'surface' | 'foundational' | 'intermediate' | 'advanced';
type BoundaryType = 'core' | 'optional_depth' | 'out_of_scope';
type NodeType = 'concept' | 'skill' | 'milestone';

interface ConceptNode {
  id: string;
  slug: string;
  title: string;
  description: string;
  depthLevel: DepthLevel;
  boundaryType: BoundaryType;
  estimatedMins: number;
  nodeType: NodeType;
}

interface DecomposeResponse {
  topicId: string;
  graph: {
    topic: string;
    nodes: ConceptNode[];
  };
}

// ─── Depth ordering ───────────────────────────────────────────────────────────

const DEPTH_ORDER: Record<DepthLevel, number> = {
  surface:      1,
  foundational: 2,
  intermediate: 3,
  advanced:     4,
};

// ─── Type mapping ─────────────────────────────────────────────────────────────

function toStudyItemType(nodeType: NodeType): 'concept' | 'practice' {
  return nodeType === 'skill' ? 'practice' : 'concept';
}

// ─── API call ────────────────────────────────────────────────────────────────

export async function decomposeWithTopicEngine(
  topicTitle: string,
  topicDescription: string | null,
  level: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
): Promise<DecomposeResponse> {
  const userInput = topicDescription?.trim()
    ? `I want to learn ${topicTitle}. ${topicDescription}`
    : `I want to understand how ${topicTitle} works`;

  const res = await fetch(`${config.app.topicEngineUrl}/topics/decompose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: topicTitle,
      userInput,
      userContext: { level, goal: 'understand' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Topic Engine responded ${res.status}: ${body}`);
  }

  return res.json() as Promise<DecomposeResponse>;
}

// ─── Persist to Daily Push ────────────────────────────────────────────────────

export async function saveDecomposedItems(
  topicId: number,
  response: DecomposeResponse
): Promise<number> {
  const { nodes } = response.graph;

  // Filter out out_of_scope nodes, sort by depth level then title for stability
  const filtered = nodes
    .filter((n) => n.boundaryType !== 'out_of_scope')
    .sort((a, b) => {
      const depthDiff = DEPTH_ORDER[a.depthLevel] - DEPTH_ORDER[b.depthLevel];
      return depthDiff !== 0 ? depthDiff : a.title.localeCompare(b.title);
    });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Remove existing queued items — preserve anything already in-progress or done
    await conn.query(
      "DELETE FROM study_items WHERE topic_id = ? AND status = 'queued'",
      [topicId]
    );

    // Get current max position to append after any surviving items
    const [posRows] = await conn.query<any[]>(
      'SELECT COALESCE(MAX(position), 0) AS max_pos FROM study_items WHERE topic_id = ?',
      [topicId]
    );
    let position = (posRows[0].max_pos as number) + 1;

    for (const node of filtered) {
      const resources: Resource[] = [];  // resources populated async by Topic Engine workers
      const type = toStudyItemType(node.nodeType);

      await conn.query(
        `INSERT INTO study_items
           (topic_id, type, title, description, resources, estimated_mins, position, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
        [
          topicId,
          type,
          node.title,
          node.description,
          JSON.stringify(resources),
          node.estimatedMins,
          position,
        ]
      );
      position++;
    }

    // Mark topic active if it was pending
    await conn.query(
      "UPDATE topics SET status = 'active' WHERE id = ? AND status = 'pending'",
      [topicId]
    );

    await conn.commit();
    return filtered.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
