import { ObjectId } from 'mongodb';
import {
  assertValidCreateGoalFromTargetRoleResponse,
  assertValidStartUpgradePlanSprintResponse,
  type CreateGoalFromTargetRoleResponse,
  type ProofRecommendation,
  type StartUpgradePlanSprintResponse,
  type TargetRole,
  type UpgradePlan,
  type UpgradePlanTopic,
} from '@daily-push/shared';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import {
  saveGoalInput,
  updateGoalWithPlan,
  type ClassifiedGoal,
  type LearningTopic,
  type SkillGap,
} from './intake';
import { assertBelowStateLimit } from './entitlements';
import { getRoleMarketProfile } from './roleMarketCatalog';
import { rebaselineGoalSprint, saveGoalSprintDefinition } from './sprintPlanner';
import { getTargetRole } from './targetRoles';
import {
  getLatestUpgradePlanForTargetRole,
  getUpgradePlanForTargetRole,
  linkUpgradePlanExecution,
} from './upgradePlans';

const ACTIVE_GOAL_STATUSES = [
  'intake_in_progress',
  'active',
  'drafting',
  'assessing',
  'planning',
  'paused',
];

function isObjectId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function categoryForTask(task: ProofRecommendation): SkillGap['skillCategory'] {
  if (task.type === 'resume_rewrite' || task.type === 'interview_story') {
    return 'soft_skills';
  }
  if (/ai|agent|llm|automation/i.test(`${task.title} ${task.gapAddressed}`)) {
    return 'ai_native';
  }
  return 'engineering';
}

function buildGoalInput(params: {
  targetRole: TargetRole;
  upgradePlan: UpgradePlan;
}): string {
  const { targetRole, upgradePlan } = params;
  const topGaps = upgradePlan.topics
    .slice(0, 5)
    .map((topic) => `- ${topic.linkedGap || topic.title}`)
    .join('\n');
  const proof = upgradePlan.proofTasks
    .slice(0, 5)
    .map((task) => `- ${task.title}: ${task.expectedOutput}`)
    .join('\n');

  return [
    `Prepare for ${targetRole.title}.`,
    '',
    'This goal was created from a Target Role market-readiness plan.',
    '',
    'Priority gaps:',
    topGaps || '- Build stronger role-specific proof.',
    '',
    'Proof to create:',
    proof || '- Produce visible evidence for the target role.',
  ].join('\n');
}

function buildPlanFromTargetRole(params: {
  targetRole: TargetRole;
  upgradePlan: UpgradePlan;
}): {
  classification: ClassifiedGoal;
  skillGaps: SkillGap[];
  learningTopics: LearningTopic[];
  timeline: {
    estimatedWeeks: number;
    estimatedWeeksAtPace: number;
    availableMinsDay: number;
  };
} {
  const { targetRole, upgradePlan } = params;
  const skillGaps: SkillGap[] = upgradePlan.topics.map((topic, index) => {
    const task = upgradePlan.proofTasks[index] ?? upgradePlan.proofTasks[0];
    return {
      skillArea: topic.linkedGap || topic.title,
      skillCategory: task ? categoryForTask(task) : 'engineering',
      currentLevel: topic.priority <= 2 ? 'familiar' : 'aware',
      requiredLevel: 'proficient',
      priority: topic.priority,
      priorityReason: topic.rationale,
      longevity: 'high',
      aiRelationship: /ai|agent|llm|automation/i.test(topic.title)
        ? 'amplified'
        : 'unaffected',
      identifiedBy: 'system_inferred',
    };
  });

  const learningTopics: LearningTopic[] = upgradePlan.topics.map((topic) => ({
    title: topic.title,
    skillGapArea: topic.linkedGap || topic.title,
    rationale: topic.rationale,
    estimatedWeeks: clamp(topic.estimatedWeeks, 1, upgradePlan.durationWeeks),
    priority: topic.priority,
  }));

  const availableMinsDay = Math.max(
    20,
    Math.round((upgradePlan.weeklyCommitmentHours * 60) / 5),
  );

  return {
    classification: {
      title: `Prepare for ${targetRole.title}`,
      goalType: 'career',
      timeHorizon: 'short_term',
      urgency: 'planning',
      emotionalDriver: 'growth',
      statedWhy:
        'Convert market-readiness gaps into visible proof, stronger interview stories, and a more credible target-role profile.',
      successCriteria:
        'A role-specific proof portfolio, sharper resume positioning, and daily progress toward interview readiness.',
      targetDate: null,
      targetDateFlexibility: 'flexible',
      confidenceLevel: 72,
    },
    skillGaps,
    learningTopics,
    timeline: {
      estimatedWeeks: upgradePlan.durationWeeks,
      estimatedWeeksAtPace: upgradePlan.durationWeeks,
      availableMinsDay,
    },
  };
}

