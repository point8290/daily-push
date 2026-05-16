import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo";
import { pool } from "../db/postgres";

export type SprintType =
  | "standard"
  | "senior_engineer"
  | "ai_engineer_transition";

export type SprintStatus =
  | "planned"
  | "on_track"
  | "at_risk"
  | "behind"
  | "complete";

export interface GoalSprintInput {
  sprintType?: SprintType | string | null;
  targetRole?: string | null;
  targetCompany?: string | null;
  targetDate?: string | null;
  weeklyCommitmentHours?: number | string | null;
  currentBlockers?: string[] | string | null;
  successEvidence?: string[] | string | null;
}

export interface NormalizedGoalSprintInput {
  sprintType: SprintType;
  targetRole: string | null;
  targetCompany: string | null;
  targetDate: string | null;
  weeklyCommitmentHours: number | null;
  currentBlockers: string[];
  successEvidence: string[];
}

export interface StoredGoalSprint {
  sprintType: SprintType;
  templateLabel: string;
  targetRole: string | null;
  targetCompany: string | null;
  targetDate: Date | null;
  weeklyCommitmentHours: number | null;
  currentBlockers: string[];
  successEvidence: string[];
  status: SprintStatus;
  riskScore: number | null;
  completionScore: number | null;
  weeklyTargetMinutes: number | null;
  recommendedDailyMinutes: number | null;
  forecastedCompletionDate: Date | null;
  bufferDays: number | null;
  nextReviewAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastHealthComputedAt: Date | null;
}

export interface GoalPlanHealthSummary {
  hasSprint: boolean;
  sprint: StoredGoalSprint | null;
  status: SprintStatus;
  riskScore: number;
  completionScore: number;
  weeklyTargetMinutes: number | null;
  recommendedDailyMinutes: number | null;
  estimatedWeeksTotal: number | null;
  estimatedWeeksRemaining: number | null;
  forecastedCompletionDate: string | null;
  targetDate: string | null;
  bufferDays: number | null;
  totalTopics: number;
  readyTopics: number;
  failedTopics: number;
  totalNodes: number;
  completedNodes: number;
  availableNodes: number;
  completedSessions: number;
  sessionsLast7Days: number;
  lastCompletedSessionAt: string | null;
  summary: string;
}

const SPRINT_LABELS: Record<SprintType, string> = {
  standard: "Standard Sprint",
  senior_engineer: "Senior Engineer Sprint",
  ai_engineer_transition: "AI Engineer Transition Sprint",
};

const PREMIUM_SPRINT_TYPES = new Set<SprintType>([
  "senior_engineer",
  "ai_engineer_transition",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => trimToNull(entry))
      .filter((entry): entry is string => entry !== null)
      .slice(0, 8);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  return [];
}

function normalizeSprintType(value: GoalSprintInput["sprintType"]): SprintType {
  if (
    value === "senior_engineer" ||
    value === "ai_engineer_transition" ||
    value === "standard"
  ) {
    return value;
  }

  return "standard";
}

