import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import { callClaudeWithUsage, parseJSON } from './claude';
import { getGoalGapReportRecord } from './jobGapAnalysis';
import { recordLlmUsage } from './llmUsage';

export type MockInterviewMode =
  | 'system_design'
  | 'behavioral'
  | 'project_deep_dive';

export interface MockInterviewTurn {
  id: string;
  turnIndex: number;
  role: 'interviewer' | 'candidate';
  content: string;
  createdAt: string;
}

export interface MockInterviewScoreDimension {
  dimension: 'structure' | 'depth' | 'communication' | 'ownership';
  score: number;
  feedback: string;
}

export interface MockInterviewEvaluation {
  overallScore: number;
  verdict: 'needs_work' | 'solid' | 'strong';
  summary: string;
  rubricScores: MockInterviewScoreDimension[];
  strengths: string[];
  improvements: string[];
  retryPlan: string[];
  suggestedSprintEdits: string[];
}

export interface MockInterviewRun {
  id: string;
  goalId: string;
  mode: MockInterviewMode;
  status: 'in_progress' | 'completed' | 'abandoned';
  targetRole: string | null;
  focusArea: string | null;
  openingPrompt: string;
  latestPrompt: string;
  transcriptSummary: string | null;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  turns: MockInterviewTurn[];
  evaluation: MockInterviewEvaluation | null;
}

export interface MockInterviewHistoryItem {
  id: string;
  goalId: string;
  mode: MockInterviewMode;
  status: 'in_progress' | 'completed' | 'abandoned';
  targetRole: string | null;
  focusArea: string | null;
  overallScore: number | null;
  transcriptSummary: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface MockInterviewRunRow {
  id: string;
  goal_id: string;
  mode: MockInterviewMode;
  status: 'in_progress' | 'completed' | 'abandoned';
  target_role: string | null;
  focus_area: string | null;
  opening_prompt: string;
  latest_prompt: string;
  transcript_summary: string | null;
  evaluation: MockInterviewEvaluation | Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface MockInterviewTurnRow {
  id: string;
  turn_index: number;
  role: 'interviewer' | 'candidate';
  content: string;
  created_at: string;
}

const MODE_LABELS: Record<MockInterviewMode, string> = {
  system_design: 'System Design',
  behavioral: 'Behavioral',
  project_deep_dive: 'Project Deep Dive',
};

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  );
}

function safeEvaluation(value: unknown): MockInterviewEvaluation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const evaluation = value as Partial<MockInterviewEvaluation>;
  if (!evaluation.summary || !Array.isArray(evaluation.rubricScores)) {
    return null;
  }

  const rubricScores = evaluation.rubricScores
    .slice(0, 4)
    .map((dimension) => ({
      dimension:
        dimension.dimension === 'depth' ||
        dimension.dimension === 'communication' ||
        dimension.dimension === 'ownership'
          ? dimension.dimension
          : 'structure',
      score: clamp(Math.round(Number(dimension.score ?? 3)), 1, 5),
      feedback:
        trimToNull(dimension.feedback) ??
        'Tighten this dimension with one more concrete example.',
    })) as MockInterviewScoreDimension[];

  return {
    overallScore: clamp(Math.round(Number(evaluation.overallScore ?? 3)), 1, 5),
    verdict:
      evaluation.verdict === 'strong' || evaluation.verdict === 'solid'
        ? evaluation.verdict
        : 'needs_work',
    summary: trimToNull(evaluation.summary) ?? 'Keep tightening the story and trade-offs.',
    rubricScores,
    strengths: uniqueStrings(evaluation.strengths ?? []).slice(0, 6),
    improvements: uniqueStrings(evaluation.improvements ?? []).slice(0, 6),
    retryPlan: uniqueStrings(evaluation.retryPlan ?? []).slice(0, 6),
    suggestedSprintEdits: uniqueStrings(evaluation.suggestedSprintEdits ?? []).slice(0, 5),
  };
}

