import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import type { ArtifactEvaluationResult } from './sessionTasks';

export type ArtifactExportFormat = 'markdown' | 'json';

export interface ExportArtifactEntry {
  sessionId: string;
  nodeId: string;
  nodeTitle: string;
  nodeDescription: string | null;
  depthLevel: string;
  sessionType: 'new' | 'review' | 'revisit';
  taskType: string;
  artifactType: string;
  prompt: string;
  instructions: string[];
  successCriteria: string[];
  content: string | null;
  status: 'draft' | 'submitted' | 'evaluated';
  score: number | null;
  feedback: string | null;
  evaluation: ArtifactEvaluationResult | null;
  durationMins: number | null;
  confidenceAfter: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GoalArtifactExportPayload {
  goalId: string;
  goalTitle: string;
  exportedAt: string;
  artifactCount: number;
  artifacts: ExportArtifactEntry[];
}

interface GoalDocument {
  structured?: {
    title?: string | null;
  };
}

interface ArtifactExportRow {
  session_id: string;
  node_id: string;
  node_title: string;
  node_description: string | null;
  depth_level: string;
  session_type: 'new' | 'review' | 'revisit';
  task_type: string;
  artifact_type: string;
  prompt: string;
  instructions: string[] | null;
  success_criteria: string[] | null;
  content: string | null;
  status: 'draft' | 'submitted' | 'evaluated';
  score: number | null;
  feedback: string | null;
  evaluation: ArtifactEvaluationResult | Record<string, unknown> | null;
  duration_mins: number | null;
  confidence_after: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => trimToNull(entry))
    .filter((entry): entry is string => entry !== null);
}

function safeEvaluation(value: unknown): ArtifactEvaluationResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const maybe = value as Partial<ArtifactEvaluationResult>;
  if (typeof maybe.score !== 'number' || !Array.isArray(maybe.rubricScores)) {
    return null;
  }

  return {
    score: maybe.score,
    feedback: trimToNull(maybe.feedback) ?? '',
    correct: Boolean(maybe.correct),
    rubricScores: maybe.rubricScores.map((row) => ({
      dimension:
        row.dimension === 'clarity' ||
        row.dimension === 'depth' ||
        row.dimension === 'application'
          ? row.dimension
          : 'correctness',
      score: typeof row.score === 'number' ? row.score : 0,
      feedback: trimToNull(row.feedback) ?? '',
    })),
    strengths: normalizeList(maybe.strengths),
    improvements: normalizeList(maybe.improvements),
    retryPrompt: trimToNull(maybe.retryPrompt) ?? '',
  };
}

function sanitizeFilenameSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'goal-artifacts'
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not completed';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not completed';
  return parsed.toISOString();
}

async function getGoalDocument(
  userId: string,
  goalId: string,
): Promise<GoalDocument | null> {
  const db = getDb();
  try {
    return (await db.collection('goals').findOne({
      _id: new ObjectId(goalId),
      userId,
    })) as GoalDocument | null;
  } catch {
    return null;
  }
}