function normalizeDateString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function nextReviewDate(from = new Date()): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + 7);
  result.setUTCHours(9, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function weeksFromProgress(
  totalWeeks: number | null,
  completionScore: number,
  sessionsLast7Days: number,
  failedTopics: number,
): number | null {
  if (totalWeeks === null || totalWeeks <= 0) {
    return null;
  }

  const completionRatio = clamp(completionScore / 100, 0, 1);
  let remainingWeeks = Math.ceil(totalWeeks * (1 - completionRatio));

  if (completionRatio < 1 && remainingWeeks < 1) {
    remainingWeeks = 1;
  }
  if (sessionsLast7Days === 0 && completionRatio < 1) {
    remainingWeeks += 1;
  }
  if (failedTopics > 0) {
    remainingWeeks += Math.min(2, failedTopics);
  }

  return remainingWeeks;
}

function buildSummary(params: {
  status: SprintStatus;
  forecastedCompletionDate: Date | null;
  targetDate: Date | null;
  weeklyTargetMinutes: number | null;
  completedNodes: number;
  totalNodes: number;
  failedTopics: number;
}): string {
  const {
    status,
    forecastedCompletionDate,
    targetDate,
    weeklyTargetMinutes,
    completedNodes,
    totalNodes,
    failedTopics,
  } = params;

  const weeklyHours =
    weeklyTargetMinutes !== null
      ? `${(weeklyTargetMinutes / 60).toFixed(1).replace(/\.0$/, "")}h/week`
      : "a consistent weekly rhythm";

  const progressText =
    totalNodes > 0
      ? `${completedNodes}/${totalNodes} concept nodes done`
      : "your roadmap is still being turned into concept nodes";

  const failureText =
    failedTopics > 0
      ? ` ${failedTopics} topic${failedTopics === 1 ? "" : "s"} still need${failedTopics === 1 ? "s" : ""} a retry.`
      : "";

  if (status === "complete") {
    return `Sprint complete. You finished ${progressText}.`;
  }

  if (forecastedCompletionDate && targetDate) {
    const lagDays = daysBetween(targetDate, forecastedCompletionDate);
    if (lagDays > 0) {
      return `You are trending ${lagDays} day${lagDays === 1 ? "" : "s"} behind target. Protect ${weeklyHours} to recover.${failureText}`;
    }
    return `You are on track for your target date with ${weeklyHours}. Keep shipping sessions consistently.${failureText}`;
  }

  if (forecastedCompletionDate) {
    return `You are projected to finish around ${forecastedCompletionDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}. Maintain ${weeklyHours}.${failureText}`;
  }

  return `Your sprint is set up. Commit to ${weeklyHours} and keep moving ${progressText}.${failureText}`;
}

export function isPremiumSprintType(type: SprintType): boolean {
  return PREMIUM_SPRINT_TYPES.has(type);
}

export function normalizeGoalSprintInput(
  input: GoalSprintInput | null | undefined,
): NormalizedGoalSprintInput {
  const sprintType = normalizeSprintType(input?.sprintType ?? null);
  const weeklyCommitmentHoursRaw = parseOptionalNumber(
    input?.weeklyCommitmentHours ?? null,
  );
  const weeklyCommitmentHours =
    weeklyCommitmentHoursRaw === null
      ? null
      : clamp(Math.round(weeklyCommitmentHoursRaw), 1, 40);

  return {
    sprintType,
    targetRole: trimToNull(input?.targetRole ?? null),
    targetCompany: trimToNull(input?.targetCompany ?? null),
    targetDate: normalizeDateString(input?.targetDate ?? null),
    weeklyCommitmentHours,
    currentBlockers: parseStringList(input?.currentBlockers ?? null),
    successEvidence: parseStringList(input?.successEvidence ?? null),
  };
}

export function buildSprintContextBlocks(
  sprint: NormalizedGoalSprintInput,
): string[] {
  const blocks: string[] = [];

  if (sprint.targetRole) {
    blocks.push(`Target role: ${sprint.targetRole}`);
  }
  if (sprint.targetCompany) {
    blocks.push(`Target company: ${sprint.targetCompany}`);
  }
  if (sprint.targetDate) {
    blocks.push(`Target date: ${sprint.targetDate.slice(0, 10)}`);
  }
  if (sprint.weeklyCommitmentHours !== null) {
    blocks.push(
      `Weekly time commitment: ${sprint.weeklyCommitmentHours} hours per week`,
    );
  }
  if (sprint.currentBlockers.length > 0) {
    blocks.push(`Current blockers: ${sprint.currentBlockers.join("; ")}`);
  }
  if (sprint.successEvidence.length > 0) {
    blocks.push(`Success evidence: ${sprint.successEvidence.join("; ")}`);
  }

  return blocks;
}

export function deriveAvailableMinsDayOverride(
  sprint: NormalizedGoalSprintInput,
  availableDaysWeek: number | null,
): number | null {
  if (sprint.weeklyCommitmentHours === null) {
    return null;
  }

  const days = clamp(availableDaysWeek ?? 5, 1, 7);
  return Math.max(15, Math.round((sprint.weeklyCommitmentHours * 60) / days));
}

async function getGoalDocument(userId: string, goalId: string): Promise<any> {
  const db = getDb();
  return db.collection("goals").findOne({
    _id: new ObjectId(goalId),
    userId,
  });
}

function buildStoredSprintDoc(
  input: NormalizedGoalSprintInput,
  existing: StoredGoalSprint | null,
): StoredGoalSprint {
  const now = new Date();
  return {
    sprintType: input.sprintType,
    templateLabel: SPRINT_LABELS[input.sprintType],
    targetRole: input.targetRole,
    targetCompany: input.targetCompany,
    targetDate: input.targetDate ? new Date(input.targetDate) : null,
    weeklyCommitmentHours: input.weeklyCommitmentHours,
    currentBlockers: input.currentBlockers,
    successEvidence: input.successEvidence,
    status: existing?.status ?? "planned",
    riskScore: existing?.riskScore ?? null,
    completionScore: existing?.completionScore ?? null,
    weeklyTargetMinutes:
      input.weeklyCommitmentHours !== null
        ? input.weeklyCommitmentHours * 60
        : existing?.weeklyTargetMinutes ?? null,
    recommendedDailyMinutes: existing?.recommendedDailyMinutes ?? null,
    forecastedCompletionDate: existing?.forecastedCompletionDate ?? null,
    bufferDays: existing?.bufferDays ?? null,
    nextReviewAt: existing?.nextReviewAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastHealthComputedAt: existing?.lastHealthComputedAt ?? null,
  };
}

export async function saveGoalSprintDefinition(
  userId: string,
  goalId: string,
  input: GoalSprintInput,
): Promise<StoredGoalSprint> {
  const goal = await getGoalDocument(userId, goalId);
  if (!goal) {
    throw new Error("Goal not found");
  }

  const normalized = normalizeGoalSprintInput(input);
  const sprintDoc = buildStoredSprintDoc(normalized, goal.sprint ?? null);

  const db = getDb();
  await db.collection("goals").updateOne(
    { _id: new ObjectId(goalId), userId },
    {
      $set: {
        sprint: sprintDoc,
        updatedAt: new Date(),
      },
    },
  );

  await pool.query(
    `INSERT INTO goal_sprints
       (
         user_id,
         goal_id,
         sprint_type,
         target_role,
         target_company,
         target_date,
         weekly_commitment_hours,
         current_blockers,
         success_evidence,
         status,
         risk_score,
         completion_score,
         weekly_target_minutes,
         recommended_daily_minutes,
         forecasted_completion_date,
         buffer_days,
         next_review_at,
         metadata,
         updated_at
       )
     VALUES
       (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13,
         $14, $15, $16, $17, $18::jsonb, NOW()
       )
     ON CONFLICT (user_id, goal_id)
     DO UPDATE SET
       sprint_type = EXCLUDED.sprint_type,
       target_role = EXCLUDED.target_role,
       target_company = EXCLUDED.target_company,
       target_date = EXCLUDED.target_date,
       weekly_commitment_hours = EXCLUDED.weekly_commitment_hours,
       current_blockers = EXCLUDED.current_blockers,
       success_evidence = EXCLUDED.success_evidence,
       status = EXCLUDED.status,
       risk_score = EXCLUDED.risk_score,
       completion_score = EXCLUDED.completion_score,
       weekly_target_minutes = EXCLUDED.weekly_target_minutes,
       recommended_daily_minutes = EXCLUDED.recommended_daily_minutes,
       forecasted_completion_date = EXCLUDED.forecasted_completion_date,
       buffer_days = EXCLUDED.buffer_days,
       next_review_at = EXCLUDED.next_review_at,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      userId,
      goalId,
      sprintDoc.sprintType,
      sprintDoc.targetRole,
      sprintDoc.targetCompany,
      sprintDoc.targetDate?.toISOString().slice(0, 10) ?? null,
      sprintDoc.weeklyCommitmentHours,
      JSON.stringify(sprintDoc.currentBlockers),
      JSON.stringify(sprintDoc.successEvidence),
      sprintDoc.status,
      sprintDoc.riskScore,
      sprintDoc.completionScore,
      sprintDoc.weeklyTargetMinutes,
      sprintDoc.recommendedDailyMinutes,
      sprintDoc.forecastedCompletionDate?.toISOString().slice(0, 10) ?? null,
      sprintDoc.bufferDays,
      sprintDoc.nextReviewAt?.toISOString() ?? null,
      JSON.stringify({
        templateLabel: sprintDoc.templateLabel,
        lastHealthComputedAt: sprintDoc.lastHealthComputedAt?.toISOString() ?? null,
      }),
    ],
  );

  return sprintDoc;
}

async function getGoalMetrics(userId: string, goalId: string): Promise<{
  totalNodes: number;
  completedNodes: number;
  availableNodes: number;
  completedSessions: number;
  sessionsLast7Days: number;
  lastCompletedSessionAt: string | null;
  availableDaysWeek: number | null;
}> {
  const [
    nodeResult,
    sessionResult,
    profileResult,
  ] = await Promise.all([
    pool.query<{
      total_nodes: number;
      completed_nodes: number;
      available_nodes: number;
    }>(
      `SELECT
         COUNT(*)::int AS total_nodes,
         COUNT(*) FILTER (WHERE status = 'done')::int AS completed_nodes,
         COUNT(*) FILTER (WHERE status = 'available')::int AS available_nodes
       FROM concept_nodes
       WHERE goal_id = $1 AND user_id = $2`,
      [goalId, userId],
    ),
    pool.query<{
      completed_sessions: number;
      sessions_last_7_days: number;
      last_completed_session_at: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE s.completed_at IS NOT NULL)::int AS completed_sessions,
         COUNT(*) FILTER (
           WHERE s.completed_at IS NOT NULL
             AND s.completed_at >= NOW() - INTERVAL '7 days'
         )::int AS sessions_last_7_days,
         MAX(s.completed_at)::text AS last_completed_session_at
       FROM study_sessions s
       INNER JOIN concept_nodes n
         ON n.id = s.node_id
       WHERE n.goal_id = $1
         AND s.user_id = $2`,
      [goalId, userId],
    ),
    pool.query<{ available_days_week: number | null }>(
      `SELECT available_days_week
         FROM user_profiles_structured
        WHERE user_id = $1`,
      [userId],
    ),
  ]);

  return {
    totalNodes: nodeResult.rows[0]?.total_nodes ?? 0,
    completedNodes: nodeResult.rows[0]?.completed_nodes ?? 0,
    availableNodes: nodeResult.rows[0]?.available_nodes ?? 0,
    completedSessions: sessionResult.rows[0]?.completed_sessions ?? 0,
    sessionsLast7Days: sessionResult.rows[0]?.sessions_last_7_days ?? 0,
    lastCompletedSessionAt: sessionResult.rows[0]?.last_completed_session_at ?? null,
    availableDaysWeek: profileResult.rows[0]?.available_days_week ?? null,
  };
}