function fallbackOpeningPrompt(params: {
  mode: MockInterviewMode;
  goalTitle: string | null;
  targetRole: string | null;
  focusArea: string | null;
}): string {
  const { mode, goalTitle, targetRole, focusArea } = params;

  if (mode === 'behavioral') {
    return `Tell me about a time you took ownership of a meaningful engineering problem${targetRole ? ` while operating like a ${targetRole}` : ''}. What was the situation, what did you do, and what changed because of your work?`;
  }
  if (mode === 'project_deep_dive') {
    return `Walk me through the project${goalTitle ? ` behind "${goalTitle}"` : ''}${focusArea ? `, with extra focus on ${focusArea}` : ''}. Start with the problem, then explain what you owned, the architecture choices you made, and the outcomes.`;
  }
  return `Design ${focusArea ?? 'a backend system that needs to scale safely under real production load'}${targetRole ? ` as if you were interviewing for a ${targetRole} role` : ''}. Start by clarifying requirements, then outline the architecture, trade-offs, and how you would evolve it over time.`;
}

function transcriptToText(turns: MockInterviewTurnRow[]): string {
  return turns
    .map((turn) => `${turn.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${turn.content}`)
    .join('\n');
}

async function generateOpeningPrompt(params: {
  userId: string;
  goalId: string;
  mode: MockInterviewMode;
  goalTitle: string | null;
  targetRole: string | null;
  focusArea: string | null;
  missingSignals: string[];
}): Promise<string> {
  const fallback = fallbackOpeningPrompt(params);
  try {
    const response = await callClaudeWithUsage({
      system: `You are an expert engineering interviewer.
Generate one sharp opening interview question.
Return JSON only.`,
      userMessage: `Mode: ${params.mode}
Goal title: ${params.goalTitle ?? 'Unknown'}
Target role: ${params.targetRole ?? 'Unknown'}
Focus area: ${params.focusArea ?? 'None provided'}
Weak signals to probe: ${params.missingSignals.join(', ') || 'None listed'}

Return JSON:
{
  "openingPrompt": "Your opening interview question here"
}`,
      useCache: true,
    });
    await recordLlmUsage({
      userId: params.userId,
      goalId: params.goalId,
      featureKey: 'mock_interview_opening_prompt',
      operationKey: 'mock_opening_prompt',
      usage: response.usage,
      metadata: {
        mode: params.mode,
      },
    }).catch(() => {});
    const parsed = parseJSON<{ openingPrompt?: string }>(response.text);
    return trimToNull(parsed.openingPrompt) ?? fallback;
  } catch {
    return fallback;
  }
}

async function generateFollowUpPrompt(params: {
  userId: string;
  goalId: string;
  mode: MockInterviewMode;
  targetRole: string | null;
  focusArea: string | null;
  transcript: string;
}): Promise<string> {
  const fallback =
    params.mode === 'behavioral'
      ? 'What was the hardest part of that situation, and what trade-off or decision was most clearly yours?'
      : params.mode === 'project_deep_dive'
        ? 'What would you change if you had to ship the next version with twice the complexity or traffic?'
        : 'What is the biggest bottleneck or failure mode in your design, and how would you mitigate it?';

  try {
    const response = await callClaudeWithUsage({
      system: `You are an expert engineering interviewer.
Generate the single best follow-up question based on the transcript.
Return JSON only.`,
      userMessage: `Mode: ${params.mode}
Target role: ${params.targetRole ?? 'Unknown'}
Focus area: ${params.focusArea ?? 'None provided'}

Transcript:
"""
${params.transcript.slice(-5000)}
"""

Return JSON:
{
  "followUpPrompt": "Your follow-up question here"
}`,
      useCache: false,
    });
    await recordLlmUsage({
      userId: params.userId,
      goalId: params.goalId,
      featureKey: 'mock_interview_follow_up',
      operationKey: 'mock_follow_up_prompt',
      usage: response.usage,
      metadata: {
        mode: params.mode,
      },
    }).catch(() => {});
    const parsed = parseJSON<{ followUpPrompt?: string }>(response.text);
    return trimToNull(parsed.followUpPrompt) ?? fallback;
  } catch {
    return fallback;
  }
}

