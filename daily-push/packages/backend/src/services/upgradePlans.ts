import { createHash, randomUUID } from 'crypto';
import {
  assertValidCreateUpgradePlanResponse,
  assertValidUpgradePlan,
  type ContractMeta,
  type ContractWarning,
  type CreateUpgradePlanResponse,
  type ProofRecommendation,
  type RoleReadinessReport,
  type UpgradePlan,
  type UpgradePlanTopic,
} from '@daily-push/shared';
import { config } from '../config';
import { pool } from '../db/postgres';
import { buildGapToProofRecommendations } from './gapToProof';
import {
  getLatestRoleReadinessReport,
  getRoleReadinessReportById,
} from './roleReadiness';
import { getRoleMarketProfile } from './roleMarketCatalog';
import { getTargetRole } from './targetRoles';

interface UpgradePlanRow {
  id: string;
  plan: UpgradePlan | Record<string, unknown>;
}

type DurationWeeks = 2 | 4 | 6 | 8;

function buildMeta(warnings: ContractWarning[] = []): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings,
  };
}

function stableKey(parts: Array<string | number | null | undefined>): string {
  return createHash('sha1')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 36);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function normalizeDuration(value: unknown): DurationWeeks {
  return value === 2 || value === 4 || value === 6 || value === 8 ? value : 4;
}