function computePlanHealthFromGoal(params: {
  goal: any;
  metrics: Awaited<ReturnType<typeof getGoalMetrics>>;
}): GoalPlanHealthSummary {
  const { goal, metrics } = params;
  const sprint = (goal.sprint as StoredGoalSprint | null) ?? null;
  const totalTopics = Array.isArray(goal.learningTopics) ? goal.learningTopics.length : 0;
  const readyTopics = Array.isArray(goal.learningTopics)
    ? goal.learningTopics.filter(
        (topic: any) =>
          topic?.structured?.decompositionStatus === "completed",
      ).length
    : 0;
  const failedTopics = Array.isArray(goal.learningTopics)
    ? goal.learningTopics.filter(
        (topic: any) => topic?.structured?.decompositionStatus === "failed",
      ).length
    : 0;

  const estimatedWeeksTotalRaw =
    goal?.structured?.estimatedWeeksAtPace ??
    goal?.structured?.estimatedWeeks ??
    null;
  const estimatedWeeksTotal =
    typeof estimatedWeeksTotalRaw === "number" ? estimatedWeeksTotalRaw : null;
  const completionScore =
    metrics.totalNodes > 0
      ? clamp(Math.round((metrics.completedNodes / metrics.totalNodes) * 100), 0, 100)
      : 0;
  const remainingWeeks = weeksFromProgress(
    estimatedWeeksTotal,
    completionScore,
    metrics.sessionsLast7Days,
    failedTopics,
  );

  const today = new Date();
  const forecastedCompletionDate =
    remainingWeeks === null ? null : addDays(today, remainingWeeks * 7);
  const targetDate =
    sprint?.targetDate ??
    (goal?.structured?.targetDate ? new Date(goal.structured.targetDate) : null);
  const weeklyTargetMinutes =
    sprint?.weeklyTargetMinutes ??
    (sprint?.weeklyCommitmentHours !== null &&
    sprint?.weeklyCommitmentHours !== undefined
      ? sprint.weeklyCommitmentHours * 60
      : null);
  const recommendedDailyMinutes =
    weeklyTargetMinutes === null
      ? null
      : Math.ceil(weeklyTargetMinutes / clamp(metrics.availableDaysWeek ?? 5, 1, 7));

  let riskScore = 15;
  if (!sprint) {
    riskScore += 15;
  }
  if (!targetDate) {
    riskScore += 8;
  }
  if (!weeklyTargetMinutes) {
    riskScore += 12;
  } else if (weeklyTargetMinutes < 240) {
    riskScore += 10;
  } else if (weeklyTargetMinutes >= 420) {
    riskScore -= 6;
  }
  if (metrics.sessionsLast7Days === 0 && goal?.status === "active") {
    riskScore += 15;
  }
  if (failedTopics > 0) {
    riskScore += Math.min(18, failedTopics * 8);
  }

  let bufferDays: number | null = null;
  if (forecastedCompletionDate && targetDate) {
    bufferDays = daysBetween(forecastedCompletionDate, targetDate);
    if (bufferDays < 0) {
      riskScore += Math.min(30, Math.abs(bufferDays));
    } else if (bufferDays >= 14) {
      riskScore -= 8;
    }
  }

  if (completionScore >= 100) {
    riskScore = 0;
  }

  riskScore = clamp(riskScore, 0, 95);

  let status: SprintStatus = "planned";
  if (completionScore >= 100) {
    status = "complete";
  } else if (goal?.status === "active") {
    if (bufferDays !== null && bufferDays < 0) {
      status = "behind";
    } else if (riskScore >= 60) {
      status = "behind";
    } else if (riskScore >= 35) {
      status = "at_risk";
    } else {
      status = "on_track";
    }
  }

  const summary = buildSummary({
    status,
    forecastedCompletionDate,
    targetDate,
    weeklyTargetMinutes,
    completedNodes: metrics.completedNodes,
    totalNodes: metrics.totalNodes,
    failedTopics,
  });

  const hydratedSprint: StoredGoalSprint | null = sprint
    ? {
        ...sprint,
        status,
        riskScore,
        completionScore,
        weeklyTargetMinutes,
        recommendedDailyMinutes,
        forecastedCompletionDate,
        bufferDays,
        nextReviewAt: nextReviewDate(),
        updatedAt: new Date(),
        lastHealthComputedAt: new Date(),
      }
    : null;

  return {
    hasSprint: hydratedSprint !== null,
    sprint: hydratedSprint,
    status,
    riskScore,
    completionScore,
    weeklyTargetMinutes,
    recommendedDailyMinutes,
    estimatedWeeksTotal,
    estimatedWeeksRemaining: remainingWeeks,
    forecastedCompletionDate: forecastedCompletionDate?.toISOString() ?? null,
    targetDate: targetDate?.toISOString() ?? null,
    bufferDays,
    totalTopics,
    readyTopics,
    failedTopics,
    totalNodes: metrics.totalNodes,
    completedNodes: metrics.completedNodes,
    availableNodes: metrics.availableNodes,
    completedSessions: metrics.completedSessions,
    sessionsLast7Days: metrics.sessionsLast7Days,
    lastCompletedSessionAt: metrics.lastCompletedSessionAt,
    summary,
  };
}

