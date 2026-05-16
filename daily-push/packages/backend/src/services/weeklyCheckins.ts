import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import { getGoalGapReportRecord } from './jobGapAnalysis';
import {
  getGoalPlanHealth,
  type GoalPlanHealthSummary,
} from './sprintPlanner';
import { getStreak } from './sessions';

export interface WeeklyRecoveryPlan {
  status: 'steady' | 'catch_up' | 'reduce_scope' | 'critical';
  headline: string;
  catchUpMinutes: number | null;
  focusAreas: string[];
  actions: string[];
  riskSummary: string;
  shouldReduceScope: boolean;
  nextReviewDate: string | null;
}

export interface WeeklyCheckinRecord {
  weekStart: string;
  confidence: number;
  momentum: number;
  blockers: string[];
  wins: string[];
  notes: string | null;
  recoveryPlan: WeeklyRecoveryPlan | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReport {
  goalId: string;
  goalTitle: string;
  targetRole: string | null;
  weekStart: string;
  weekEnd: string;
  checkinDue: boolean;
  latestCheckin: WeeklyCheckinRecord | null;
  recoveryPlan: WeeklyRecoveryPlan;
  planHealth: GoalPlanHealthSummary;
  stats: {
    sessionsThisWeek: number;
    reviewSessionsThisWeek: number;
    studyMinutesThisWeek: number;
    averageConfidence: number | null;
    currentStreak: number;
    totalSessions: number;
    weeklyTargetMinutes: number | null;
    weeklyTargetProgressPct: number | null;
  };
  highlights: string[];
  weakAreas: string[];
}

interface WeeklyCheckinRow {
  week_start: string;
  confidence: number;
  momentum: number;
  blockers: string[] | unknown;
  wins: string[] | unknown;
  notes: string | null;
  recovery_plan: WeeklyRecoveryPlan | Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface GoalSessionWeeklyStats {
  sessionsThisWeek: number;
  reviewSessionsThisWeek: number;
  studyMinutesThisWeek: number;
  averageConfidence: number | null;
}

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

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((entry) => trimToNull(entry))).slice(0, 8);
  }

  if (typeof value === 'string') {
    return uniqueStrings(
      value
        .split(/\r?\n|,/)
        .map((entry) => trimToNull(entry))
        .filter((entry): entry is string => !!entry),
    ).slice(0, 8);
  }

  return [];
}

function safeRecoveryPlan(value: unknown): WeeklyRecoveryPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const plan = value as Partial<WeeklyRecoveryPlan>;
  const status =
    plan.status === 'steady' ||
    plan.status === 'catch_up' ||
    plan.status === 'reduce_scope' ||
    plan.status === 'critical'
      ? plan.status
      : 'steady';

  return {
    status,
    headline: trimToNull(plan.headline) ?? 'Keep moving forward with one concrete session at a time.',
    catchUpMinutes:
      typeof plan.catchUpMinutes === 'number' && Number.isFinite(plan.catchUpMinutes)
        ? plan.catchUpMinutes
        : null,
    focusAreas: parseStringList(plan.focusAreas),
    actions: parseStringList(plan.actions),
    riskSummary: trimToNull(plan.riskSummary) ?? 'Your weekly plan is ready for another checkpoint.',
    shouldReduceScope: Boolean(plan.shouldReduceScope),
    nextReviewDate: trimToNull(plan.nextReviewDate),
  };
}

function startOfIsoWeek(date = new Date()): Date {
  const utc = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}

