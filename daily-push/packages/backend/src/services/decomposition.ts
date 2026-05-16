import axios, { AxiosError } from 'axios';
import { ObjectId } from 'mongodb';
import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';
import { config } from '../config';
import { trackProductEvent } from './productEvents';

interface TENode {
  id: string;
  title: string;
  description: string;
  depthLevel:
    | 'surface'
    | 'foundational'
    | 'intermediate'
    | 'advanced'
    | 'expert';
  boundaryType: 'core' | 'optional_depth' | 'out_of_scope';
  estimatedMins: number;
}

interface TEEdge {
  id: string;
  fromId: string;
  toId: string;
  type:
    | 'hard_prerequisite'
    | 'soft_prerequisite'
    | 'leads_to'
    | 'confusable';
}

interface TEResponse {
  topicId: string;
  graph: { nodes: TENode[]; edges: TEEdge[] };
}

interface TopicEngineCallResult {
  response: TEResponse;
  attempts: number;
}

interface TopicProcessResult {
  topicTitle: string;
  learningTopicId: string;
  nodesCreated: number;
  succeeded: boolean;
  durationMs: number;
  attempts: number;
  errorMessage: string | null;
}

class TopicEngineRequestError extends Error {
  attempts: number;
  retryable: boolean;

  constructor(message: string, attempts: number, retryable: boolean) {
    super(message);
    this.name = 'TopicEngineRequestError';
    this.attempts = attempts;
    this.retryable = retryable;
  }
}

function mapSeniority(
  level: string | null,
): 'beginner' | 'intermediate' | 'advanced' {
  if (!level) return 'intermediate';
  if (level === 'junior') return 'beginner';
  if (level === 'mid') return 'intermediate';
  return 'advanced';
}

function mapDepth(level: string): string {
  return level === 'expert' ? 'advanced' : level;
}

function mapEdgeType(type: string): string {
  return type === 'confusable' ? 'soft_prerequisite' : type;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringifyErrorPayload(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }
  return String(data);
}

function describeTopicEngineError(err: unknown): {
  message: string;
  retryable: boolean;
} {
  if (axios.isAxiosError(err)) {
    const axiosError = err as AxiosError;
    const status = axiosError.response?.status ?? null;
    const code = axiosError.code ?? null;
    const responseMessage = stringifyErrorPayload(axiosError.response?.data);
    const isTimeout =
      code === 'ECONNABORTED' || /timeout/i.test(axiosError.message);
    const isNetwork = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'ENOTFOUND',
    ].includes(code ?? '');
    const isRetryableStatus =
      status !== null &&
      [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
    const retryable = isTimeout || isNetwork || isRetryableStatus;

    if (status !== null) {
      return {
        message: `Topic Engine ${status}: ${responseMessage ?? axiosError.message}`,
        retryable,
      };
    }

    return {
      message: responseMessage ?? axiosError.message,
      retryable,
    };
  }

  if (err instanceof Error) {
    return { message: err.message, retryable: false };
  }

  return { message: String(err), retryable: false };
}