async function persistPlanHealth(
  userId: string,
  goalId: string,
  health: GoalPlanHealthSummary,
): Promise<void> {
  if (!health.sprint) {
    return;
  }

  const db = getDb();
  await db.collection("goals").updateOne(
    { _id: new ObjectId(goalId), userId },
    {
      $set: {
        sprint: health.sprint,
        updatedAt: new Date(),
      },
    },
  );

  await pool.query(
    `UPDATE goal_sprints
        SET status = $3,
            risk_score = $4,
            completion_score = $5,
            weekly_target_minutes = $6,
            recommended_daily_minutes = $7,
            forecasted_completion_date = $8,
            buffer_days = $9,
            next_review_at = $10,
            metadata = $11::jsonb,
            updated_at = NOW()
      WHERE user_id = $1
        AND goal_id = $2`,
    [
      userId,
      goalId,
      health.status,
      health.riskScore,
      health.completionScore,
      health.weeklyTargetMinutes,
      health.recommendedDailyMinutes,
      health.forecastedCompletionDate
        ? health.forecastedCompletionDate.slice(0, 10)
        : null,
      health.bufferDays,
      health.sprint.nextReviewAt?.toISOString() ?? null,
      JSON.stringify({
        templateLabel: health.sprint.templateLabel,
        lastHealthComputedAt:
          health.sprint.lastHealthComputedAt?.toISOString() ?? null,
        summary: health.summary,
      }),
    ],
  );
}

export async function getGoalPlanHealth(
  userId: string,
  goalId: string,
): Promise<GoalPlanHealthSummary> {
  const goal = await getGoalDocument(userId, goalId);
  if (!goal) {
    throw new Error("Goal not found");
  }

  const metrics = await getGoalMetrics(userId, goalId);
  return computePlanHealthFromGoal({ goal, metrics });
}

export async function rebaselineGoalSprint(
  userId: string,
  goalId: string,
): Promise<GoalPlanHealthSummary> {
  const health = await getGoalPlanHealth(userId, goalId);
  await persistPlanHealth(userId, goalId, health);
  return health;
}