async function findExistingGoal(params: {
  userId: string;
  targetRoleId: string;
  linkedGoalId: string | null;
}): Promise<any | null> {
  const db = getDb();
  if (isObjectId(params.linkedGoalId)) {
    const linked = await db.collection('goals').findOne({
      _id: new ObjectId(params.linkedGoalId),
      userId: params.userId,
    });
    if (linked) return linked;
  }

  return db.collection('goals').findOne({
    userId: params.userId,
    'raw.source': 'target_role',
    'raw.targetRoleId': params.targetRoleId,
    status: { $ne: 'archived' },
  });
}

async function updateTargetRoleExecutionLinks(params: {
  userId: string;
  targetRoleId: string;
  goalId: string;
  sprintId?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE candidate_target_roles
        SET linked_goal_id = $3,
            linked_sprint_id = COALESCE($4::uuid, linked_sprint_id),
            status = CASE
              WHEN $4::uuid IS NOT NULL THEN 'sprint_active'
              WHEN status IN ('saved', 'assessed') THEN 'upgrade_plan_created'
              ELSE status
            END,
            updated_at = NOW()
      WHERE user_id = $1
        AND id = $2`,
    [
      params.userId,
      params.targetRoleId,
      params.goalId,
      params.sprintId ?? null,
    ],
  );
}

async function getSprintId(userId: string, goalId: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id::text
       FROM goal_sprints
      WHERE user_id = $1
        AND goal_id = $2
      LIMIT 1`,
    [userId, goalId],
  );
  return rows[0]?.id ?? null;
}

function proofTaskDescription(task: ProofRecommendation): string {
  const criteria = task.acceptanceCriteria
    .slice(0, 3)
    .map((item) => `- ${item}`)
    .join('\n');
  return [
    task.whyItMatters,
    '',
    `Expected output: ${task.expectedOutput}`,
    criteria ? `\nAcceptance criteria:\n${criteria}` : '',
  ].join('\n');
}

function findTopicIdForProofTask(params: {
  topicDocs: any[];
  topic: UpgradePlanTopic | undefined;
  index: number;
}): string | null {
  const { topicDocs, topic, index } = params;
  const matched = topic
    ? topicDocs.find((doc) => doc?.structured?.title === topic.title)
    : null;
  return (matched ?? topicDocs[index] ?? topicDocs[0])?._id?.toString() ?? null;
}