function fallbackEvaluation(params: {
  mode: MockInterviewMode;
  targetRole: string | null;
  transcript: string;
  candidateAnswers: string[];
  focusArea: string | null;
}): MockInterviewEvaluation {
  const { mode, targetRole, transcript, candidateAnswers, focusArea } = params;
  const text = transcript.toLowerCase();
  const answerLength = candidateAnswers.reduce((sum, answer) => sum + answer.length, 0);
  const structureScore = answerLength > 900 ? 4 : answerLength > 450 ? 3 : 2;
  const depthHits = [
    /\btrade[- ]off/i.test(text),
    /\bscale|scaling|throughput|latency/i.test(text),
    /\breliability|failure|fallback|monitor/i.test(text),
    /\bowner|ownership|led|mentor/i.test(text),
  ].filter(Boolean).length;
  const depthScore = clamp(1 + depthHits, 1, 5);
  const communicationScore = clamp(
    candidateAnswers.some((answer) => /\bfirst\b|\bthen\b|\bfinally\b/i.test(answer)) ? 4 : 3,
    1,
    5,
  );
  const ownershipScore = clamp(
    /\bi\b/.test(text) && /\bdecid|owned|led|shipped|changed\b/i.test(text) ? 4 : 3,
    1,
    5,
  );

  const overallScore = clamp(
    Math.round((structureScore + depthScore + communicationScore + ownershipScore) / 4),
    1,
    5,
  );

  return {
    overallScore,
    verdict: overallScore >= 4 ? 'strong' : overallScore >= 3 ? 'solid' : 'needs_work',
    summary:
      overallScore >= 4
        ? `This was a credible ${MODE_LABELS[mode].toLowerCase()} interview answer for ${targetRole ?? 'your target role'}, with enough detail to feel believable.`
        : overallScore >= 3
          ? `You have the bones of a good ${MODE_LABELS[mode].toLowerCase()} answer, but it still needs sharper structure and clearer trade-offs.`
          : `Right now the answer feels early for a ${targetRole ?? 'target'} interview. Tighten the structure and add more concrete decisions and outcomes.`,
    rubricScores: [
      {
        dimension: 'structure',
        score: structureScore,
        feedback: structureScore >= 4 ? 'Your answer had a clear shape.' : 'Lead with structure so the interviewer can follow your thinking faster.',
      },
      {
        dimension: 'depth',
        score: depthScore,
        feedback: depthScore >= 4 ? 'You covered meaningful trade-offs and operational detail.' : 'Add more trade-offs, constraints, and failure-mode thinking.',
      },
      {
        dimension: 'communication',
        score: communicationScore,
        feedback: communicationScore >= 4 ? 'The explanation is reasonably easy to follow.' : 'Use a more explicit narrative or framework when answering.',
      },
      {
        dimension: 'ownership',
        score: ownershipScore,
        feedback: ownershipScore >= 4 ? 'You made your contribution and decisions visible.' : 'Make your role, decisions, and impact more explicit.',
      },
    ],
    strengths: uniqueStrings([
      overallScore >= 3 ? 'You engaged the prompt with a plausible answer.' : null,
      depthScore >= 4 ? 'You mentioned concrete constraints, trade-offs, or scaling concerns.' : null,
      ownershipScore >= 4 ? 'Your personal decisions and ownership came through.' : null,
    ]),
    improvements: uniqueStrings([
      structureScore < 4 ? 'Open with a simple structure before diving into details.' : null,
      depthScore < 4 ? 'Add one deeper trade-off or failure-mode explanation.' : null,
      communicationScore < 4 ? 'Use shorter sections and clearer signposting.' : null,
      ownershipScore < 4 ? 'Be more explicit about what you owned and what changed because of your work.' : null,
    ]),
    retryPlan: uniqueStrings([
      `Retry the ${MODE_LABELS[mode].toLowerCase()} answer with a 3-part structure: context, decisions, outcomes.`,
      focusArea ? `Stay anchored on ${focusArea} instead of drifting into generic examples.` : null,
      'Include one concrete metric, risk, or trade-off that makes the answer feel senior.',
    ]),
    suggestedSprintEdits: uniqueStrings([
      depthScore < 4 ? 'Add one weekly artifact that forces you to explain trade-offs in writing.' : null,
      ownershipScore < 4 ? 'Create a short project story bank focused on ownership and impact.' : null,
      mode === 'system_design' ? 'Practice one system-design walkthrough each week with explicit bottleneck analysis.' : null,
    ]),
  };
}