function normalizeWeeklyCommitment(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, 1, 40)
    : 6;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 10): string[] {
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

function buildTopicFromTask(
  task: ProofRecommendation,
  index: number,
  durationWeeks: number,
  weeklyCommitmentHours: number,
): UpgradePlanTopic {
  const estimatedWeeks = Math.max(
    1,
    Math.min(durationWeeks, Math.ceil(task.estimatedHours / Math.max(weeklyCommitmentHours, 1))),
  );
  return {
    title: task.title,
    rationale: task.whyItMatters,
    linkedGap: task.gapAddressed,
    linkedRequirementIds: task.linkedRequirementIds,
    targetOutcome: task.expectedOutput,
    estimatedWeeks,
    priority: index + 1,
  };
}

function buildSuccessEvidence(
  proofTasks: ProofRecommendation[],
  report: RoleReadinessReport,
): string[] {
  return uniqueStrings([
    ...proofTasks.map((task) => task.expectedOutput),
    ...proofTasks.flatMap((task) => task.acceptanceCriteria.slice(0, 1)),
    ...report.missingProof.slice(0, 3),
  ], 10);
}

function buildRisks(
  proofTasks: ProofRecommendation[],
  report: RoleReadinessReport,
  durationWeeks: number,
  weeklyCommitmentHours: number,
): string[] {
  const totalHours = proofTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
  const availableHours = durationWeeks * weeklyCommitmentHours;
  return uniqueStrings([
    totalHours > availableHours
      ? `The proof workload is about ${totalHours} hours, which is higher than the ${availableHours} hours available in this plan.`
      : null,
    ...report.criticalGaps.slice(0, 3),
    ...report.interviewRisks.slice(0, 2),
    report.meta.warnings[0]?.message,
  ], 8);
}

async function loadReadinessReport(
  userId: string,
  targetRoleId: string,
  readinessReportId?: string | null,
): Promise<RoleReadinessReport> {
  const report = readinessReportId
    ? await getRoleReadinessReportById(userId, targetRoleId, readinessReportId)
    : await getLatestRoleReadinessReport(userId, targetRoleId);
  if (!report) {
    const error = new Error('Generate a readiness report before creating an upgrade plan.');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }
  return report;
}

function mapUpgradePlanRow(row: UpgradePlanRow): UpgradePlan {
  assertValidUpgradePlan(row.plan);
  return row.plan;
}

export async function getUpgradePlanForTargetRole(
  userId: string,
  targetRoleId: string,
  upgradePlanId: string,
): Promise<UpgradePlan | null> {
  const { rows } = await pool.query<UpgradePlanRow>(
    `SELECT id::text, plan
       FROM candidate_upgrade_plans
      WHERE user_id = $1
        AND target_role_id = $2
        AND id = $3
      LIMIT 1`,
    [userId, targetRoleId, upgradePlanId],
  );
  return rows[0] ? mapUpgradePlanRow(rows[0]) : null;
}

export async function getLatestUpgradePlanForTargetRole(
  userId: string,
  targetRoleId: string,
): Promise<UpgradePlan | null> {
  const { rows } = await pool.query<UpgradePlanRow>(
    `SELECT id::text, plan
       FROM candidate_upgrade_plans
      WHERE user_id = $1
        AND target_role_id = $2
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId, targetRoleId],
  );
  return rows[0] ? mapUpgradePlanRow(rows[0]) : null;
}

export async function linkUpgradePlanExecution(
  userId: string,
  targetRoleId: string,
  upgradePlanId: string,
  links: {
    goalId: string;
    sprintId?: string | null;
  },
): Promise<UpgradePlan> {
  const upgradePlan = await getUpgradePlanForTargetRole(
    userId,
    targetRoleId,
    upgradePlanId,
  );
  if (!upgradePlan) {
    const error = new Error('Upgrade plan not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const updatedPlan: UpgradePlan = {
    ...upgradePlan,
    linkedGoalId: links.goalId,
    linkedSprintId: links.sprintId ?? upgradePlan.linkedSprintId,
  };
  assertValidUpgradePlan(updatedPlan);

  const { rows } = await pool.query<UpgradePlanRow>(
    `UPDATE candidate_upgrade_plans
        SET plan = $4::jsonb,
            linked_goal_id = $5,
            linked_sprint_id = COALESCE($6::uuid, linked_sprint_id),
            updated_at = NOW()
      WHERE user_id = $1
        AND target_role_id = $2
        AND id = $3
      RETURNING id::text, plan`,
    [
      userId,
      targetRoleId,
      upgradePlanId,
      JSON.stringify(updatedPlan),
      links.goalId,
      links.sprintId ?? null,
    ],
  );

  if (!rows[0]) {
    throw new Error('Upgrade plan could not be linked.');
  }
  return mapUpgradePlanRow(rows[0]);
}

export async function addUpgradePlanWarning(
  userId: string,
  targetRoleId: string,
  upgradePlanId: string,
  warning: ContractWarning,
): Promise<UpgradePlan> {
  const upgradePlan = await getUpgradePlanForTargetRole(
    userId,
    targetRoleId,
    upgradePlanId,
  );
  if (!upgradePlan) {
    const error = new Error('Upgrade plan not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const exists = upgradePlan.meta.warnings.some(
    (entry) => entry.code === warning.code && entry.message === warning.message,
  );
  const updatedPlan: UpgradePlan = {
    ...upgradePlan,
    meta: {
      ...upgradePlan.meta,
      warnings: exists
        ? upgradePlan.meta.warnings
        : [...upgradePlan.meta.warnings, warning],
    },
  };
  assertValidUpgradePlan(updatedPlan);

  const { rows } = await pool.query<UpgradePlanRow>(
    `UPDATE candidate_upgrade_plans
        SET plan = $4::jsonb,
            metadata = metadata || $5::jsonb,
            updated_at = NOW()
      WHERE user_id = $1
        AND target_role_id = $2
        AND id = $3
      RETURNING id::text, plan`,
    [
      userId,
      targetRoleId,
      upgradePlanId,
      JSON.stringify(updatedPlan),
      JSON.stringify({
        latestWarning: warning,
      }),
    ],
  );

  if (!rows[0]) {
    throw new Error('Upgrade plan warning could not be saved.');
  }
  return mapUpgradePlanRow(rows[0]);
}

export async function createUpgradePlanForTargetRole(params: {
  userId: string;
  targetRoleId: string;
  readinessReportId?: string | null;
  durationWeeks?: number;
  weeklyCommitmentHours?: number;
}): Promise<CreateUpgradePlanResponse> {
  const targetRole = await getTargetRole(params.userId, params.targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const durationWeeks = normalizeDuration(params.durationWeeks);
  const weeklyCommitmentHours = normalizeWeeklyCommitment(params.weeklyCommitmentHours);
  const readinessReport = await loadReadinessReport(
    params.userId,
    params.targetRoleId,
    params.readinessReportId,
  );
  const roleProfile = getRoleMarketProfile(readinessReport.roleProfileId);
  const proofResponse = await buildGapToProofRecommendations({
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    readinessReportId: readinessReport.id,
    maxItems: 6,
  });
  const proofTasks = proofResponse.proofRecommendations;
  const planKey = stableKey([
    params.targetRoleId,
    readinessReport.id,
    durationWeeks,
    weeklyCommitmentHours,
    proofTasks.map((task) => task.id).join(','),
  ]);

  const { rows: existingRows } = await pool.query<UpgradePlanRow>(
    `SELECT id::text, plan
       FROM candidate_upgrade_plans
      WHERE user_id = $1
        AND target_role_id = $2
        AND readiness_report_id = $3
        AND plan_key = $4
      LIMIT 1`,
    [params.userId, params.targetRoleId, readinessReport.id, planKey],
  );

  if (existingRows[0]) {
    const upgradePlan = mapUpgradePlanRow(existingRows[0]);
    return {
      upgradePlan,
      goalId: upgradePlan.linkedGoalId,
      sprintId: upgradePlan.linkedSprintId,
      nextAction: upgradePlan.linkedSprintId ? 'start_sprint' : 'review_plan',
    };
  }

  const warnings: ContractWarning[] = [
    ...readinessReport.meta.warnings,
    ...proofResponse.meta.warnings,
  ];
  const topics = proofTasks.map((task, index) =>
    buildTopicFromTask(task, index, durationWeeks, weeklyCommitmentHours),
  );
  const title = `${durationWeeks}-week ${roleProfile.title} upgrade plan`;
  const now = new Date().toISOString();
  const planId = randomUUID();
  const upgradePlan: UpgradePlan = {
    id: planId,
    userId: params.userId,
    targetRoleId: params.targetRoleId,
    readinessReportId: readinessReport.id,
    title,
    durationWeeks,
    weeklyCommitmentHours,
    topics,
    proofTasks,
    successEvidence: buildSuccessEvidence(proofTasks, readinessReport),
    risks: buildRisks(proofTasks, readinessReport, durationWeeks, weeklyCommitmentHours),
    linkedGoalId: targetRole.linkedGoalId,
    linkedSprintId: targetRole.linkedSprintId,
    createdAt: now,
    meta: buildMeta(warnings),
  };
  assertValidUpgradePlan(upgradePlan);

  const { rows } = await pool.query<UpgradePlanRow>(
    `INSERT INTO candidate_upgrade_plans
       (id,
        user_id,
        target_role_id,
        readiness_report_id,
        plan_key,
        duration_weeks,
        weekly_commitment_hours,
        plan,
        linked_goal_id,
        linked_sprint_id,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb)
     RETURNING id::text, plan`,
    [
      planId,
      params.userId,
      params.targetRoleId,
      readinessReport.id,
      planKey,
      durationWeeks,
      weeklyCommitmentHours,
      JSON.stringify(upgradePlan),
      targetRole.linkedGoalId,
      targetRole.linkedSprintId,
      JSON.stringify({
        generatedBy: 'upgrade_plan_v1',
        proofRecommendationIds: proofTasks.map((task) => task.id),
      }),
    ],
  );

  if (!rows[0]) {
    throw new Error('Upgrade plan could not be created.');
  }

  const savedPlan = mapUpgradePlanRow(rows[0]);
  await pool.query(
    `UPDATE candidate_target_roles
        SET status = CASE
              WHEN status IN ('saved', 'assessed') THEN 'upgrade_plan_created'
              ELSE status
            END,
            updated_at = NOW()
      WHERE user_id = $1
        AND id = $2`,
    [params.userId, params.targetRoleId],
  );

  const response: CreateUpgradePlanResponse = {
    upgradePlan: savedPlan,
    goalId: savedPlan.linkedGoalId,
    sprintId: savedPlan.linkedSprintId,
    nextAction: savedPlan.linkedSprintId ? 'start_sprint' : 'review_plan',
  };
  assertValidCreateUpgradePlanResponse(response);
  return response;
}
