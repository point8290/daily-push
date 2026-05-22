import { ObjectId } from 'mongodb';
import {
  assertValidStartTargetRoleDecompositionResponse,
  assertValidTargetRoleDecompositionStatusResponse,
  type StartTargetRoleDecompositionResponse,
  type TargetRoleDecompositionPipelineStatus,
  type TargetRoleDecompositionStatusResponse,
  type TargetRoleDecompositionTopic,
  type TargetRoleDecompositionTopicStatus,
  type UpgradePlan,
} from '@daily-push/shared';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import { config } from '../config';
import { decomposeGoal, type DecomposeTrackerHooks } from './decomposition';
import {
  buildDecomposeSteps,
  failPipelineRun,
  finalizePipelineRun,
  initPipelineRun,
  setStepStatus,
} from './pipelineTracker';
import { trackProductEvent } from './productEvents';
import { createGoalFromTargetRoleUpgradePlan } from './targetRoleExecutionAdapter';
import { getTargetRole } from './targetRoles';
import {
  addUpgradePlanWarning,
  getLatestUpgradePlanForTargetRole,
  getUpgradePlanForTargetRole,
} from './upgradePlans';

function buildTrackerHooks(goalId: string): DecomposeTrackerHooks {
  return {
    onTopicStart: (stepId) => setStepStatus(goalId, stepId, 'running'),
    onTopicDone: (stepId) => setStepStatus(goalId, stepId, 'done'),
    onTopicFail: (stepId, error) => setStepStatus(goalId, stepId, 'failed', error),
    onUnlockStart: () => setStepStatus(goalId, 'unlock_logic', 'running'),
    onUnlockDone: () => setStepStatus(goalId, 'unlock_logic', 'done'),
  };
}

function mapPipelineStatus(value: unknown): TargetRoleDecompositionPipelineStatus {
  if (value === 'running' || value === 'done' || value === 'partial' || value === 'failed') {
    return value;
  }
  return 'idle';
}

function mapTopicStatus(value: unknown): TargetRoleDecompositionTopicStatus {
  if (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }
  return 'pending';
}

async function loadUpgradePlan(params: {
  userId: string;
  targetRoleId: string;
  upgradePlanId?: string | null;
}): Promise<UpgradePlan> {
  const upgradePlan = params.upgradePlanId
    ? await getUpgradePlanForTargetRole(
        params.userId,
        params.targetRoleId,
        params.upgradePlanId,
      )
    : await getLatestUpgradePlanForTargetRole(params.userId, params.targetRoleId);

  if (!upgradePlan) {
    const error = new Error('Create an upgrade plan before decomposing topics.');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }
  return upgradePlan;
}

async function getNodeCountsByTopic(
  userId: string,
  goalId: string,
): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ learning_topic_id: string; count: string }>(
    `SELECT learning_topic_id, COUNT(*)::text AS count
       FROM concept_nodes
      WHERE user_id = $1
        AND goal_id = $2
      GROUP BY learning_topic_id`,
    [userId, goalId],
  );
  return new Map(
    rows.map((row) => [row.learning_topic_id, Number.parseInt(row.count, 10)]),
  );
}

function buildMessage(params: {
  pipelineStatus: TargetRoleDecompositionPipelineStatus;
  topics: TargetRoleDecompositionTopic[];
  fallbackTaskCount: number;
}): string {
  if (params.pipelineStatus === 'running') {
    return 'Topic Engine is breaking the upgrade plan into a deeper study graph. Your fallback proof tasks remain available while this runs.';
  }
  if (params.topics.some((topic) => topic.status === 'failed')) {
    return 'Some topics are still using fallback proof tasks. Retry when Topic Engine is available.';
  }
  if (params.topics.length > 0 && params.topics.every((topic) => topic.status === 'completed')) {
    return 'All upgrade-plan topics have a deeper study graph.';
  }
  if (params.fallbackTaskCount > 0) {
    return 'Proof tasks are ready now. You can add a deeper topic breakdown when you want more structure.';
  }
  return 'Create an upgrade plan before building a topic breakdown.';
}

