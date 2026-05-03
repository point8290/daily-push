import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PipelineStepStatus = 'pending' | 'running' | 'done' | 'failed';
export type PipelineRunStatus  = 'running' | 'done' | 'partial' | 'failed';
export type PipelineRunType    = 'intake' | 'decompose';

export interface PipelineStep {
  id: string;
  label: string;
  status: PipelineStepStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface PipelineRun {
  type: PipelineRunType;
  status: PipelineRunStatus;
  steps: PipelineStep[];
  startedAt: Date;
  completedAt?: Date;
  emailSent: boolean;
}

// ─────────────────────────────────────────────
// Step builders
// ─────────────────────────────────────────────

export function buildIntakeSteps(): PipelineStep[] {
  return [
    { id: 'decision_routing',   label: 'Matching your goal profile',  status: 'pending' },
    { id: 'profile_extraction', label: 'Extracting your profile',     status: 'pending' },
    { id: 'goal_classification',label: 'Classifying your goal',       status: 'pending' },
    { id: 'skill_gap_analysis', label: 'Identifying skill gaps',      status: 'pending' },
    { id: 'topic_mapping',      label: 'Building your learning path', status: 'pending' },
    { id: 'timeline_estimation',label: 'Estimating your timeline',    status: 'pending' },
  ];
}

export function buildDecomposeSteps(topics: Array<{ title: string }>): PipelineStep[] {
  const steps: PipelineStep[] = topics.map((t, i) => ({
    id: `topic_decompose_${i}`,
    label: `Breaking down: ${t.title}`,
    status: 'pending' as const,
  }));
  steps.push({ id: 'unlock_logic', label: 'Unlocking your first nodes', status: 'pending' });
  return steps;
}

// ─────────────────────────────────────────────
// MongoDB helpers
// ─────────────────────────────────────────────

export async function initPipelineRun(
  goalId: string,
  type: PipelineRunType,
  steps: PipelineStep[]
): Promise<void> {
  const db = getDb();
  const run: PipelineRun = {
    type,
    status: 'running',
    steps,
    startedAt: new Date(),
    emailSent: false,
  };
  await db.collection('goals').updateOne(
    { _id: new ObjectId(goalId) },
    { $set: { pipelineRun: run } }
  );
}

export async function setStepStatus(
  goalId: string,
  stepId: string,
  status: PipelineStepStatus,
  error?: string
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const setFields: Record<string, unknown> = {
    'pipelineRun.steps.$.status': status,
  };
  if (status === 'running') setFields['pipelineRun.steps.$.startedAt'] = now;
  if (status === 'done' || status === 'failed') setFields['pipelineRun.steps.$.completedAt'] = now;
  if (error) setFields['pipelineRun.steps.$.error'] = error;

  await db.collection('goals').updateOne(
    { _id: new ObjectId(goalId), 'pipelineRun.steps.id': stepId },
    { $set: setFields }
  );
}

export async function finalizePipelineRun(goalId: string): Promise<PipelineRunStatus> {
  const db = getDb();
  const goal = await db.collection('goals').findOne(
    { _id: new ObjectId(goalId) },
    { projection: { 'pipelineRun.steps': 1 } }
  );

  const steps: PipelineStep[] = goal?.pipelineRun?.steps ?? [];

  // Only decompose + unlock steps determine overall success (enrichment is informational)
  const coreSteps = steps.filter(
    (s) => s.id.startsWith('topic_decompose_') || s.id === 'unlock_logic'
  );
  const decisiveSteps = coreSteps.length > 0 ? coreSteps : steps;

  const anyFailed = decisiveSteps.some((s) => s.status === 'failed');
  const allFailed = decisiveSteps.every((s) => s.status === 'failed');
  const anyDone   = decisiveSteps.some((s) => s.status === 'done');

  let status: PipelineRunStatus;
  if (allFailed) {
    status = 'failed';
  } else if (anyFailed && anyDone) {
    status = 'partial';
  } else {
    status = 'done';
  }

  await db.collection('goals').updateOne(
    { _id: new ObjectId(goalId) },
    { $set: { 'pipelineRun.status': status, 'pipelineRun.completedAt': new Date() } }
  );

  return status;
}

export async function getPipelineRun(
  goalId: string,
  userId: string
): Promise<PipelineRun | null> {
  const db = getDb();
  const goal = await db.collection('goals').findOne(
    { _id: new ObjectId(goalId), userId },
    { projection: { pipelineRun: 1 } }
  );
  return (goal?.pipelineRun as PipelineRun) ?? null;
}

export async function markEmailSent(goalId: string): Promise<void> {
  const db = getDb();
  await db.collection('goals').updateOne(
    { _id: new ObjectId(goalId) },
    { $set: { 'pipelineRun.emailSent': true } }
  );
}
