import { pool } from '../db/postgres';
import { buildUserContext } from './userContext';

export type SessionTaskType =
  | 'explain'
  | 'design'
  | 'code'
  | 'apply'
  | 'review';

export type ArtifactType = 'text' | 'notes' | 'plan' | 'code';

export interface RubricDimension {
  key: 'correctness' | 'clarity' | 'depth' | 'application';
  label: string;
  description: string;
}

export interface ArtifactEvaluationResult {
  score: number;
  feedback: string;
  correct: boolean;
  rubricScores: Array<{
    dimension: RubricDimension['key'];
    score: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  retryPrompt: string;
}

export interface SessionTaskPayload {
  sessionId: string;
  nodeId: string;
  goalId: string;
  taskType: SessionTaskType;
  artifactType: ArtifactType;
  title: string;
  prompt: string;
  instructions: string[];
  successCriteria: string[];
  suggestedLength: string;
  rubric: RubricDimension[];
  artifact: {
    content: string | null;
    status: 'draft' | 'submitted' | 'evaluated';
    score: number | null;
    feedback: string | null;
    evaluation: ArtifactEvaluationResult | null;
  } | null;
}

interface SessionTaskContextRow {
  session_id: string;
  node_id: string;
  goal_id: string;
  session_type: 'new' | 'review' | 'revisit';
  title: string;
  description: string | null;
  depth_level: 'surface' | 'foundational' | 'intermediate' | 'advanced';
  estimated_mins: number | null;
}

interface ArtifactRow {
  session_id: string;
  task_type: SessionTaskType;
  artifact_type: ArtifactType;
  prompt: string;
  instructions: string[];
  success_criteria: string[];
  rubric: RubricDimension[];
  content: string | null;
  status: 'draft' | 'submitted' | 'evaluated';
  score: number | null;
  feedback: string | null;
  evaluation: ArtifactEvaluationResult | Record<string, unknown> | null;
}

const DEFAULT_RUBRIC: RubricDimension[] = [
  {
    key: 'correctness',
    label: 'Correctness',
    description: 'Does the response capture the real technical idea without major errors?',
  },
  {
    key: 'clarity',
    label: 'Clarity',
    description: 'Is the thinking easy to follow and specific rather than vague?',
  },
  {
    key: 'depth',
    label: 'Depth',
    description: 'Does the response include enough nuance, trade-offs, or structure for the concept level?',
  },
  {
    key: 'application',
    label: 'Application',
    description: 'Does the response connect the concept to a real use case, decision, or action?',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function getSessionTaskContext(
  sessionId: string,
  userId: string,
): Promise<SessionTaskContextRow> {
  const { rows } = await pool.query<SessionTaskContextRow>(
    `SELECT
       ss.id AS session_id,
       ss.node_id,
       cn.goal_id,
       ss.session_type,
       cn.title,
       cn.description,
       cn.depth_level,
       cn.estimated_mins
     FROM study_sessions ss
     INNER JOIN concept_nodes cn
       ON cn.id = ss.node_id
     WHERE ss.id = $1
       AND ss.user_id = $2`,
    [sessionId, userId],
  );

  if (rows.length === 0) {
    throw new Error('Session not found');
  }

  return rows[0];
}

function inferTaskType(context: SessionTaskContextRow): SessionTaskType {
  if (context.session_type === 'review') {
    return 'review';
  }

  const signal = `${context.title} ${context.description ?? ''}`.toLowerCase();

  if (/(design|architecture|system|scal|throughput|latency|api contract)/.test(signal)) {
    return 'design';
  }
  if (/(algorithm|implement|code|component|function|query|hook|schema|endpoint)/.test(signal)) {
    return 'code';
  }
  if (context.depth_level === 'intermediate' || context.depth_level === 'advanced') {
    return 'apply';
  }

  return 'explain';
}

function artifactTypeForTask(taskType: SessionTaskType): ArtifactType {
  if (taskType === 'design') return 'plan';
  if (taskType === 'code') return 'code';
  if (taskType === 'apply') return 'notes';
  return 'text';
}

function suggestedLengthForTask(taskType: SessionTaskType): string {
  switch (taskType) {
    case 'design':
      return '120-220 words';
    case 'code':
      return '8-20 lines of pseudocode or implementation notes';
    case 'apply':
      return '100-180 words';
    case 'review':
      return '80-140 words';
    case 'explain':
    default:
      return '90-160 words';
  }
}

async function buildTaskDefinition(
  context: SessionTaskContextRow,
  userId: string,
): Promise<Omit<SessionTaskPayload, 'sessionId' | 'artifact'>> {
  const taskType = inferTaskType(context);
  const artifactType = artifactTypeForTask(taskType);
  const learnerContext = await buildUserContext(userId, context.goal_id);
  const goalTitle = learnerContext.goalTitle ?? 'your current goal';
  const roleLabel = learnerContext.jobTitle ?? learnerContext.seniorityLevel ?? 'developer';
  const reviewDueCount = learnerContext.nodeStats.reviewDueCount;

  switch (taskType) {
    case 'design':
      return {
        nodeId: context.node_id,
        goalId: context.goal_id,
        taskType,
        artifactType,
        title: `Design with ${context.title}`,
        prompt: `Write a short design note showing how you would use ${context.title} to move ${goalTitle} forward.`,
        instructions: [
          'State the problem or decision this concept helps with.',
          'Outline the approach, steps, or system shape you would choose.',
          'Call out one trade-off, risk, or edge case you would watch.',
        ],
        successCriteria: [
          'The design is concrete enough that a teammate could review it.',
          'You explain at least one trade-off, not just the happy path.',
          `You connect the decision back to ${goalTitle}.`,
        ],
        suggestedLength: suggestedLengthForTask(taskType),
        rubric: DEFAULT_RUBRIC,
      };
    case 'code':
      return {
        nodeId: context.node_id,
        goalId: context.goal_id,
        taskType,
        artifactType,
        title: `Implementation sketch for ${context.title}`,
        prompt: `Write a pseudocode or implementation sketch that uses ${context.title} the way a strong ${roleLabel} would.`,
        instructions: [
          'Show the main flow or structure, not just isolated fragments.',
          'Name the important inputs, outputs, or decision points.',
          'Note one place where this could fail or need refinement.',
        ],
        successCriteria: [
          'The sketch is specific enough to implement from.',
          'It reflects the core concept correctly.',
          'You include at least one practical caveat or next step.',
        ],
        suggestedLength: suggestedLengthForTask(taskType),
        rubric: DEFAULT_RUBRIC,
      };
    case 'apply':
      return {
        nodeId: context.node_id,
        goalId: context.goal_id,
        taskType,
        artifactType,
        title: `Apply ${context.title}`,
        prompt: `Describe how you would apply ${context.title} in a real scenario related to ${goalTitle}.`,
        instructions: [
          'Pick a realistic scenario rather than speaking in abstractions.',
          'Explain what you would do first, second, and why.',
          'Mention how you would know the approach is working.',
        ],
        successCriteria: [
          'The scenario is believable and close to real work.',
          'Your plan shows decision-making, not just definition recall.',
          'You include a way to validate or measure the result.',
        ],
        suggestedLength: suggestedLengthForTask(taskType),
        rubric: DEFAULT_RUBRIC,
      };
    case 'review':
      return {
        nodeId: context.node_id,
        goalId: context.goal_id,
        taskType,
        artifactType,
        title: `Teach back ${context.title}`,
        prompt: `From memory, teach back ${context.title}, then name one common mistake and how you would avoid it next time.`,
        instructions: [
          'Explain the concept in your own words without copying definitions.',
          'Add one practical example or contrast with a wrong approach.',
          `Use this review to reduce your ${reviewDueCount > 0 ? `${reviewDueCount} review due node${reviewDueCount === 1 ? '' : 's'}` : 'future review load'}.`,
        ],
        successCriteria: [
          'You reconstruct the core idea from memory.',
          'You identify at least one misconception, pitfall, or boundary.',
          'Your explanation sounds teachable, not just memorized.',
        ],
        suggestedLength: suggestedLengthForTask(taskType),
        rubric: DEFAULT_RUBRIC,
      };
    case 'explain':
    default:
      return {
        nodeId: context.node_id,
        goalId: context.goal_id,
        taskType: 'explain',
        artifactType,
        title: `Explain ${context.title}`,
        prompt: `Explain ${context.title} as if you were onboarding another ${roleLabel} who is working toward ${goalTitle}.`,
        instructions: [
          'State the core idea in plain language first.',
          'Add one concrete example of where it matters.',
          'Name one trade-off, limitation, or misconception to avoid.',
        ],
        successCriteria: [
          'The explanation is technically correct.',
          'A peer could use it without needing extra context.',
          'You include at least one nuance beyond the basic definition.',
        ],
        suggestedLength: suggestedLengthForTask('explain'),
        rubric: DEFAULT_RUBRIC,
      };
  }
}

function normalizeArtifactRow(
  row: ArtifactRow | undefined,
): SessionTaskPayload['artifact'] {
  if (!row) return null;

  const evaluation =
    row.evaluation && typeof row.evaluation === 'object' && 'score' in row.evaluation
      ? (row.evaluation as ArtifactEvaluationResult)
      : null;

  return {
    content: row.content ?? null,
    status: row.status,
    score: row.score ?? null,
    feedback: row.feedback ?? null,
    evaluation,
  };
}

export async function getSessionTask(
  sessionId: string,
  userId: string,
): Promise<SessionTaskPayload> {
  const context = await getSessionTaskContext(sessionId, userId);
  const { rows } = await pool.query<ArtifactRow>(
    `SELECT
       session_id,
       task_type,
       artifact_type,
       prompt,
       instructions,
       success_criteria,
       rubric,
       content,
       status,
       score,
       feedback,
       evaluation
     FROM session_artifacts
     WHERE session_id = $1
       AND user_id = $2`,
    [sessionId, userId],
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      sessionId,
      nodeId: context.node_id,
      goalId: context.goal_id,
      taskType: row.task_type,
      artifactType: row.artifact_type,
      title: context.title,
      prompt: row.prompt,
      instructions: row.instructions ?? [],
      successCriteria: row.success_criteria ?? [],
      suggestedLength: suggestedLengthForTask(row.task_type),
      rubric: row.rubric ?? DEFAULT_RUBRIC,
      artifact: normalizeArtifactRow(row),
    };
  }

  const task = await buildTaskDefinition(context, userId);

  await pool.query(
    `INSERT INTO session_artifacts
       (
         session_id,
         user_id,
         node_id,
         task_type,
         artifact_type,
         prompt,
         instructions,
         success_criteria,
         rubric,
         status,
         created_at,
         updated_at
       )
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, 'draft', NOW(), NOW())
     ON CONFLICT (session_id)
     DO NOTHING`,
    [
      sessionId,
      userId,
      context.node_id,
      task.taskType,
      task.artifactType,
      task.prompt,
      JSON.stringify(task.instructions),
      JSON.stringify(task.successCriteria),
      JSON.stringify(task.rubric),
    ],
  );

  return {
    sessionId,
    ...task,
    title: context.title,
    artifact: null,
  };
}

export async function saveSessionArtifact(
  sessionId: string,
  userId: string,
  content: string,
): Promise<SessionTaskPayload> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Artifact content is required');
  }

  const task = await getSessionTask(sessionId, userId);
  await pool.query(
    `UPDATE session_artifacts
        SET content = $3,
            status = 'submitted',
            updated_at = NOW()
      WHERE session_id = $1
        AND user_id = $2`,
    [sessionId, userId, trimmed],
  );

  return {
    ...task,
    artifact: {
      ...(task.artifact ?? {
        score: null,
        feedback: null,
        evaluation: null,
      }),
      content: trimmed,
      status: 'submitted',
    },
  };
}