async function buildStatus(params: {
  userId: string;
  targetRoleId: string;
  upgradePlan: UpgradePlan;
  goalId: string | null;
}): Promise<TargetRoleDecompositionStatusResponse> {
  const fallbackTaskCount = params.upgradePlan.proofTasks.length;
  const baseConfig = {
    requestTimeoutMs: config.decomposition.requestTimeoutMs,
    maxAttempts: config.decomposition.maxAttempts,
    topicConcurrency: config.decomposition.topicConcurrency,
  };

  if (!params.goalId) {
    const topics = params.upgradePlan.topics.map<TargetRoleDecompositionTopic>((topic) => ({
      topicId: null,
      title: topic.title,
      status: 'not_started',
      nodesCreated: 0,
      usingFallback: fallbackTaskCount > 0,
      error: null,
    }));
    const response: TargetRoleDecompositionStatusResponse = {
      targetRoleId: params.targetRoleId,
      upgradePlanId: params.upgradePlan.id,
      goalId: null,
      pipelineStatus: 'idle',
      topics,
      nodesCreated: 0,
      fallbackTaskCount,
      canStart: topics.length > 0,
      canRetry: false,
      message: buildMessage({ pipelineStatus: 'idle', topics, fallbackTaskCount }),
      config: baseConfig,
    };
    assertValidTargetRoleDecompositionStatusResponse(response);
    return response;
  }

  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(params.goalId),
    userId: params.userId,
  });
  if (!goal) {
    const response: TargetRoleDecompositionStatusResponse = {
      targetRoleId: params.targetRoleId,
      upgradePlanId: params.upgradePlan.id,
      goalId: null,
      pipelineStatus: 'idle',
      topics: params.upgradePlan.topics.map((topic) => ({
        topicId: null,
        title: topic.title,
        status: 'not_started',
        nodesCreated: 0,
        usingFallback: fallbackTaskCount > 0,
        error: null,
      })),
      nodesCreated: 0,
      fallbackTaskCount,
      canStart: params.upgradePlan.topics.length > 0,
      canRetry: false,
      message: 'The linked execution goal was not found. Start the sprint again to recreate it.',
      config: baseConfig,
    };
    assertValidTargetRoleDecompositionStatusResponse(response);
    return response;
  }

  const nodeCounts = await getNodeCountsByTopic(params.userId, params.goalId);
  const learningTopics: any[] = goal.learningTopics ?? [];
  const topics = learningTopics.map<TargetRoleDecompositionTopic>((topicDoc) => {
    const structured = topicDoc.structured ?? {};
    const topicId = topicDoc._id?.toString() ?? null;
    const status = mapTopicStatus(structured.decompositionStatus);
    const nodesCreated = topicId ? nodeCounts.get(topicId) ?? 0 : 0;
    return {
      topicId,
      title: structured.title ?? 'Untitled topic',
      status,
      nodesCreated,
      usingFallback: status !== 'completed' && nodesCreated > 0,
      error: structured.lastDecompositionError ?? null,
    };
  });
  const pipelineStatus = mapPipelineStatus(goal.pipelineRun?.status);
  const nodesCreated = [...nodeCounts.values()].reduce((sum, count) => sum + count, 0);
  const hasRunningTopic = topics.some((topic) => topic.status === 'in_progress');
  const isRunning = pipelineStatus === 'running' || hasRunningTopic;
  const hasFailed = topics.some((topic) => topic.status === 'failed');
  const hasIncomplete = topics.some((topic) => topic.status !== 'completed');
  const response: TargetRoleDecompositionStatusResponse = {
    targetRoleId: params.targetRoleId,
    upgradePlanId: params.upgradePlan.id,
    goalId: params.goalId,
    pipelineStatus,
    topics,
    nodesCreated,
    fallbackTaskCount,
    canStart: !isRunning && hasIncomplete,
    canRetry: !isRunning && hasFailed,
    message: buildMessage({ pipelineStatus, topics, fallbackTaskCount }),
    config: baseConfig,
  };
  assertValidTargetRoleDecompositionStatusResponse(response);
  return response;
}