function endOfIsoWeek(start: Date): Date {
  const result = new Date(start);
  result.setUTCDate(result.getUTCDate() + 6);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextReviewDateString(): string {
  const next = startOfIsoWeek(new Date());
  next.setUTCDate(next.getUTCDate() + 7);
  return formatIsoDate(next);
}

function mapCheckinRow(row: WeeklyCheckinRow | null): WeeklyCheckinRecord | null {
  if (!row) return null;
  return {
    weekStart: row.week_start,
    confidence: row.confidence,
    momentum: row.momentum,
    blockers: parseStringList(row.blockers),
    wins: parseStringList(row.wins),
    notes: trimToNull(row.notes),
    recoveryPlan: safeRecoveryPlan(row.recovery_plan),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getGoalById(userId: string, goalId: string): Promise<any | null> {
  const db = getDb();
  return db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId,
  });
}

async function getPrimaryActiveGoal(userId: string): Promise<any | null> {
  const db = getDb();
  return db.collection('goals').findOne({
    userId,
    isPrimary: true,
    status: { $in: ['active', 'drafting', 'planning', 'paused'] },
  });
}

async function getLatestGoalCheckinRow(
  userId: string,
  goalId: string,
): Promise<WeeklyCheckinRow | null> {
  const { rows } = await pool.query<WeeklyCheckinRow>(
    `SELECT
       week_start::text,
       confidence,
       momentum,
       blockers,
       wins,
       notes,
       recovery_plan,
       created_at::text,
       updated_at::text
     FROM weekly_checkins
     WHERE user_id = $1
       AND goal_id = $2
     ORDER BY week_start DESC
     LIMIT 1`,
    [userId, goalId],
  );
  return rows[0] ?? null;
}

async function getWeeklySessionStats(
  userId: string,
  goalId: string,
  weekStart: Date,
): Promise<GoalSessionWeeklyStats> {
  const { rows } = await pool.query<{
    sessions_this_week: number;
    review_sessions_this_week: number;
    study_minutes_this_week: number;
    average_confidence: string | null;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE ss.completed_at IS NOT NULL)::int AS sessions_this_week,
       COUNT(*) FILTER (WHERE ss.completed_at IS NOT NULL AND ss.session_type = 'review')::int AS review_sessions_this_week,
       COALESCE(SUM(ss.duration_mins) FILTER (WHERE ss.completed_at IS NOT NULL), 0)::int AS study_minutes_this_week,
       ROUND(AVG(ss.confidence_after) FILTER (WHERE ss.completed_at IS NOT NULL)::numeric, 1)::text AS average_confidence
     FROM study_sessions ss
     JOIN concept_nodes cn ON cn.id = ss.node_id
     WHERE ss.user_id = $1
       AND cn.goal_id = $2
       AND ss.completed_at >= $3`,
    [userId, goalId, weekStart.toISOString()],
  );

  const row = rows[0];
  return {
    sessionsThisWeek: row?.sessions_this_week ?? 0,
    reviewSessionsThisWeek: row?.review_sessions_this_week ?? 0,
    studyMinutesThisWeek: row?.study_minutes_this_week ?? 0,
    averageConfidence:
      row?.average_confidence === null ? null : Number(row.average_confidence),
  };
}

async function getWeakTopicTitles(
  goal: any,
  userId: string,
  goalId: string,
  weekStart: Date,
): Promise<string[]> {
  const { rows } = await pool.query<{
    learning_topic_id: string;
    average_confidence: string | null;
    session_count: number;
  }>(
    `SELECT
       cn.learning_topic_id,
       ROUND(AVG(ss.confidence_after) FILTER (WHERE ss.completed_at IS NOT NULL)::numeric, 1)::text AS average_confidence,
       COUNT(*) FILTER (WHERE ss.completed_at IS NOT NULL)::int AS session_count
     FROM study_sessions ss
     JOIN concept_nodes cn ON cn.id = ss.node_id
     WHERE ss.user_id = $1
       AND cn.goal_id = $2
       AND ss.completed_at >= $3
     GROUP BY cn.learning_topic_id
     ORDER BY AVG(COALESCE(ss.confidence_after, 0)) ASC, COUNT(*) DESC
     LIMIT 3`,
    [userId, goalId, weekStart.toISOString()],
  );

  const titleByTopicId = new Map<string, string>();
  for (const topic of goal.learningTopics ?? []) {
    titleByTopicId.set(String(topic?._id), topic?.structured?.title ?? 'Unnamed topic');
  }

  return rows
    .filter((row) => row.session_count > 0)
    .map((row) => titleByTopicId.get(row.learning_topic_id) ?? 'Unnamed topic');
}

async function getNextAvailableNodeTitle(
  userId: string,
  goalId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ title: string }>(
    `SELECT title
       FROM concept_nodes
      WHERE user_id = $1
        AND goal_id = $2
        AND status = 'available'
      ORDER BY position
      LIMIT 1`,
    [userId, goalId],
  );
  return trimToNull(rows[0]?.title) ?? null;
}

function buildRecoveryPlan(params: {
  planHealth: GoalPlanHealthSummary;
  stats: GoalSessionWeeklyStats;
  latestCheckin: WeeklyCheckinRecord | null;
  weakAreas: string[];
  nextAvailableNodeTitle: string | null;
}): WeeklyRecoveryPlan {
  const { planHealth, stats, latestCheckin, weakAreas, nextAvailableNodeTitle } = params;
  const catchUpMinutes =
    planHealth.weeklyTargetMinutes === null
      ? null
      : Math.max(planHealth.weeklyTargetMinutes - stats.studyMinutesThisWeek, 0);
  const blocker = latestCheckin?.blockers[0] ?? null;

  let status: WeeklyRecoveryPlan['status'] = 'steady';
  if (planHealth.riskScore >= 70 || stats.sessionsThisWeek === 0) {
    status = 'critical';
  } else if (planHealth.riskScore >= 50 || (catchUpMinutes ?? 0) >= 120) {
    status = 'reduce_scope';
  } else if ((catchUpMinutes ?? 0) > 0 || planHealth.status === 'at_risk') {
    status = 'catch_up';
  }

  const shouldReduceScope =
    status === 'reduce_scope' ||
    status === 'critical' ||
    (catchUpMinutes !== null &&
      planHealth.weeklyTargetMinutes !== null &&
      catchUpMinutes > planHealth.weeklyTargetMinutes * 0.75);

  const actions = uniqueStrings([
    blocker ? `Resolve the blocker: ${blocker}.` : null,
    stats.sessionsThisWeek === 0
      ? 'Book one short restart session in the next 24 hours to rebuild momentum.'
      : null,
    catchUpMinutes && catchUpMinutes > 0
      ? `Recover ${catchUpMinutes} minute${catchUpMinutes === 1 ? '' : 's'} by splitting the remaining work into ${Math.max(1, Math.ceil(catchUpMinutes / 30))} focused session${Math.ceil(catchUpMinutes / 30) === 1 ? '' : 's'}.`
      : null,
    planHealth.failedTopics > 0
      ? 'Unblock failed topic decomposition before pushing deeper into the graph.'
      : null,
    nextAvailableNodeTitle
      ? `Start with the next available node: ${nextAvailableNodeTitle}.`
      : null,
    shouldReduceScope
      ? 'Rebaseline the sprint or narrow scope to one must-win outcome for the next seven days.'
      : null,
  ]).slice(0, 5);

  const focusAreas = uniqueStrings([
    ...weakAreas,
    ...(latestCheckin?.blockers ?? []),
  ]).slice(0, 4);

  const headline =
    status === 'steady'
      ? 'You are broadly on track. Protect the rhythm and keep shipping visible proof.'
      : status === 'catch_up'
        ? 'You are still in the game, but this week needs a tighter recovery rhythm.'
        : status === 'reduce_scope'
          ? 'The plan is still recoverable, but you should reduce scope before the schedule drift gets expensive.'
          : 'Momentum has slipped enough that the safest move is to simplify, restart, and rebuild consistency.';

  return {
    status,
    headline,
    catchUpMinutes,
    focusAreas,
    actions,
    riskSummary: planHealth.summary,
    shouldReduceScope,
    nextReviewDate: nextReviewDateString(),
  };
}

function buildHighlights(params: {
  stats: GoalSessionWeeklyStats;
  streak: { currentStreak: number; totalSessions: number };
  planHealth: GoalPlanHealthSummary;
  latestCheckin: WeeklyCheckinRecord | null;
}): string[] {
  const { stats, streak, planHealth, latestCheckin } = params;
  const progressPct =
    planHealth.weeklyTargetMinutes && planHealth.weeklyTargetMinutes > 0
      ? Math.round((stats.studyMinutesThisWeek / planHealth.weeklyTargetMinutes) * 100)
      : null;

  return uniqueStrings([
    stats.sessionsThisWeek > 0
      ? `You completed ${stats.sessionsThisWeek} session${stats.sessionsThisWeek === 1 ? '' : 's'} this week.`
      : 'No sessions completed yet this week.',
    stats.studyMinutesThisWeek > 0
      ? `You logged ${stats.studyMinutesThisWeek} focused study minute${stats.studyMinutesThisWeek === 1 ? '' : 's'}.`
      : null,
    progressPct !== null
      ? `You reached ${progressPct}% of your weekly time target.`
      : null,
    streak.currentStreak > 0
      ? `Your current streak is ${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}.`
      : null,
    ...(latestCheckin?.wins ?? []),
  ]).slice(0, 6);
}

function buildWeakAreas(params: {
  weakTopicTitles: string[];
  latestCheckin: WeeklyCheckinRecord | null;
  gapMissingSkills: string[];
  planHealth: GoalPlanHealthSummary;
}): string[] {
  const { weakTopicTitles, latestCheckin, gapMissingSkills, planHealth } = params;
  return uniqueStrings([
    ...weakTopicTitles.map((title) => `Recent sessions suggest ${title} still feels shaky.`),
    ...(latestCheckin?.blockers ?? []),
    ...gapMissingSkills.map((skill) => `Your target-role evidence is still thin around ${skill}.`),
    planHealth.failedTopics > 0
      ? `${planHealth.failedTopics} topic${planHealth.failedTopics === 1 ? '' : 's'} still need decomposition cleanup.`
      : null,
  ]).slice(0, 6);
}

export async function getGoalWeeklyCheckinState(
  userId: string,
  goalId: string,
): Promise<{
  due: boolean;
  weekStart: string;
  latestCheckin: WeeklyCheckinRecord | null;
}> {
  const latest = mapCheckinRow(await getLatestGoalCheckinRow(userId, goalId));
  const weekStart = formatIsoDate(startOfIsoWeek());
  return {
    due: latest?.weekStart !== weekStart,
    weekStart,
    latestCheckin: latest,
  };
}

export async function buildGoalRecoveryPlan(
  userId: string,
  goalId: string,
  overrides?: {
    blockers?: string[] | string | null;
    wins?: string[] | string | null;
    confidence?: number | null;
    momentum?: number | null;
    notes?: string | null;
  },
): Promise<WeeklyRecoveryPlan> {
  const goal = await getGoalById(userId, goalId);
  if (!goal) {
    throw new Error('Goal not found');
  }

  const weekStart = startOfIsoWeek();
  const latestCheckinFromDb = mapCheckinRow(await getLatestGoalCheckinRow(userId, goalId));
  const latestCheckin =
    overrides &&
    (overrides.blockers !== undefined ||
      overrides.wins !== undefined ||
      overrides.confidence !== undefined ||
      overrides.momentum !== undefined ||
      overrides.notes !== undefined)
      ? {
          weekStart: formatIsoDate(weekStart),
          confidence: clamp(Math.round(Number(overrides.confidence ?? latestCheckinFromDb?.confidence ?? 3)), 1, 5),
          momentum: clamp(Math.round(Number(overrides.momentum ?? latestCheckinFromDb?.momentum ?? 3)), 1, 5),
          blockers: overrides.blockers !== undefined ? parseStringList(overrides.blockers) : (latestCheckinFromDb?.blockers ?? []),
          wins: overrides.wins !== undefined ? parseStringList(overrides.wins) : (latestCheckinFromDb?.wins ?? []),
          notes: overrides.notes !== undefined ? trimToNull(overrides.notes) : (latestCheckinFromDb?.notes ?? null),
          recoveryPlan: latestCheckinFromDb?.recoveryPlan ?? null,
          createdAt: latestCheckinFromDb?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : latestCheckinFromDb;

  const [planHealth, stats, streak, weakTopicTitles, gapRecord, nextAvailableNodeTitle] =
    await Promise.all([
      getGoalPlanHealth(userId, goalId),
      getWeeklySessionStats(userId, goalId, weekStart),
      getStreak(userId),
      getWeakTopicTitles(goal, userId, goalId, weekStart),
      getGoalGapReportRecord(userId, goalId).catch(() => null),
      getNextAvailableNodeTitle(userId, goalId),
    ]);

  const weakAreas = buildWeakAreas({
    weakTopicTitles,
    latestCheckin,
    gapMissingSkills: gapRecord?.gapReport?.missingSkills.map((item) => item.name) ?? [],
    planHealth,
  });

  return buildRecoveryPlan({
    planHealth,
    stats,
    latestCheckin,
    weakAreas,
    nextAvailableNodeTitle,
  });
}

export async function saveGoalWeeklyCheckin(
  userId: string,
  goalId: string,
  input: {
    confidence: number;
    momentum: number;
    blockers?: string[] | string | null;
    wins?: string[] | string | null;
    notes?: string | null;
  },
): Promise<WeeklyCheckinRecord> {
  const goal = await getGoalById(userId, goalId);
  if (!goal) {
    throw new Error('Goal not found');
  }

  const weekStartDate = startOfIsoWeek();
  const weekStart = formatIsoDate(weekStartDate);
  const blockers = parseStringList(input.blockers);
  const wins = parseStringList(input.wins);
  const notes = trimToNull(input.notes);
  const recoveryPlan = await buildGoalRecoveryPlan(userId, goalId, {
    blockers,
    wins,
    confidence: input.confidence,
    momentum: input.momentum,
    notes,
  });

  const { rows } = await pool.query<WeeklyCheckinRow>(
    `INSERT INTO weekly_checkins
       (user_id, goal_id, week_start, confidence, momentum, blockers, wins, notes, recovery_plan, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, goal_id, week_start)
     DO UPDATE SET
       confidence = EXCLUDED.confidence,
       momentum = EXCLUDED.momentum,
       blockers = EXCLUDED.blockers,
       wins = EXCLUDED.wins,
       notes = EXCLUDED.notes,
       recovery_plan = EXCLUDED.recovery_plan,
       updated_at = NOW()
     RETURNING
       week_start::text,
       confidence,
       momentum,
       blockers,
       wins,
       notes,
       recovery_plan,
       created_at::text,
       updated_at::text`,
    [
      userId,
      goalId,
      weekStart,
      clamp(Math.round(input.confidence), 1, 5),
      clamp(Math.round(input.momentum), 1, 5),
      JSON.stringify(blockers),
      JSON.stringify(wins),
      notes,
      JSON.stringify(recoveryPlan),
    ],
  );

  const mapped = mapCheckinRow(rows[0]);
  if (!mapped) {
    throw new Error('Failed to save weekly check-in');
  }
  return mapped;
}

export async function getWeeklyReport(
  userId: string,
  goalId?: string,
): Promise<WeeklyReport | null> {
  const goal = goalId
    ? await getGoalById(userId, goalId)
    : await getPrimaryActiveGoal(userId);

  if (!goal?._id) {
    return null;
  }

  const resolvedGoalId = String(goal._id);
  const weekStartDate = startOfIsoWeek();
  const weekEndDate = endOfIsoWeek(weekStartDate);
  const latestCheckin = mapCheckinRow(await getLatestGoalCheckinRow(userId, resolvedGoalId));

  const [planHealth, stats, streak, weakTopicTitles, gapRecord, nextAvailableNodeTitle] =
    await Promise.all([
      getGoalPlanHealth(userId, resolvedGoalId),
      getWeeklySessionStats(userId, resolvedGoalId, weekStartDate),
      getStreak(userId),
      getWeakTopicTitles(goal, userId, resolvedGoalId, weekStartDate),
      getGoalGapReportRecord(userId, resolvedGoalId).catch(() => null),
      getNextAvailableNodeTitle(userId, resolvedGoalId),
    ]);

  const weakAreas = buildWeakAreas({
    weakTopicTitles,
    latestCheckin,
    gapMissingSkills: gapRecord?.gapReport?.missingSkills.map((item) => item.name) ?? [],
    planHealth,
  });

  const recoveryPlan = buildRecoveryPlan({
    planHealth,
    stats,
    latestCheckin,
    weakAreas,
    nextAvailableNodeTitle,
  });

  const weeklyTargetProgressPct =
    planHealth.weeklyTargetMinutes && planHealth.weeklyTargetMinutes > 0
      ? Math.round((stats.studyMinutesThisWeek / planHealth.weeklyTargetMinutes) * 100)
      : null;

  return {
    goalId: resolvedGoalId,
    goalTitle: trimToNull(goal?.structured?.title) ?? 'Active goal',
    targetRole: trimToNull(goal?.sprint?.targetRole) ?? gapRecord?.targetRole ?? null,
    weekStart: formatIsoDate(weekStartDate),
    weekEnd: formatIsoDate(weekEndDate),
    checkinDue: latestCheckin?.weekStart !== formatIsoDate(weekStartDate),
    latestCheckin,
    recoveryPlan,
    planHealth,
    stats: {
      sessionsThisWeek: stats.sessionsThisWeek,
      reviewSessionsThisWeek: stats.reviewSessionsThisWeek,
      studyMinutesThisWeek: stats.studyMinutesThisWeek,
      averageConfidence: stats.averageConfidence,
      currentStreak: streak.currentStreak,
      totalSessions: streak.totalSessions,
      weeklyTargetMinutes: planHealth.weeklyTargetMinutes,
      weeklyTargetProgressPct,
    },
    highlights: buildHighlights({
      stats,
      streak,
      planHealth,
      latestCheckin,
    }),
    weakAreas,
  };
}