async function seedProofTasksForToday(params: {
  userId: string;
  goalId: string;
  upgradePlan: UpgradePlan;
}): Promise<void> {
  const { rows: existingRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM concept_nodes
      WHERE user_id = $1
        AND goal_id = $2`,
    [params.userId, params.goalId],
  );
  if (Number.parseInt(existingRows[0]?.count ?? '0', 10) > 0) {
    return;
  }

  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(params.goalId),
    userId: params.userId,
  });
  const topicDocs = Array.isArray(goal?.learningTopics) ? goal.learningTopics : [];
  if (topicDocs.length === 0 || params.upgradePlan.proofTasks.length === 0) {
    return;
  }

  for (const [index, task] of params.upgradePlan.proofTasks.slice(0, 8).entries()) {
    const topic = params.upgradePlan.topics[index] ?? params.upgradePlan.topics[0];
    await pool.query(
      `INSERT INTO concept_nodes
         (user_id,
          goal_id,
          learning_topic_id,
          title,
          description,
          depth_level,
          boundary_type,
          node_type,
          estimated_mins,
          longevity,
          ai_relationship,
          resources,
          status,
          position)
       VALUES ($1, $2, $3, $4, $5, $6, 'core', 'skill', $7, 'high', 'amplified', '[]'::jsonb, 'available', $8)`,
      [
        params.userId,
        params.goalId,
        findTopicIdForProofTask({ topicDocs, topic, index }),
        task.title,
        proofTaskDescription(task),
        task.difficulty === 'large' ? 'intermediate' : 'surface',
        clamp(task.estimatedHours * 60, 30, 180),
        index + 1,
      ],
    );
  }
}

async function activateGoalForSprint(userId: string, goalId: string): Promise<void> {
  const db = getDb();
  const objectId = new ObjectId(goalId);
  await db.collection('goals').updateMany(
    { userId, isPrimary: true, _id: { $ne: objectId } },
    { $set: { isPrimary: false } },
  );
  await db.collection('goals').updateOne(
    { _id: objectId, userId },
    {
      $set: {
        status: 'active',
        stage: 'action',
        isPrimary: true,
        updatedAt: new Date(),
      },
    },
  );
}

export async function createGoalFromTargetRoleUpgradePlan(params: {
  userId: string;
  targetRoleId: string;
  upgradePlanId?: string | null;
}): Promise<CreateGoalFromTargetRoleResponse> {
  const targetRole = await getTargetRole(params.userId, params.targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const upgradePlan = params.upgradePlanId
    ? await getUpgradePlanForTargetRole(
        params.userId,
        params.targetRoleId,
        params.upgradePlanId,
      )
    : await getLatestUpgradePlanForTargetRole(params.userId, params.targetRoleId);
  if (!upgradePlan) {
    const error = new Error('Create an upgrade plan before starting execution.');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const existingGoal = await findExistingGoal({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    linkedGoalId: targetRole.linkedGoalId ?? upgradePlan.linkedGoalId,
  });
  if (existingGoal) {
    const goalId = existingGoal._id.toString();
    await updateTargetRoleExecutionLinks({
      userId: params.userId,
      targetRoleId: params.targetRoleId,
      goalId,
    });
    await linkUpgradePlanExecution(params.userId, params.targetRoleId, upgradePlan.id, {
      goalId,
    });
    const response: CreateGoalFromTargetRoleResponse = {
      targetRoleId: params.targetRoleId,
      upgradePlanId: upgradePlan.id,
      goalId,
      goalUrl: `/goals/${goalId}?source=target-role`,
      reusedGoal: true,
    };
    assertValidCreateGoalFromTargetRoleResponse(response);
    return response;
  }

  const db = getDb();
  const activeGoalCount = await db.collection('goals').countDocuments({
    userId: params.userId,
    status: { $in: ACTIVE_GOAL_STATUSES },
  });
  await assertBelowStateLimit(params.userId, 'goals.active.max', activeGoalCount);

  const roleProfile = getRoleMarketProfile(targetRole.roleProfileId);
  const rawInput = buildGoalInput({ targetRole, upgradePlan });
  const now = new Date();

  await db.collection('goals').updateMany(
    { userId: params.userId, isPrimary: true },
    { $set: { isPrimary: false } },
  );

  const result = await db.collection('goals').insertOne({
    _id: new ObjectId(),
    userId: params.userId,
    raw: {
      input: rawInput,
      capturedAt: now,
      source: 'target_role',
      targetRoleId: targetRole.id,
      targetRoleTitle: targetRole.title,
      roleProfileId: roleProfile.id,
      upgradePlanId: upgradePlan.id,
    },
    structured: {},
    skillGaps: [],
    learningTopics: [],
    milestones: [],
    adjustments: [],
    reflections: [],
    sprint: null,
    status: 'intake_in_progress',
    stage: 'intake',
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
    achievedAt: null,
    abandonedAt: null,
    abandonedReason: null,
  });

  const goalId = result.insertedId.toString();
  await saveGoalInput(goalId, params.userId, {
    type: 'text',
    source: 'goal_intake',
    content: rawInput,
  });

  const plan = buildPlanFromTargetRole({ targetRole, upgradePlan });
  await updateGoalWithPlan(
    goalId,
    plan.skillGaps,
    plan.learningTopics,
    plan.timeline,
    plan.classification,
  );
  await updateTargetRoleExecutionLinks({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    goalId,
  });
  await linkUpgradePlanExecution(params.userId, params.targetRoleId, upgradePlan.id, {
    goalId,
  });

  const response: CreateGoalFromTargetRoleResponse = {
    targetRoleId: params.targetRoleId,
    upgradePlanId: upgradePlan.id,
    goalId,
    goalUrl: `/goals/${goalId}?source=target-role`,
    reusedGoal: false,
  };
  assertValidCreateGoalFromTargetRoleResponse(response);
  return response;
}

export async function startSprintFromTargetRoleUpgradePlan(params: {
  userId: string;
  targetRoleId: string;
  upgradePlanId: string;
}): Promise<StartUpgradePlanSprintResponse> {
  const targetRole = await getTargetRole(params.userId, params.targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const upgradePlan = await getUpgradePlanForTargetRole(
    params.userId,
    params.targetRoleId,
    params.upgradePlanId,
  );
  if (!upgradePlan) {
    const error = new Error('Upgrade plan not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const goalResponse = await createGoalFromTargetRoleUpgradePlan(params);
  const reusedGoal = goalResponse.reusedGoal;

  const existingSprintId = upgradePlan.linkedSprintId ?? targetRole.linkedSprintId;
  if (existingSprintId) {
    await activateGoalForSprint(params.userId, goalResponse.goalId);
    await seedProofTasksForToday({
      userId: params.userId,
      goalId: goalResponse.goalId,
      upgradePlan,
    });
    await updateTargetRoleExecutionLinks({
      userId: params.userId,
      targetRoleId: params.targetRoleId,
      goalId: goalResponse.goalId,
      sprintId: existingSprintId,
    });
    await linkUpgradePlanExecution(params.userId, params.targetRoleId, upgradePlan.id, {
      goalId: goalResponse.goalId,
      sprintId: existingSprintId,
    });
    const response: StartUpgradePlanSprintResponse = {
      targetRoleId: params.targetRoleId,
      upgradePlanId: upgradePlan.id,
      goalId: goalResponse.goalId,
      sprintId: existingSprintId,
      goalUrl: goalResponse.goalUrl,
      todayUrl: '/today',
      reusedGoal,
      reusedSprint: true,
    };
    assertValidStartUpgradePlanSprintResponse(response);
    return response;
  }

  const blockers = uniqueStrings(
    [
      ...upgradePlan.topics.map((topic) => `${topic.linkedGap}: ${topic.rationale}`),
      ...upgradePlan.risks,
    ],
    8,
  );
  const successEvidence = uniqueStrings(
    [
      ...upgradePlan.successEvidence,
      ...upgradePlan.proofTasks.map((task) => task.expectedOutput),
    ],
    8,
  );

  await saveGoalSprintDefinition(params.userId, goalResponse.goalId, {
    sprintType: 'standard',
    targetRole: targetRole.title,
    targetCompany: null,
    targetDate: null,
    weeklyCommitmentHours: upgradePlan.weeklyCommitmentHours,
    currentBlockers: blockers,
    successEvidence,
  });
  await activateGoalForSprint(params.userId, goalResponse.goalId);
  await seedProofTasksForToday({
    userId: params.userId,
    goalId: goalResponse.goalId,
    upgradePlan,
  });
  await rebaselineGoalSprint(params.userId, goalResponse.goalId);

  const sprintId = await getSprintId(params.userId, goalResponse.goalId);
  if (!sprintId) {
    throw new Error('Sprint could not be created.');
  }

  await updateTargetRoleExecutionLinks({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    goalId: goalResponse.goalId,
    sprintId,
  });
  await linkUpgradePlanExecution(params.userId, params.targetRoleId, upgradePlan.id, {
    goalId: goalResponse.goalId,
    sprintId,
  });

  const response: StartUpgradePlanSprintResponse = {
    targetRoleId: params.targetRoleId,
    upgradePlanId: upgradePlan.id,
    goalId: goalResponse.goalId,
    sprintId,
    goalUrl: goalResponse.goalUrl,
    todayUrl: '/today',
    reusedGoal,
    reusedSprint: false,
  };
  assertValidStartUpgradePlanSprintResponse(response);
  return response;
}
