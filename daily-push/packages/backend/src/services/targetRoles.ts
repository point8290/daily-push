import {
  validateCandidateRoleInput,
  validateRoleRecommendation,
  type CandidateRoleInput,
  type CreateTargetRoleRequest,
  type CreateTargetRoleResponse,
  type RoleRecommendation,
  type TargetRole,
  type TargetRoleStatus,
} from '@daily-push/shared';
import { pool } from '../db/postgres';
import { assertBelowStateLimit } from './entitlements';
import { getRoleMarketProfile } from './roleMarketCatalog';

interface TargetRoleRow {
  id: string;
  user_id: string;
  role_profile_id: string;
  title: string;
  status: TargetRoleStatus;
  candidate_input: Record<string, unknown>;
  latest_assessment_id: string | null;
  linked_goal_id: string | null;
  linked_sprint_id: string | null;
  created_from: TargetRole['createdFrom'];
  created_at: string;
  updated_at: string;
}

export interface SaveTargetRoleResult extends CreateTargetRoleResponse {
  created: boolean;
}

export class TargetRoleValidationError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

function isEmptyObject(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}

function asCandidateInput(value: unknown): CandidateRoleInput | null {
  if (value === undefined || value === null) return null;
  const validation = validateCandidateRoleInput(value);
  if (!validation.valid) {
    throw new TargetRoleValidationError(validation.errors.join('; '));
  }
  return value as CandidateRoleInput;
}

function asRecommendationSnapshot(value: unknown): RoleRecommendation | null {
  if (value === undefined || value === null) return null;
  const validation = validateRoleRecommendation(value);
  if (!validation.valid) {
    throw new TargetRoleValidationError(validation.errors.join('; '));
  }
  return value as RoleRecommendation;
}

function mapTargetRole(row: TargetRoleRow): TargetRole {
  return {
    id: row.id,
    userId: row.user_id,
    roleProfileId: row.role_profile_id,
    title: row.title,
    status: row.status,
    candidateInput: isEmptyObject(row.candidate_input)
      ? null
      : row.candidate_input as unknown as CandidateRoleInput,
    latestAssessmentId: row.latest_assessment_id,
    linkedGoalId: row.linked_goal_id,
    linkedSprintId: row.linked_sprint_id,
    createdFrom: row.created_from,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function countActiveTargetRoles(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM candidate_target_roles
      WHERE user_id = $1
        AND status <> 'archived'`,
    [userId],
  );
  return Number.parseInt(rows[0]?.count ?? '0', 10);
}

export async function listTargetRoles(userId: string): Promise<TargetRole[]> {
  const { rows } = await pool.query<TargetRoleRow>(
    `SELECT id::text,
            user_id::text,
            role_profile_id,
            title,
            status,
            candidate_input,
            latest_assessment_id::text,
            linked_goal_id,
            linked_sprint_id::text,
            created_from,
            created_at::text,
            updated_at::text
       FROM candidate_target_roles
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );

  return rows.map(mapTargetRole);
}

export async function getTargetRole(
  userId: string,
  targetRoleId: string,
): Promise<TargetRole | null> {
  const { rows } = await pool.query<TargetRoleRow>(
    `SELECT id::text,
            user_id::text,
            role_profile_id,
            title,
            status,
            candidate_input,
            latest_assessment_id::text,
            linked_goal_id,
            linked_sprint_id::text,
            created_from,
            created_at::text,
            updated_at::text
       FROM candidate_target_roles
      WHERE user_id = $1
        AND id = $2
      LIMIT 1`,
    [userId, targetRoleId],
  );

  return rows[0] ? mapTargetRole(rows[0]) : null;
}

export async function saveTargetRole(
  userId: string,
  request: CreateTargetRoleRequest,
): Promise<SaveTargetRoleResult> {
  const roleProfile = getRoleMarketProfile(request.roleProfileId);
  const candidateInput = asCandidateInput(request.candidateInput);
  const recommendationSnapshot = asRecommendationSnapshot(request.recommendationSnapshot);

  const { rows: existingRows } = await pool.query<TargetRoleRow>(
    `SELECT id::text,
            user_id::text,
            role_profile_id,
            title,
            status,
            candidate_input,
            latest_assessment_id::text,
            linked_goal_id,
            linked_sprint_id::text,
            created_from,
            created_at::text,
            updated_at::text
       FROM candidate_target_roles
      WHERE user_id = $1
        AND role_profile_id = $2
        AND status <> 'archived'
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId, roleProfile.id],
  );

  if (existingRows[0]) {
    return {
      targetRole: mapTargetRole(existingRows[0]),
      nextAction: existingRows[0].latest_assessment_id ? 'view_workspace' : 'generate_readiness',
      created: false,
    };
  }

  const activeCount = await countActiveTargetRoles(userId);
  await assertBelowStateLimit(userId, 'target_roles.saved.max', activeCount);

  const { rows } = await pool.query<TargetRoleRow>(
    `INSERT INTO candidate_target_roles
       (user_id,
        role_profile_id,
        title,
        candidate_input,
        recommendation_snapshot,
        created_from,
        client_draft_id,
        metadata)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'market_analyzer', $6, '{}'::jsonb)
     RETURNING id::text,
               user_id::text,
               role_profile_id,
               title,
               status,
               candidate_input,
               latest_assessment_id::text,
               linked_goal_id,
               linked_sprint_id::text,
               created_from,
               created_at::text,
               updated_at::text`,
    [
      userId,
      roleProfile.id,
      roleProfile.title,
      JSON.stringify(candidateInput ?? {}),
      JSON.stringify(recommendationSnapshot ?? {}),
      request.clientDraftId ?? null,
    ],
  );

  if (!rows[0]) {
    throw new Error('Target Role could not be saved.');
  }

  return {
    targetRole: mapTargetRole(rows[0]),
    nextAction: 'generate_readiness',
    created: true,
  };
}
