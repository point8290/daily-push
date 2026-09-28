import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';

/**
 * Gap progress: the hub that ties study, proof, mock interviews and readiness
 * together.
 *
 * A gap moves open → closing → closed → proven:
 *   open     no concept for it is done yet
 *   closing  some of its concepts are done
 *   closed   every concept for it is done
 *   proven   closed, and there is proof (graded work 4+/5 or a mock 4+/5)
 *
 * Gaps added by a mock interview have no concepts; they close through
 * practice: a later mock of 4+/5 in that area proves them.
 *
 * Everything here is computed from stored facts. No AI calls.
 */

export type GapStatus = 'open' | 'closing' | 'closed' | 'proven';

export interface MockSignal {
  runId: string;
  mode: string;
  score: number;
  at: string;
}

export interface GapProgress {
  gapId: string;
  skillArea: string;
  skillCategory: string | null;
  priority: number;
  currentLevel: string | null;
  requiredLevel: string | null;
  identifiedBy: string | null;
  status: GapStatus;
  conceptsDone: number;
  conceptsTotal: number;
  proofCount: number;
  needsPractice: boolean;
  lastMock: MockSignal | null;
  topicTitles: string[];
}

export interface GapEvent {
  skillArea: string;
  fromStatus: string | null;
  toStatus: string;
  source: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface GoalGapProgress {
  goalId: string;
  gaps: GapProgress[];
  /** 0–100: how much of the plan's gaps are closed and proven, weighted by priority. */
  readinessPct: number;
  counts: Record<GapStatus, number>;
  recentEvents: GapEvent[];
}

export interface GapChange {
  skillArea: string;
  from: GapStatus;
  to: GapStatus;
}

const STATUS_VALUE: Record<GapStatus, number> = {
  open: 0,
  closing: 0.2,
  closed: 0.85,
  proven: 1,
};

function normalizeArea(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\badvanced\s+(?=advanced\b)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asStatus(value: unknown): GapStatus {
  return value === 'closing' || value === 'closed' || value === 'proven' ? value : 'open';
}

function gapPriority(gap: any, fallback: number): number {
  const raw = Number(gap?.structured?.priority);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Which learning topics close which gap. */
function topicsForGap(gap: any, topics: any[]): any[] {
  const gapId = String(gap?._id ?? '');
  const area = normalizeArea(gap?.structured?.skillArea);
  return topics.filter((topic) => {
    if (topic?.skillGapId && String(topic.skillGapId) === gapId) return true;
    if (topic?.skillGapId) return false;
    const topicArea = normalizeArea(topic?.structured?.skillGapArea);
    return Boolean(area) && Boolean(topicArea) && (topicArea === area || topicArea.includes(area) || area.includes(topicArea));
  });
}

async function loadGoal(userId: string, goalId: string): Promise<any | null> {
  if (!ObjectId.isValid(goalId)) return null;
  return getDb().collection('goals').findOne({ _id: new ObjectId(goalId), userId });
}

async function loadTopicStats(userId: string, goalId: string): Promise<{
  concepts: Map<string, { done: number; total: number }>;
  proof: Map<string, number>;
}> {
  const [conceptRows, proofRows] = await Promise.all([
    pool.query<{ learning_topic_id: string; done: string; total: string }>(
      `SELECT learning_topic_id,
              COUNT(*) FILTER (WHERE status IN ('done', 'review_due'))::text AS done,
              COUNT(*)::text AS total
         FROM concept_nodes
        WHERE user_id = $1 AND goal_id = $2
        GROUP BY learning_topic_id`,
      [userId, goalId],
    ),
    pool.query<{ learning_topic_id: string; proof: string }>(
      `SELECT cn.learning_topic_id, COUNT(*)::text AS proof
         FROM session_artifacts sa
         JOIN concept_nodes cn ON cn.id = sa.node_id
        WHERE sa.user_id = $1
          AND cn.goal_id = $2
          AND sa.status = 'evaluated'
          AND sa.score >= 4
        GROUP BY cn.learning_topic_id`,
      [userId, goalId],
    ),
  ]);
  return {
    concepts: new Map(
      conceptRows.rows.map((row) => [
        row.learning_topic_id,
        { done: Number(row.done), total: Number(row.total) },
      ]),
    ),
    proof: new Map(proofRows.rows.map((row) => [row.learning_topic_id, Number(row.proof)])),
  };
}

function computeGap(
  gap: any,
  index: number,
  topics: any[],
  stats: Awaited<ReturnType<typeof loadTopicStats>>,
): GapProgress {
  const linked = topicsForGap(gap, topics);
  let done = 0;
  let total = 0;
  let proof = 0;
  for (const topic of linked) {
    const id = String(topic?._id ?? '');
    const concept = stats.concepts.get(id);
    done += concept?.done ?? 0;
    total += concept?.total ?? 0;
    proof += stats.proof.get(id) ?? 0;
  }

  const signals: MockSignal[] = Array.isArray(gap?.structured?.mockSignals)
    ? gap.structured.mockSignals
    : [];
  const lastMock = signals.length > 0 ? signals[signals.length - 1] : null;
  if (lastMock && lastMock.score >= 4) proof += 1;

  let status: GapStatus;
  if (total === 0) {
    // Practice-only gap (added by a mock interview).
    status = lastMock && lastMock.score >= 4 ? 'proven' : lastMock ? 'closing' : 'open';
  } else if (done === 0) {
    status = 'open';
  } else if (done < total) {
    status = 'closing';
  } else {
    status = proof > 0 ? 'proven' : 'closed';
  }

  return {
    gapId: String(gap?._id ?? index),
    skillArea: String(gap?.structured?.skillArea ?? 'Skill'),
    skillCategory: gap?.structured?.skillCategory ?? null,
    priority: gapPriority(gap, index + 1),
    currentLevel: gap?.structured?.currentLevel ?? null,
    requiredLevel: gap?.structured?.requiredLevel ?? null,
    identifiedBy: gap?.structured?.identifiedBy ?? null,
    status,
    conceptsDone: done,
    conceptsTotal: total,
    proofCount: proof,
    needsPractice: Boolean(gap?.structured?.needsPractice) && !(lastMock && lastMock.score >= 4),
    lastMock,
    topicTitles: linked.map((topic) => String(topic?.structured?.title ?? '')).filter(Boolean),
  };
}

function readinessFrom(gaps: GapProgress[]): number {
  if (gaps.length === 0) return 0;
  let weighted = 0;
  let weights = 0;
  for (const gap of gaps) {
    const weight = Math.max(1, 6 - gap.priority);
    let value = STATUS_VALUE[gap.status];
    if (gap.status === 'closing' && gap.conceptsTotal > 0) {
      value = 0.2 + 0.5 * (gap.conceptsDone / gap.conceptsTotal);
    }
    weighted += weight * value;
    weights += weight;
  }
  return Math.round((100 * weighted) / weights);
}

async function recentEvents(userId: string, goalId: string): Promise<GapEvent[]> {
  const { rows } = await pool.query<{
    skill_area: string;
    from_status: string | null;
    to_status: string;
    source: string;
    detail: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT skill_area, from_status, to_status, source, detail, created_at
       FROM gap_events
      WHERE user_id = $1 AND goal_id = $2
      ORDER BY created_at DESC
      LIMIT 12`,
    [userId, goalId],
  );
  return rows.map((row) => ({
    skillArea: row.skill_area,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    source: row.source,
    detail: row.detail ?? {},
    createdAt: row.created_at.toISOString(),
  }));
}

async function recordEvent(
  userId: string,
  goalId: string,
  gap: { gapId: string; skillArea: string },
  fromStatus: string | null,
  toStatus: string,
  source: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO gap_events (user_id, goal_id, gap_id, skill_area, from_status, to_status, source, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [userId, goalId, gap.gapId.slice(0, 24), gap.skillArea.slice(0, 255), fromStatus, toStatus, source, JSON.stringify(detail)],
  );
}

/** Read-only view for pages. */
export async function getGoalGapProgress(userId: string, goalId: string): Promise<GoalGapProgress | null> {
  const goal = await loadGoal(userId, goalId);
  if (!goal) return null;
  const gaps: any[] = Array.isArray(goal.skillGaps) ? goal.skillGaps : [];
  const topics: any[] = Array.isArray(goal.learningTopics) ? goal.learningTopics : [];
  const stats = await loadTopicStats(userId, goalId);
  const progress = gaps
    .map((gap, index) => computeGap(gap, index, topics, stats))
    .sort((a, b) => a.priority - b.priority);
  const counts: Record<GapStatus, number> = { open: 0, closing: 0, closed: 0, proven: 0 };
  for (const gap of progress) counts[gap.status] += 1;
  return {
    goalId,
    gaps: progress,
    readinessPct: readinessFrom(progress),
    counts,
    recentEvents: await recentEvents(userId, goalId),
  };
}

/**
 * Recompute gap and topic state after something happened (a session, graded
 * work, a mock, a plan change) and store it on the goal. Returns what changed
 * so the UI can say "Closed gap: Query tuning".
 */
export async function syncGoalGaps(
  userId: string,
  goalId: string,
  source: string,
  detail: Record<string, unknown> = {},
): Promise<{ changes: GapChange[]; progress: GoalGapProgress | null }> {
  const goal = await loadGoal(userId, goalId);
  if (!goal) return { changes: [], progress: null };
  const gaps: any[] = Array.isArray(goal.skillGaps) ? goal.skillGaps : [];
  const topics: any[] = Array.isArray(goal.learningTopics) ? goal.learningTopics : [];
  const stats = await loadTopicStats(userId, goalId);

  const changes: GapChange[] = [];
  const now = new Date();
  const nextGaps = [];
  for (let index = 0; index < gaps.length; index += 1) {
    const gap = gaps[index];
    const computed = computeGap(gap, index, topics, stats);
    const previous = asStatus(gap?.structured?.status);
    if (previous !== computed.status) {
      changes.push({ skillArea: computed.skillArea, from: previous, to: computed.status });
      await recordEvent(userId, goalId, computed, previous, computed.status, source, detail);
    }
    nextGaps.push({
      ...gap,
      structured: {
        ...(gap?.structured ?? {}),
        status: computed.status,
        progress: {
          conceptsDone: computed.conceptsDone,
          conceptsTotal: computed.conceptsTotal,
          proofCount: computed.proofCount,
          updatedAt: now,
        },
      },
    });
  }

  const nextTopics = topics.map((topic) => {
    const concept = stats.concepts.get(String(topic?._id ?? ''));
    const allDone = Boolean(concept && concept.total > 0 && concept.done >= concept.total);
    const wasDone = topic?.structured?.status === 'done';
    if (allDone === wasDone) return topic;
    return {
      ...topic,
      completedAt: allDone ? now : null,
      structured: { ...(topic?.structured ?? {}), status: allDone ? 'done' : 'pending' },
    };
  });

  await getDb().collection('goals').updateOne(
    { _id: goal._id, userId },
    { $set: { skillGaps: nextGaps, learningTopics: nextTopics, updatedAt: now } },
  );

  return { changes, progress: await getGoalGapProgress(userId, goalId) };
}

const MODE_PATTERNS: Record<string, RegExp> = {
  system_design: /system|design|architect|distributed|scal|infra|cloud|performance/,
  behavioral: /behavio|leader|communicat|stakeholder|star|mentor|soft|collaborat|product/,
};

const MODE_GAP_NAMES: Record<string, string> = {
  system_design: 'System design interviews',
  behavioral: 'Behavioral interviews',
  project_deep_dive: 'Explaining your own projects',
};

/**
 * A scored mock interview feeds the plan.
 * Weak (overall ≤ 2, or any dimension ≤ 2): the matching gap moves to the top,
 * is marked "needs practice", and up to 3 of its finished concepts come back
 * for review today. If no gap matches, a practice gap is added.
 * Strong (overall ≥ 4): recorded on the gap as proof.
 */
export async function applyMockInterviewToGaps(
  userId: string,
  goalId: string,
  run: { runId: string; mode: string; overallScore: number; dimensionScores: number[] },
): Promise<{ gapSkillArea: string | null; weak: boolean; strong: boolean; changes: GapChange[] }> {
  const goal = await loadGoal(userId, goalId);
  if (!goal) return { gapSkillArea: null, weak: false, strong: false, changes: [] };

  const weak = run.overallScore <= 2 || run.dimensionScores.some((score) => score <= 2);
  const strong = run.overallScore >= 4;
  const gaps: any[] = Array.isArray(goal.skillGaps) ? [...goal.skillGaps] : [];
  const pattern = MODE_PATTERNS[run.mode];

  const ordered = gaps
    .map((gap, index) => ({ gap, index, priority: gapPriority(gap, index + 1) }))
    .sort((a, b) => a.priority - b.priority);
  let match = pattern
    ? ordered.find(({ gap }) =>
        pattern.test(`${gap?.structured?.skillArea ?? ''} ${gap?.structured?.skillCategory ?? ''}`.toLowerCase()),
      )
    : ordered.find(({ gap }) => asStatus(gap?.structured?.status) !== 'proven') ?? ordered[0];

  const signal: MockSignal = {
    runId: run.runId,
    mode: run.mode,
    score: run.overallScore,
    at: new Date().toISOString(),
  };

  if (!match) {
    if (!weak) return { gapSkillArea: null, weak, strong, changes: [] };
    const newGap = {
      _id: new ObjectId(),
      raw: null,
      userConfirmed: false,
      structured: {
        skillArea: MODE_GAP_NAMES[run.mode] ?? 'Interview practice',
        skillCategory: 'interviewing',
        currentLevel: 'aware',
        requiredLevel: 'proficient',
        priority: 1,
        priorityReason: `Your last ${MODE_GAP_NAMES[run.mode]?.toLowerCase() ?? 'mock'} scored ${run.overallScore}/5.`,
        identifiedBy: 'mock_interview',
        status: 'open',
        needsPractice: true,
        mockSignals: [signal],
      },
    };
    for (const entry of gaps) {
      if (entry?.structured) entry.structured.priority = gapPriority(entry, 1) + 1;
    }
    gaps.push(newGap);
    await getDb().collection('goals').updateOne(
      { _id: goal._id, userId },
      { $set: { skillGaps: gaps, updatedAt: new Date() } },
    );
    await recordEvent(userId, goalId, { gapId: String(newGap._id), skillArea: newGap.structured.skillArea }, null, 'open', 'mock_interview', {
      runId: run.runId,
      score: run.overallScore,
    });
    const synced = await syncGoalGaps(userId, goalId, 'mock_interview', { runId: run.runId });
    return { gapSkillArea: newGap.structured.skillArea, weak, strong, changes: synced.changes };
  }

  const target = gaps[match.index];
  const previousPriority = match.priority;
  const structured = { ...(target.structured ?? {}) };
  structured.mockSignals = [...(Array.isArray(structured.mockSignals) ? structured.mockSignals : []), signal].slice(-6);
  if (weak) {
    structured.needsPractice = true;
    if (previousPriority !== 1) {
      for (const entry of gaps) {
        const p = gapPriority(entry, 1);
        if (entry !== target && p < previousPriority && entry?.structured) entry.structured.priority = p + 1;
      }
      structured.priority = 1;
      structured.priorityReason = `Moved to the top after a ${run.overallScore}/5 mock interview.`;
    }
  } else if (strong) {
    structured.needsPractice = false;
  }
  gaps[match.index] = { ...target, structured };

  await getDb().collection('goals').updateOne(
    { _id: goal._id, userId },
    { $set: { skillGaps: gaps, updatedAt: new Date() } },
  );

  if (weak) {
    // Bring back up to 3 finished concepts from this gap for review today.
    const topicIds = topicsForGap(target, Array.isArray(goal.learningTopics) ? goal.learningTopics : [])
      .map((topic) => String(topic._id));
    if (topicIds.length > 0) {
      const { rows } = await pool.query<{ id: string }>(
        `UPDATE concept_nodes
            SET status = 'review_due', next_review_at = NOW()
          WHERE id IN (
            SELECT id FROM concept_nodes
             WHERE user_id = $1 AND goal_id = $2
               AND learning_topic_id = ANY($3::varchar[])
               AND status = 'done'
             ORDER BY last_studied_at DESC NULLS LAST
             LIMIT 3)
          RETURNING id`,
        [userId, goalId, topicIds],
      );
      if (rows.length > 0) {
        await pool.query(
          `UPDATE spaced_repetition_queue SET due_at = NOW()
            WHERE user_id = $1 AND node_id = ANY($2::uuid[])`,
          [userId, rows.map((row) => row.id)],
        );
      }
    }
    if (previousPriority !== 1) {
      await recordEvent(userId, goalId, { gapId: String(target._id), skillArea: String(structured.skillArea) }, asStatus(structured.status), asStatus(structured.status), 'mock_interview', {
        runId: run.runId,
        score: run.overallScore,
        priorityFrom: previousPriority,
        priorityTo: 1,
      });
    }
  }

  const synced = await syncGoalGaps(userId, goalId, 'mock_interview', { runId: run.runId, score: run.overallScore });
  return { gapSkillArea: String(structured.skillArea ?? ''), weak, strong, changes: synced.changes };
}