async function callTopicEngine(
  topic: string,
  userInput: string,
  level: 'beginner' | 'intermediate' | 'advanced',
): Promise<TopicEngineCallResult> {
  const maxAttempts = Math.max(1, config.decomposition.maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await axios.post(
        `${config.app.topicEngineUrl}/topics/decompose`,
        {
          topic,
          userInput,
          userContext: { level, goal: 'gap_fill' },
        },
        { timeout: config.decomposition.requestTimeoutMs },
      );

      return {
        response: resp.data as TEResponse,
        attempts: attempt,
      };
    } catch (err) {
      const { message, retryable } = describeTopicEngineError(err);
      const isLastAttempt = attempt >= maxAttempts;

      if (!retryable || isLastAttempt) {
        throw new TopicEngineRequestError(message, attempt, retryable);
      }

      const retryDelayMs =
        config.decomposition.retryBaseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[decompose] Topic Engine call failed for "${topic}" (attempt ${attempt}/${maxAttempts}): ${message}. Retrying in ${retryDelayMs}ms.`,
      );
      await sleep(retryDelayMs);
    }
  }

  throw new TopicEngineRequestError(
    'Topic Engine request failed with no attempts recorded',
    maxAttempts,
    false,
  );
}

async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TResult>,
): Promise<Array<PromiseSettledResult<TResult>>> {
  if (items.length === 0) return [];

  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        return;
      }

      try {
        const value = await worker(items[currentIndex]);
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (reason) {
        results[currentIndex] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function runUnlockLogic(
  userId: string,
  goalId: string,
): Promise<void> {
  const { rows: nodeRows } = await pool.query<{ id: string }>(
    `SELECT id FROM concept_nodes WHERE user_id = $1 AND goal_id = $2 AND status = 'locked'`,
    [userId, goalId],
  );
  if (nodeRows.length === 0) return;

  const lockedIds = nodeRows.map((r) => r.id);

  const { rows: blockedRows } = await pool.query<{ to_node_id: string }>(
    `SELECT DISTINCT ce.to_node_id
     FROM concept_edges ce
     JOIN concept_nodes cn ON cn.id = ce.from_node_id
     WHERE ce.goal_id = $1
       AND ce.edge_type = 'hard_prerequisite'
       AND ce.to_node_id = ANY($2::uuid[])
       AND cn.status != 'done'`,
    [goalId, lockedIds],
  );

  const blockedSet = new Set(blockedRows.map((r) => r.to_node_id));
  const readyIds = lockedIds.filter((id) => !blockedSet.has(id));

  if (readyIds.length > 0) {
    await pool.query(
      `UPDATE concept_nodes SET status = 'available'
       WHERE id = ANY($1::uuid[])`,
      [readyIds],
    );
  }
}

export interface DecomposeTrackerHooks {
  onTopicStart: (stepId: string) => Promise<void>;
  onTopicDone: (stepId: string) => Promise<void>;
  onTopicFail: (stepId: string, error: string) => Promise<void>;
  onUnlockStart: () => Promise<void>;
  onUnlockDone: () => Promise<void>;
}

async function processOneTopic(
  topicDoc: any,
  topicIndex: number,
  userId: string,
  goalId: string,
  level: 'beginner' | 'intermediate' | 'advanced',
  goalTitle: string,
  skillGaps: any[],
  tracker?: DecomposeTrackerHooks,
): Promise<TopicProcessResult> {
  const db = getDb();
  const topic = topicDoc.structured ?? {};
  const stepId = `topic_decompose_${topicIndex}`;
  const startedAt = new Date();
  const learningTopicId = topicDoc._id.toString();
  const topicTitle = topic.title ?? 'Untitled topic';

  await tracker?.onTopicStart(stepId);

  const gap = skillGaps.find(
    (g) => g._id?.toString() === topicDoc.skillGapId?.toString(),
  );
  const longevity = gap?.structured?.longevity ?? 'medium';
  const aiRelationship = gap?.structured?.aiRelationship ?? 'unaffected';

  await db.collection('goals').updateOne(
    { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
    {
      $set: {
        'learningTopics.$.structured.decompositionStatus': 'in_progress',
        'learningTopics.$.structured.lastDecompositionAttemptAt': startedAt,
        'learningTopics.$.structured.lastDecompositionError': null,
      },
      $inc: {
        'learningTopics.$.structured.decompositionAttempts': 1,
      },
    },
  );

  let nodes: TENode[] = [];
  let edges: TEEdge[] = [];
  let topicEngineId = '';
  let requestAttempts = 0;

  try {
    const userInput = `${goalTitle} - ${topic.rationale ?? topic.title}`;
    const result = await callTopicEngine(topic.title, userInput, level);
    requestAttempts = result.attempts;
    topicEngineId = result.response.topicId;
    nodes = result.response.graph.nodes.filter(
      (node) => node.boundaryType !== 'out_of_scope',
    );
    edges = result.response.graph.edges;
  } catch (err) {
    const requestError =
      err instanceof TopicEngineRequestError
        ? err
        : new TopicEngineRequestError(
            err instanceof Error ? err.message : String(err),
            requestAttempts || 1,
            false,
          );
    const completedAt = new Date();
    const errorMessage = `Topic Engine request failed after ${requestError.attempts} attempt${requestError.attempts === 1 ? '' : 's'}: ${requestError.message}`;

    console.warn(
      `[decompose] Topic Engine unreachable for "${topicTitle}":`,
      errorMessage,
    );

    const durationMs = completedAt.getTime() - startedAt.getTime();

    await db.collection('goals').updateOne(
      { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
      {
        $set: {
          'learningTopics.$.structured.decompositionStatus': 'failed',
          'learningTopics.$.structured.lastDecompositionError': errorMessage,
          'learningTopics.$.structured.lastDecompositionCompletedAt':
            completedAt,
          'learningTopics.$.structured.lastDecompositionDurationMs':
            durationMs,
          'learningTopics.$.structured.lastTopicEngineAttempts':
            requestError.attempts,
        },
      },
    );

    await trackProductEvent({
      userId,
      goalId,
      eventKey: 'decompose_topic_failed',
      properties: {
        learningTopicId,
        topicTitle,
        failureStage: 'topic_engine_request',
        durationMs,
        topicEngineAttempts: requestError.attempts,
        retryable: requestError.retryable,
        errorMessage,
      },
    });

    await tracker?.onTopicFail(stepId, errorMessage);
    return {
      topicTitle,
      learningTopicId,
      nodesCreated: 0,
      succeeded: false,
      durationMs,
      attempts: requestError.attempts,
      errorMessage,
    };
  }

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM concept_edges
         WHERE goal_id = $1 AND learning_topic_id = $2`,
        [goalId, learningTopicId],
      );
      await client.query(
        `DELETE FROM concept_nodes
         WHERE user_id = $1 AND goal_id = $2 AND learning_topic_id = $3`,
        [userId, goalId, learningTopicId],
      );

      const slugToUUID = new Map<string, string>();
      let position = 1;
      const allowedBoundaryTypes = new Set([
        'core',
        'optional_depth',
        'out_of_scope',
      ]);

      for (const node of nodes) {
        const safeBoundary = allowedBoundaryTypes.has(node.boundaryType)
          ? node.boundaryType
          : 'core';
        const { rows } = await client.query<{ id: string }>(
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
            learningTopicId,
            node.title,
            node.description,
            mapDepth(node.depthLevel),
            safeBoundary,
            node.estimatedMins,
            longevity,
            aiRelationship,
            position++,
            node.id,
          ],
        );
        slugToUUID.set(node.id, rows[0].id);
      }

      for (const edge of edges) {
        const fromId = slugToUUID.get(edge.fromId);
        const toId = slugToUUID.get(edge.toId);
        if (!fromId || !toId) continue;

        await client.query(
          `INSERT INTO concept_edges
             (goal_id, learning_topic_id, from_node_id, to_node_id, edge_type)
           VALUES ($1,$2,$3,$4,$5)`,
          [goalId, learningTopicId, fromId, toId, mapEdgeType(edge.type)],
        );
      }

      await client.query('COMMIT');
    } catch (insertErr) {
      await client.query('ROLLBACK');
      throw insertErr;
    } finally {
      client.release();
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    await db.collection('goals').updateOne(
      { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
      {
        $set: {
          'learningTopics.$.structured.decompositionStatus': 'completed',
          'learningTopics.$.structured.topicEngineId': topicEngineId,
          'learningTopics.$.structured.lastDecompositionError': null,
          'learningTopics.$.structured.lastDecompositionCompletedAt':
            completedAt,
          'learningTopics.$.structured.lastDecompositionDurationMs':
            durationMs,
          'learningTopics.$.structured.lastTopicEngineAttempts':
            requestAttempts || 1,
        },
      },
    );

    await trackProductEvent({
      userId,
      goalId,
      eventKey: 'decompose_topic_completed',
      properties: {
        learningTopicId,
        topicTitle,
        durationMs,
        topicEngineAttempts: requestAttempts || 1,
        nodesCreated: nodes.length,
      },
    });

    await tracker?.onTopicDone(stepId);
    return {
      topicTitle,
      learningTopicId,
      nodesCreated: nodes.length,
      succeeded: true,
      durationMs,
      attempts: requestAttempts || 1,
      errorMessage: null,
    };
  } catch (insertErr) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const errorMessage =
      insertErr instanceof Error ? insertErr.message : String(insertErr);

    console.error(
      `[decompose] Node insert failed for "${topicTitle}":`,
      errorMessage,
    );

    await db.collection('goals').updateOne(
      { _id: new ObjectId(goalId), 'learningTopics._id': topicDoc._id },
      {
        $set: {
          'learningTopics.$.structured.decompositionStatus': 'failed',
          'learningTopics.$.structured.lastDecompositionError': errorMessage,
          'learningTopics.$.structured.lastDecompositionCompletedAt':
            completedAt,
          'learningTopics.$.structured.lastDecompositionDurationMs':
            durationMs,
          'learningTopics.$.structured.lastTopicEngineAttempts':
            requestAttempts || 1,
        },
      },
    );

    await trackProductEvent({
      userId,
      goalId,
      eventKey: 'decompose_topic_failed',
      properties: {
        learningTopicId,
        topicTitle,
        failureStage: 'graph_persist',
        durationMs,
        topicEngineAttempts: requestAttempts || 1,
        errorMessage,
      },
    });

    await tracker?.onTopicFail(stepId, errorMessage);
    return {
      topicTitle,
      learningTopicId,
      nodesCreated: 0,
      succeeded: false,
      durationMs,
      attempts: requestAttempts || 1,
      errorMessage,
    };
  }
}