export async function buildGoalArtifactExport(
  userId: string,
  goalId: string,
): Promise<GoalArtifactExportPayload> {
  const goal = await getGoalDocument(userId, goalId);
  if (!goal) {
    const error = new Error('Goal not found');
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }

  const { rows } = await pool.query<ArtifactExportRow>(
    `SELECT
       sa.session_id,
       sa.node_id,
       cn.title AS node_title,
       cn.description AS node_description,
       cn.depth_level,
       ss.session_type,
       sa.task_type,
       sa.artifact_type,
       sa.prompt,
       sa.instructions,
       sa.success_criteria,
       sa.content,
       sa.status,
       sa.score,
       sa.feedback,
       sa.evaluation,
       ss.duration_mins,
       ss.confidence_after,
       sa.created_at::text,
       sa.updated_at::text,
       ss.completed_at::text
     FROM session_artifacts sa
     INNER JOIN concept_nodes cn
       ON cn.id = sa.node_id
     INNER JOIN study_sessions ss
       ON ss.id = sa.session_id
     WHERE sa.user_id = $1
       AND cn.user_id = $1
       AND cn.goal_id = $2
     ORDER BY
       COALESCE(ss.completed_at, sa.updated_at, sa.created_at) ASC,
       cn.position ASC,
       sa.created_at ASC`,
    [userId, goalId],
  );

  const artifacts = rows.map((row) => ({
    sessionId: row.session_id,
    nodeId: row.node_id,
    nodeTitle: row.node_title,
    nodeDescription: trimToNull(row.node_description),
    depthLevel: row.depth_level,
    sessionType: row.session_type,
    taskType: row.task_type,
    artifactType: row.artifact_type,
    prompt: row.prompt,
    instructions: normalizeList(row.instructions),
    successCriteria: normalizeList(row.success_criteria),
    content: trimToNull(row.content),
    status: row.status,
    score: row.score,
    feedback: trimToNull(row.feedback),
    evaluation: safeEvaluation(row.evaluation),
    durationMins: row.duration_mins,
    confidenceAfter: row.confidence_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }));

  return {
    goalId,
    goalTitle: trimToNull(goal.structured?.title) ?? 'Active goal',
    exportedAt: new Date().toISOString(),
    artifactCount: artifacts.length,
    artifacts,
  };
}

export function renderGoalArtifactExportMarkdown(
  payload: GoalArtifactExportPayload,
): string {
  const lines: string[] = [
    `# Artifact Export: ${payload.goalTitle}`,
    '',
    `- Goal ID: ${payload.goalId}`,
    `- Exported at: ${payload.exportedAt}`,
    `- Artifacts: ${payload.artifactCount}`,
    '',
  ];

  if (payload.artifacts.length === 0) {
    lines.push('No saved session artifacts exist for this goal yet.');
    return lines.join('\n');
  }

  payload.artifacts.forEach((artifact, index) => {
    lines.push(`## ${index + 1}. ${artifact.nodeTitle}`);
    lines.push('');
    lines.push(`- Session type: ${artifact.sessionType}`);
    lines.push(`- Task type: ${artifact.taskType}`);
    lines.push(`- Artifact type: ${artifact.artifactType}`);
    lines.push(`- Status: ${artifact.status}`);
    lines.push(`- Completed at: ${formatDateTime(artifact.completedAt)}`);
    if (artifact.durationMins !== null) {
      lines.push(`- Duration: ${artifact.durationMins} minutes`);
    }
    if (artifact.confidenceAfter !== null) {
      lines.push(`- Confidence after: ${artifact.confidenceAfter}/5`);
    }
    if (artifact.score !== null) {
      lines.push(`- Evaluation score: ${artifact.score}/5`);
    }
    lines.push('');
    lines.push('### Prompt');
    lines.push('');
    lines.push(artifact.prompt);
    lines.push('');

    if (artifact.instructions.length > 0) {
      lines.push('### Instructions');
      lines.push('');
      artifact.instructions.forEach((instruction) => lines.push(`- ${instruction}`));
      lines.push('');
    }

    if (artifact.successCriteria.length > 0) {
      lines.push('### Success Criteria');
      lines.push('');
      artifact.successCriteria.forEach((criterion) => lines.push(`- ${criterion}`));
      lines.push('');
    }

    lines.push('### Artifact');
    lines.push('');
    lines.push('```');
    lines.push(artifact.content ?? '');
    lines.push('```');
    lines.push('');

    if (artifact.feedback) {
      lines.push('### Feedback');
      lines.push('');
      lines.push(artifact.feedback);
      lines.push('');
    }

    if (artifact.evaluation?.strengths.length) {
      lines.push('### Strengths');
      lines.push('');
      artifact.evaluation.strengths.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }

    if (artifact.evaluation?.improvements.length) {
      lines.push('### Improvements');
      lines.push('');
      artifact.evaluation.improvements.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
  });

  return lines.join('\n');
}

export function buildGoalArtifactExportFilename(
  payload: GoalArtifactExportPayload,
  format: ArtifactExportFormat,
): string {
  const base = sanitizeFilenameSegment(payload.goalTitle);
  return `${base}-artifacts.${format === 'json' ? 'json' : 'md'}`;
}