export async function getTargetRoleDecompositionStatus(params: {
  userId: string;
  targetRoleId: string;
  upgradePlanId?: string | null;
}): Promise<TargetRoleDecompositionStatusResponse> {
  const targetRole = await getTargetRole(params.userId, params.targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const upgradePlan = await loadUpgradePlan(params);
  return buildStatus({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    upgradePlan,
    goalId: upgradePlan.linkedGoalId ?? targetRole.linkedGoalId,
  });
}

async function markStaleInProgressPending(goalId: string, userId: string): Promise<void> {
  const db = getDb();
  await db.collection('goals').updateOne(
    {
      _id: new ObjectId(goalId),
      userId,
      'learningTopics.structured.decompositionStatus': 'in_progress',
    },
    {
      $set: {
        'learningTopics.$[topic].structured.decompositionStatus': 'pending',
      },
    },
    {
      arrayFilters: [
        { 'topic.structured.decompositionStatus': 'in_progress' },
      ],
    },
  );
}

async function resetFailedTopics(goalId: string, userId: string): Promise<void> {
  const db = getDb();
  await db.collection('goals').updateOne(
    {
      _id: new ObjectId(goalId),
      userId,
      'learningTopics.structured.decompositionStatus': 'failed',
    },
    {
      $set: {
        'learningTopics.$[topic].structured.decompositionStatus': 'pending',
        'learningTopics.$[topic].structured.lastDecompositionError': null,
      },
    },
    {
      arrayFilters: [
        { 'topic.structured.decompositionStatus': 'failed' },
      ],
    },
  );
}

async function runInBackground(params: {
  userId: string;
  targetRoleId: string;
  upgradePlanId: string;
  goalId: string;
  requestedTopicCount: number;
  retryMode: boolean;
}): Promise<void> {
  const startedAt = Date.now();
  try {
    const { rows } = await pool.query<{ seniority_level: string }>(
      'SELECT seniority_level FROM user_profiles_structured WHERE user_id = $1',
      [params.userId],
    );
    const result = await decomposeGoal(
      params.userId,
      params.goalId,
      rows[0]?.seniority_level ?? null,
      buildTrackerHooks(params.goalId),
    );
    const pipelineStatus = await finalizePipelineRun(params.goalId);
    if (result.topicsFailed > 0) {
      await addUpgradePlanWarning(
        params.userId,
        params.targetRoleId,
        params.upgradePlanId,
        {
          code: 'dependency_unavailable',
          message:
            'Topic Engine could not decompose every upgrade-plan topic. Fallback proof tasks remain available and failed topics can be retried.',
        },
      );
    }

    await trackProductEvent({
      userId: params.userId,
      goalId: params.goalId,
      eventKey: 'role_upgrade_plan_decomposition_completed',
      properties: {
        targetRoleId: params.targetRoleId,
        upgradePlanId: params.upgradePlanId,
        retryMode: params.retryMode,
        requestedTopicCount: params.requestedTopicCount,
        nodesCreated: result.nodesCreated,
        topicsDecomposed: result.topicsDecomposed,
        topicsFailed: result.topicsFailed,
        pipelineStatus,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    await failPipelineRun(params.goalId);
    await addUpgradePlanWarning(
      params.userId,
      params.targetRoleId,
      params.upgradePlanId,
      {
        code: 'dependency_unavailable',
        message:
          'Topic Engine decomposition failed. Fallback proof tasks remain available and the topic breakdown can be retried.',
      },
    ).catch(() => {});
    await trackProductEvent({
      userId: params.userId,
      goalId: params.goalId,
      eventKey: 'role_upgrade_plan_decomposition_failed',
      properties: {
        targetRoleId: params.targetRoleId,
        upgradePlanId: params.upgradePlanId,
        retryMode: params.retryMode,
        requestedTopicCount: params.requestedTopicCount,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export async function startTargetRoleDecomposition(params: {
  userId: string;
  targetRoleId: string;
  upgradePlanId: string;
  retryMode?: boolean;
}): Promise<StartTargetRoleDecompositionResponse> {
  const upgradePlan = await loadUpgradePlan(params);
  const goalResponse = await createGoalFromTargetRoleUpgradePlan({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    upgradePlanId: upgradePlan.id,
  });
  const goalId = goalResponse.goalId;
  const status = await buildStatus({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    upgradePlan,
    goalId,
  });

  if (status.pipelineStatus === 'running' || status.topics.some((topic) => topic.status === 'in_progress')) {
    const error = new Error('Topic decomposition is already running.');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 409;
    (error as Error & { statusCode?: number; code?: string }).code = 'conflict';
    throw error;
  }

  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId: params.userId,
  });
  if (!goal) {
    const error = new Error('Linked Goal not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const topics: any[] = goal.learningTopics ?? [];
  const staleInProgress = topics.some(
    (topic) => topic.structured?.decompositionStatus === 'in_progress',
  );
  const hadFailedTopics = topics.some(
    (topic) => topic.structured?.decompositionStatus === 'failed',
  );
  if (staleInProgress) {
    await markStaleInProgressPending(goalId, params.userId);
  }
  if (params.retryMode && !hadFailedTopics) {
    const error = new Error('No failed topics are available to retry.');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 400;
    (error as Error & { statusCode?: number; code?: string }).code = 'validation_error';
    throw error;
  }
  if (params.retryMode) {
    await resetFailedTopics(goalId, params.userId);
  }

  const reloadedGoal = await db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId: params.userId,
  });
  const reloadedTopics: any[] = reloadedGoal?.learningTopics ?? [];
  const targetTopics = reloadedTopics.filter((topic) => {
    const currentStatus = topic.structured?.decompositionStatus ?? 'pending';
    return params.retryMode
      ? currentStatus !== 'completed'
      : currentStatus !== 'completed';
  });

  if (targetTopics.length === 0) {
    const latestStatus = await buildStatus({
      userId: params.userId,
      targetRoleId: params.targetRoleId,
      upgradePlan,
      goalId,
    });
    const response: StartTargetRoleDecompositionResponse = {
      ...latestStatus,
      accepted: false,
      retryMode: params.retryMode === true,
    };
    assertValidStartTargetRoleDecompositionResponse(response);
    return response;
  }

  await initPipelineRun(
    goalId,
    'decompose',
    buildDecomposeSteps(
      targetTopics.map((topic) => ({
        title: topic.structured?.title ?? 'Untitled topic',
      })),
    ),
  );

  await trackProductEvent({
    userId: params.userId,
    goalId,
    eventKey: 'role_upgrade_plan_decomposition_started',
    properties: {
      targetRoleId: params.targetRoleId,
      upgradePlanId: upgradePlan.id,
      retryMode: params.retryMode === true,
      requestedTopicCount: targetTopics.length,
      requestTimeoutMs: config.decomposition.requestTimeoutMs,
      maxAttempts: config.decomposition.maxAttempts,
      topicConcurrency: config.decomposition.topicConcurrency,
    },
  });

  void runInBackground({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    upgradePlanId: upgradePlan.id,
    goalId,
    requestedTopicCount: targetTopics.length,
    retryMode: params.retryMode === true,
  });

  const latestStatus = await buildStatus({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    upgradePlan,
    goalId,
  });
  const response: StartTargetRoleDecompositionResponse = {
    ...latestStatus,
    accepted: true,
    retryMode: params.retryMode === true,
  };
  assertValidStartTargetRoleDecompositionResponse(response);
  return response;
}
