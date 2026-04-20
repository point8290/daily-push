import axios from 'axios';
import { ObjectId } from 'mongodb';
import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';
import { config } from '../config';

// ─────────────────────────────────────────────
// Topic Engine types (subset of what we need)
// ─────────────────────────────────────────────

interface TENode {
  id: string; // slug
  title: string;
  description: string;
  depthLevel: 'surface' | 'foundational' | 'intermediate' | 'advanced' | 'expert';
  boundaryType: 'core' | 'optional_depth' | 'out_of_scope';
  estimatedMins: number;
}

interface TEEdge {
  id: string;
  fromId: string;
  toId: string;
  type: 'hard_prerequisite' | 'soft_prerequisite' | 'leads_to' | 'confusable';
}

interface TEResponse {
  topicId: string;
  graph: { nodes: TENode[]; edges: TEEdge[] };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function mapSeniority(level: string | null): 'beginner' | 'intermediate' | 'advanced' {
  if (!level) return 'intermediate';
  if (level === 'junior') return 'beginner';
  if (level === 'mid') return 'intermediate';
  return 'advanced'; // senior, staff, lead
}

function mapDepth(level: string): string {
  // Our PG schema only allows surface|foundational|intermediate|advanced
  return level === 'expert' ? 'advanced' : level;
}

function mapEdgeType(type: string): string {
  // Our PG schema doesn't have 'confusable'
  return type === 'confusable' ? 'soft_prerequisite' : type;
}

// ─────────────────────────────────────────────
// Topic Engine call
// ─────────────────────────────────────────────

async function callTopicEngine(
  topic: string,
  userInput: string,
  level: 'beginner' | 'intermediate' | 'advanced'
): Promise<TEResponse> {
  const resp = await axios.post(
    `${config.app.topicEngineUrl}/topics/decompose`,
    {
      topic,
      userInput,
      userContext: { level, goal: 'gap_fill' },
    },
    { timeout: 120_000 }
  );
  return resp.data as TEResponse;
}

// ─────────────────────────────────────────────
// Unlock logic
// ─────────────────────────────────────────────

export async function runUnlockLogic(userId: string, goalId: string): Promise<void> {
  const { rows: nodeRows } = await pool.query<{ id: string }>(
    `SELECT id FROM concept_nodes WHERE user_id = $1 AND goal_id = $2 AND status = 'locked'`,
    [userId, goalId]
  );
  if (nodeRows.length === 0) return;

  const lockedIds = nodeRows.map((r) => r.id);

  // Nodes that have at least one unmet hard_prerequisite pointing TO them
  const { rows: blockedRows } = await pool.query<{ to_node_id: string }>(
    `SELECT DISTINCT ce.to_node_id
     FROM concept_edges ce
     JOIN concept_nodes cn ON cn.id = ce.from_node_id
     WHERE ce.goal_id = $1
       AND ce.edge_type = 'hard_prerequisite'
       AND ce.to_node_id = ANY($2::uuid[])
       AND cn.status != 'done'`,
    [goalId, lockedIds]
  );

  const blockedSet = new Set(blockedRows.map((r) => r.to_node_id));
  const readyIds = lockedIds.filter((id) => !blockedSet.has(id));

  if (readyIds.length > 0) {
    await pool.query(
      `UPDATE concept_nodes SET status = 'available'
       WHERE id = ANY($1::uuid[])`,
      [readyIds]
    );
  }
}

// ─────────────────────────────────────────────
// Tracker hooks (optional — for pipeline tracing)
// ─────────────────────────────────────────────

export interface DecomposeTrackerHooks {
  onTopicStart: (stepId: string) => Promise<void>;
  onTopicDone:  (stepId: string) => Promise<void>;
  onTopicFail:  (stepId: string, error: string) => Promise<void>;
  onUnlockStart: () => Promise<void>;
  onUnlockDone:  () => Promise<void>;
}

// ─────────────────────────────────────────────
// Main: decompose one goal's learning topics
// ─────────────────────────────────────────────

export async function decomposeGoal(
  userId: string,
  goalId: string,
  seniorityLevel: string | null,
  tracker?: DecomposeTrackerHooks
): Promise<{ nodesCreated: number; topicsDecomposed: number; topicsFailed: number }> {
  const db = getDb();
  const level = mapSeniority(seniorityLevel);

  const goal = await db.collection('goals').findOne({ _id: new ObjectId(goalId), userId });
  if (!goal) throw new Error('Goal not found');

  const learningTopics: any[] = goal.learningTopics ?? [];
  const skillGaps: any[] = goal.skillGaps ?? [];

  let nodesCreated = 0;
  let topicsDecomposed = 0;
  let topicsFailed = 0;
  let topicIndex = 0;

  for (const topicDoc of learningTopics) {
    const topic = topicDoc.structured;
    if (!topic || topic.decompositionStatus === 'completed') continue;

    const stepId = `topic_decompose_${topicIndex}`;
    await tracker?.onTopicStart(stepId);

    // Inherit longevity + AI relationship from the linked skill gap
    const gap = skillGaps.find(
      (g) => g._id?.toString() === topicDoc.skillGapId?.toString()
    );
    const longevity = gap?.structured?.longevity ?? 'medium';
    const aiRelationship = gap?.structured?.aiRelationship ?? 'unaffected';

    // Mark in_progress in MongoDB
    await db.collection('goals').updateOne(
      { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
      { $set: { 'learningTopics.$.structured.decompositionStatus': 'in_progress' } }
    );

    let nodes: TENode[];
    let edges: TEEdge[];
    let topicEngineId: string;

    try {
      const userInput = `${goal.structured.title} — ${topic.rationale ?? topic.title}`;
      const result = await callTopicEngine(topic.title, userInput, level);
      topicEngineId = result.topicId;
      nodes = result.graph.nodes.filter((n) => n.boundaryType !== 'out_of_scope');
      edges = result.graph.edges;
    } catch (err) {
      console.warn(`[decompose] Topic Engine unreachable for "${topic.title}":`, (err as Error).message);
      await db.collection('goals').updateOne(
        { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
        { $set: { 'learningTopics.$.structured.decompositionStatus': 'failed' } }
      );
      await tracker?.onTopicFail(stepId, `Topic Engine unreachable: ${(err as Error).message}`);
      topicsFailed++;
      topicIndex++;
      continue;
    }

    try {
      // Insert nodes into PostgreSQL — collect slug → UUID mapping
      const slugToUUID = new Map<string, string>();
      let position = 1;

      const ALLOWED_BOUNDARY = new Set(['core', 'optional_depth', 'out_of_scope']);
      for (const node of nodes) {
        const safeBoundary = ALLOWED_BOUNDARY.has(node.boundaryType) ? node.boundaryType : 'core';
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO concept_nodes
             (user_id, goal_id, learning_topic_id,
              title, description, depth_level, boundary_type,
              node_type, estimated_mins, longevity, ai_relationship,
              status, position, te_node_slug)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'concept',$8,$9,$10,'locked',$11,$12)
           RETURNING id`,
          [
            userId,
            goalId,
            topicDoc._id.toString(),
            node.title,
            node.description,
            mapDepth(node.depthLevel),
            safeBoundary,
            node.estimatedMins,
            longevity,
            aiRelationship,
            position++,
            node.id,
          ]
        );
        slugToUUID.set(node.id, rows[0].id);
        nodesCreated++;
      }

      // Insert edges
      for (const edge of edges) {
        const fromId = slugToUUID.get(edge.fromId);
        const toId = slugToUUID.get(edge.toId);
        if (!fromId || !toId) continue;

        await pool.query(
          `INSERT INTO concept_edges (goal_id, learning_topic_id, from_node_id, to_node_id, edge_type)
           VALUES ($1,$2,$3,$4,$5)`,
          [goalId, topicDoc._id.toString(), fromId, toId, mapEdgeType(edge.type)]
        );
      }

      // Mark completed in MongoDB, store topicEngineId
      await db.collection('goals').updateOne(
        { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
        {
          $set: {
            'learningTopics.$.structured.decompositionStatus': 'completed',
            'learningTopics.$.structured.topicEngineId': topicEngineId,
          },
        }
      );
      await tracker?.onTopicDone(stepId);
      topicsDecomposed++;
    } catch (insertErr) {
      console.error(`[decompose] Node insert failed for "${topic.title}":`, (insertErr as Error).message);
      await db.collection('goals').updateOne(
        { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
        { $set: { 'learningTopics.$.structured.decompositionStatus': 'failed' } }
      );
      await tracker?.onTopicFail(stepId, (insertErr as Error).message);
      topicsFailed++;
    }
    topicIndex++;
  }

  // Run unlock logic across all nodes for this goal
  await tracker?.onUnlockStart();
  await runUnlockLogic(userId, goalId);
  await tracker?.onUnlockDone();

  return { nodesCreated, topicsDecomposed, topicsFailed };
}

// ─────────────────────────────────────────────
// Get nodes for a goal
// ─────────────────────────────────────────────

export interface NodeRow {
  id: string;
  learning_topic_id: string;
  title: string;
  description: string;
  depth_level: string;
  boundary_type: string;
  estimated_mins: number;
  longevity: string;
  ai_relationship: string;
  status: string;
  confidence: number | null;
  position: number;
  outgoing_edges: Array<{ id: string; toNodeId: string; edgeType: string }>;
}

export async function getGoalNodes(userId: string, goalId: string): Promise<NodeRow[]> {
  const { rows } = await pool.query<NodeRow>(
    `SELECT
       cn.id, cn.learning_topic_id, cn.title, cn.description,
       cn.depth_level, cn.boundary_type, cn.estimated_mins,
       cn.longevity, cn.ai_relationship, cn.status,
       cn.confidence, cn.position,
       COALESCE(
         json_agg(
           json_build_object(
             'id', ce.id,
             'toNodeId', ce.to_node_id,
             'edgeType', ce.edge_type
           )
         ) FILTER (WHERE ce.id IS NOT NULL),
         '[]'::json
       ) AS outgoing_edges
     FROM concept_nodes cn
     LEFT JOIN concept_edges ce ON ce.from_node_id = cn.id
     WHERE cn.user_id = $1 AND cn.goal_id = $2
     GROUP BY cn.id
     ORDER BY cn.learning_topic_id, cn.position`,
    [userId, goalId]
  );
  return rows;
}