async function evaluateTranscript(params: {
  userId: string;
  goalId: string;
  mode: MockInterviewMode;
  targetRole: string | null;
  focusArea: string | null;
  transcript: string;
  candidateAnswers: string[];
  missingSignals: string[];
}): Promise<MockInterviewEvaluation> {
  const fallback = fallbackEvaluation(params);
  try {
    const response = await callClaudeWithUsage({
      system: `You are a senior engineering interviewer.
Evaluate the candidate transcript and return a scorecard in JSON only.`,
      userMessage: `Mode: ${params.mode}
Target role: ${params.targetRole ?? 'Unknown'}
Focus area: ${params.focusArea ?? 'None provided'}
Weak signals to probe: ${params.missingSignals.join(', ') || 'None listed'}

Transcript:
"""
${params.transcript.slice(-7000)}
"""

Return JSON:
{
  "overallScore": 3,
  "verdict": "solid",
  "summary": "Short summary",
  "rubricScores": [
    { "dimension": "structure", "score": 3, "feedback": "..." },
    { "dimension": "depth", "score": 3, "feedback": "..." },
    { "dimension": "communication", "score": 3, "feedback": "..." },
    { "dimension": "ownership", "score": 3, "feedback": "..." }
  ],
  "strengths": ["..."],
  "improvements": ["..."],
  "retryPlan": ["..."],
  "suggestedSprintEdits": ["..."]
}`,
      useCache: false,
    });
    await recordLlmUsage({
      userId: params.userId,
      goalId: params.goalId,
      featureKey: 'mock_interview_evaluation',
      operationKey: 'mock_transcript_evaluation',
      usage: response.usage,
      metadata: {
        mode: params.mode,
      },
    }).catch(() => {});

    return safeEvaluation(parseJSON<MockInterviewEvaluation>(response.text)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function getRunRow(runId: string, userId: string): Promise<MockInterviewRunRow | null> {
  const { rows } = await pool.query<MockInterviewRunRow>(
    `SELECT
       id,
       goal_id,
       mode,
       status,
       target_role,
       focus_area,
       opening_prompt,
       latest_prompt,
       transcript_summary,
       evaluation,
       created_at::text,
       updated_at::text,
       completed_at::text
     FROM mock_interview_runs
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [runId, userId],
  );
  return rows[0] ?? null;
}

async function getRunTurns(runId: string): Promise<MockInterviewTurnRow[]> {
  const { rows } = await pool.query<MockInterviewTurnRow>(
    `SELECT id, turn_index, role, content, created_at::text
       FROM mock_interview_turns
      WHERE run_id = $1
      ORDER BY turn_index ASC, role ASC`,
    [runId],
  );
  return rows;
}

async function hydrateRun(runRow: MockInterviewRunRow): Promise<MockInterviewRun> {
  const turns = await getRunTurns(runRow.id);
  return {
    id: runRow.id,
    goalId: runRow.goal_id,
    mode: runRow.mode,
    status: runRow.status,
    targetRole: runRow.target_role,
    focusArea: runRow.focus_area,
    openingPrompt: runRow.opening_prompt,
    latestPrompt: runRow.latest_prompt,
    transcriptSummary: runRow.transcript_summary,
    turnCount: turns.filter((turn) => turn.role === 'candidate').length,
    createdAt: runRow.created_at,
    updatedAt: runRow.updated_at,
    completedAt: runRow.completed_at,
    turns: turns.map((turn) => ({
      id: turn.id,
      turnIndex: turn.turn_index,
      role: turn.role,
      content: turn.content,
      createdAt: turn.created_at,
    })),
    evaluation: safeEvaluation(runRow.evaluation),
  };
}

export async function startMockInterviewRun(
  userId: string,
  input: {
    goalId: string;
    mode: MockInterviewMode;
    targetRole?: string | null;
    focusArea?: string | null;
    promptContext?: string | null;
    quota?: {
      featureKey: string;
      remaining: number | null;
      limitValue: number | null;
    };
  },
): Promise<MockInterviewRun> {
  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(input.goalId),
    userId,
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const gapRecord = await getGoalGapReportRecord(userId, input.goalId).catch(() => null);
  const targetRole =
    trimToNull(input.targetRole) ??
    trimToNull(goal?.sprint?.targetRole) ??
    gapRecord?.targetRole ??
    null;
  const focusArea = trimToNull(input.focusArea) ?? null;
  const promptContext = trimToNull(input.promptContext) ?? null;
  const missingSignals = uniqueStrings([
    ...(gapRecord?.gapReport?.missingSkills.map((skill) => skill.name) ?? []),
    ...(gapRecord?.gapReport?.missingProof.map((item) => item.area) ?? []),
  ]).slice(0, 5);

  const openingPrompt = await generateOpeningPrompt({
    userId,
    goalId: input.goalId,
    mode: input.mode,
    goalTitle: trimToNull(goal?.structured?.title) ?? null,
    targetRole,
    focusArea,
    missingSignals,
  });

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mock_interview_runs
       (user_id, goal_id, mode, status, target_role, focus_area, prompt_context, opening_prompt, latest_prompt, quota_snapshot, created_at, updated_at)
     VALUES
       ($1, $2, $3, 'in_progress', $4, $5, $6, $7, $7, $8::jsonb, NOW(), NOW())
     RETURNING id`,
    [
      userId,
      input.goalId,
      input.mode,
      targetRole,
      focusArea,
      promptContext,
      openingPrompt,
      JSON.stringify(input.quota ?? {}),
    ],
  );

  const runId = rows[0].id;
  await pool.query(
    `INSERT INTO mock_interview_turns
       (run_id, turn_index, role, content, metadata)
     VALUES
       ($1, 0, 'interviewer', $2, $3::jsonb)`,
    [runId, openingPrompt, JSON.stringify({ opening: true })],
  );

  const runRow = await getRunRow(runId, userId);
  if (!runRow) {
    throw new Error('Failed to create mock interview run');
  }

  return hydrateRun(runRow);
}

export async function getMockInterviewRun(
  userId: string,
  runId: string,
): Promise<MockInterviewRun> {
  const runRow = await getRunRow(runId, userId);
  if (!runRow) {
    throw new Error('Mock interview run not found');
  }
  return hydrateRun(runRow);
}

export async function submitMockInterviewAnswer(
  userId: string,
  runId: string,
  answer: string,
): Promise<MockInterviewRun> {
  const runRow = await getRunRow(runId, userId);
  if (!runRow) {
    throw new Error('Mock interview run not found');
  }
  if (runRow.status !== 'in_progress') {
    throw new Error('This mock interview is already complete.');
  }

  const trimmedAnswer = answer.trim();
  if (trimmedAnswer.length < 20) {
    throw new Error('Write a bit more so the interviewer has something real to evaluate.');
  }

  const turns = await getRunTurns(runId);
  const nextTurnIndex =
    turns.filter((turn) => turn.role === 'candidate').length + 1;
  const transcriptBefore = transcriptToText(turns);

  await pool.query(
    `INSERT INTO mock_interview_turns
       (run_id, turn_index, role, content, metadata)
     VALUES
       ($1, $2, 'candidate', $3, $4::jsonb)`,
    [runId, nextTurnIndex, trimmedAnswer, JSON.stringify({ chars: trimmedAnswer.length })],
  );

  const followUpPrompt = await generateFollowUpPrompt({
    userId,
    goalId: runRow.goal_id,
    mode: runRow.mode,
    targetRole: runRow.target_role,
    focusArea: runRow.focus_area,
    transcript: `${transcriptBefore}\nCandidate: ${trimmedAnswer}`,
  });

  await pool.query(
    `INSERT INTO mock_interview_turns
       (run_id, turn_index, role, content, metadata)
     VALUES
       ($1, $2, 'interviewer', $3, $4::jsonb)`,
    [runId, nextTurnIndex, followUpPrompt, JSON.stringify({ followUp: true })],
  );

  await pool.query(
    `UPDATE mock_interview_runs
        SET latest_prompt = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [runId, followUpPrompt],
  );

  return getMockInterviewRun(userId, runId);
}

export async function evaluateMockInterviewRun(
  userId: string,
  runId: string,
): Promise<MockInterviewRun> {
  const runRow = await getRunRow(runId, userId);
  if (!runRow) {
    throw new Error('Mock interview run not found');
  }

  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(runRow.goal_id),
    userId,
  });

  const gapRecord = await getGoalGapReportRecord(userId, runRow.goal_id).catch(() => null);
  const turns = await getRunTurns(runId);
  const candidateAnswers = turns
    .filter((turn) => turn.role === 'candidate')
    .map((turn) => turn.content);

  if (candidateAnswers.length === 0) {
    throw new Error('Answer at least one interview question before scoring the run.');
  }

  const transcript = transcriptToText(turns);
  const missingSignals = uniqueStrings([
    ...(gapRecord?.gapReport?.missingSkills.map((skill) => skill.name) ?? []),
    ...(gapRecord?.gapReport?.missingProof.map((item) => item.area) ?? []),
  ]).slice(0, 5);

  const evaluation = await evaluateTranscript({
    userId,
    goalId: runRow.goal_id,
    mode: runRow.mode,
    targetRole: runRow.target_role,
    focusArea: runRow.focus_area,
    transcript,
    candidateAnswers,
    missingSignals,
  });

  const transcriptSummary = uniqueStrings([
    trimToNull(evaluation.summary),
    trimToNull(goal?.structured?.title) ? `Goal: ${trimToNull(goal?.structured?.title)}` : null,
  ]).join(' ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE mock_interview_runs
          SET status = 'completed',
              overall_score = $2,
              evaluation = $3::jsonb,
              transcript_summary = $4,
              updated_at = NOW(),
              completed_at = NOW()
        WHERE id = $1`,
      [runId, evaluation.overallScore, JSON.stringify(evaluation), transcriptSummary],
    );

    await client.query(`DELETE FROM mock_interview_scores WHERE run_id = $1`, [runId]);
    for (const dimension of evaluation.rubricScores) {
      await client.query(
        `INSERT INTO mock_interview_scores
           (run_id, dimension, score, feedback)
         VALUES
           ($1, $2, $3, $4)`,
        [runId, dimension.dimension, dimension.score, dimension.feedback],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getMockInterviewRun(userId, runId);
}

export async function getMockInterviewHistory(
  userId: string,
  goalId?: string,
): Promise<MockInterviewHistoryItem[]> {
  const params: string[] = [userId];
  let goalClause = '';
  if (goalId) {
    params.push(goalId);
    goalClause = `AND goal_id = $2`;
  }

  const { rows } = await pool.query<{
    id: string;
    goal_id: string;
    mode: MockInterviewMode;
    status: 'in_progress' | 'completed' | 'abandoned';
    target_role: string | null;
    focus_area: string | null;
    overall_score: number | null;
    transcript_summary: string | null;
    created_at: string;
    completed_at: string | null;
  }>(
    `SELECT
       id,
       goal_id,
       mode,
       status,
       target_role,
       focus_area,
       overall_score,
       transcript_summary,
       created_at::text,
       completed_at::text
     FROM mock_interview_runs
     WHERE user_id = $1
       ${goalClause}
     ORDER BY created_at DESC
     LIMIT 12`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    goalId: row.goal_id,
    mode: row.mode,
    status: row.status,
    targetRole: row.target_role,
    focusArea: row.focus_area,
    overallScore: row.overall_score,
    transcriptSummary: row.transcript_summary,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}