export async function decomposeGoal(
  userId: string,
  goalId: string,
  seniorityLevel: string | null,
  tracker?: DecomposeTrackerHooks,
): Promise<{
  nodesCreated: number;
  topicsDecomposed: number;
  topicsFailed: number;
}> {
  const db = getDb();
  const level = mapSeniority(seniorityLevel);

  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId,
  });
  if (!goal) throw new Error('Goal not found');

  const learningTopics: any[] = goal.learningTopics ?? [];
  const skillGaps: any[] = goal.skillGaps ?? [];
  const goalTitle: string = goal.structured?.title ?? '';

  const pending = learningTopics
    .map((topicDoc, idx) => ({ topicDoc, idx }))
    .filter(({ topicDoc }) => {
      const structured = topicDoc.structured;
      return structured && structured.decompositionStatus !== 'completed';
    });

  const results = await runWithConcurrencyLimit(
    pending,
    config.decomposition.topicConcurrency,
    ({ topicDoc, idx }) =>
      processOneTopic(
        topicDoc,
        idx,
        userId,
        goalId,
        level,
        goalTitle,
        skillGaps,
        tracker,
      ),
  );

  let nodesCreated = 0;
  let topicsDecomposed = 0;
  let topicsFailed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      nodesCreated += result.value.nodesCreated;
      if (result.value.succeeded) {
        topicsDecomposed++;
      } else {
        topicsFailed++;
      }
    } else {
      topicsFailed++;
    }
  }

  await tracker?.onUnlockStart();
  await runUnlockLogic(userId, goalId);
  await tracker?.onUnlockDone();

  return { nodesCreated, topicsDecomposed, topicsFailed };
}

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

export async function getGoalNodes(
  userId: string,
  goalId: string,
): Promise<NodeRow[]> {
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
    [userId, goalId],
  );
  return rows;
}
