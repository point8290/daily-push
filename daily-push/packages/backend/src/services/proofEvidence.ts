import {
  assertValidProofEvidenceStatusResponse,
  assertValidPublishProofEvidenceResponse,
  type ProofEvidenceStatusResponse,
  type PublishProofEvidenceResponse,
} from '@daily-push/shared';
import { pool } from '../db/postgres';
import { publishGoalArtifactsAsEvidence } from './candidateEvidence';
import { getLatestRoleReadinessReport } from './roleReadiness';
import { getTargetRole } from './targetRoles';

interface EvidenceStatsRow {
  claim_count: number;
  artifact_count: number;
  latest_evidence_at: string | null;
}

interface PublishableArtifactRow {
  artifact_id: string;
}

function notFound(message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
  (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
  return error;
}

function buildMessage(params: {
  evidenceClaimCount: number;
  publishableArtifactCount: number;
  reassessRecommended: boolean;
}): string {
  if (params.reassessRecommended) {
    return 'New proof has been added to Evidence Vault. Refresh readiness to see whether your score improved.';
  }
  if (params.publishableArtifactCount > 0) {
    return 'You have completed proof work that can be added to Evidence Vault.';
  }
  if (params.evidenceClaimCount > 0) {
    return 'Your completed proof is already available as source-backed evidence.';
  }
  return 'Complete proof tasks in Today, then add them to Evidence Vault for reassessment.';
}

async function getPublishedEvidenceStats(
  userId: string,
  targetRoleId: string,
): Promise<EvidenceStatsRow> {
  const { rows } = await pool.query<EvidenceStatsRow>(
    `SELECT COUNT(*)::int AS claim_count,
            COUNT(DISTINCT source_id)::int AS artifact_count,
            MAX(updated_at)::text AS latest_evidence_at
       FROM candidate_evidence_claims
      WHERE user_id = $1
        AND source_type = 'sprint_artifact'
        AND metadata->>'targetRoleId' = $2`,
    [userId, targetRoleId],
  );
  return rows[0] ?? { claim_count: 0, artifact_count: 0, latest_evidence_at: null };
}

async function getPublishableArtifactIds(
  userId: string,
  goalId: string | null,
): Promise<string[]> {
  if (!goalId) return [];
  const { rows } = await pool.query<PublishableArtifactRow>(
    `SELECT sa.id::text AS artifact_id
       FROM session_artifacts sa
       INNER JOIN concept_nodes cn
          ON cn.id = sa.node_id
      WHERE sa.user_id = $1
        AND cn.goal_id = $2
        AND sa.content IS NOT NULL
        AND LENGTH(TRIM(sa.content)) >= 25
        AND sa.status IN ('submitted', 'evaluated')
      ORDER BY sa.updated_at DESC`,
    [userId, goalId],
  );
  return rows.map((row) => row.artifact_id);
}

async function getAlreadyPublishedArtifactIds(
  userId: string,
  targetRoleId: string,
): Promise<Set<string>> {
  const { rows } = await pool.query<{ source_id: string | null }>(
    `SELECT source_id
       FROM candidate_evidence_claims
      WHERE user_id = $1
        AND source_type = 'sprint_artifact'
        AND metadata->>'targetRoleId' = $2`,
    [userId, targetRoleId],
  );
  return new Set(rows.map((row) => row.source_id).filter((value): value is string => Boolean(value)));
}

export async function getTargetRoleProofEvidenceStatus(
  userId: string,
  targetRoleId: string,
): Promise<ProofEvidenceStatusResponse> {
  const targetRole = await getTargetRole(userId, targetRoleId);
  if (!targetRole) {
    throw notFound('Target Role not found');
  }

  const [stats, publishableArtifactIds, publishedArtifactIds, latestReadiness] =
    await Promise.all([
      getPublishedEvidenceStats(userId, targetRoleId),
      getPublishableArtifactIds(userId, targetRole.linkedGoalId),
      getAlreadyPublishedArtifactIds(userId, targetRoleId),
      getLatestRoleReadinessReport(userId, targetRoleId).catch(() => null),
    ]);
  const unpublishedArtifactIds = publishableArtifactIds.filter(
    (artifactId) => !publishedArtifactIds.has(artifactId),
  );
  const latestEvidenceAt = stats.latest_evidence_at;
  const reassessRecommended = Boolean(
    latestEvidenceAt &&
      latestReadiness &&
      new Date(latestEvidenceAt).getTime() > new Date(latestReadiness.generatedAt).getTime(),
  );

  const response: ProofEvidenceStatusResponse = {
    targetRoleId,
    linkedGoalId: targetRole.linkedGoalId,
    evidenceClaimCount: stats.claim_count ?? 0,
    publishedArtifactCount: stats.artifact_count ?? 0,
    publishableArtifactCount: unpublishedArtifactIds.length,
    latestEvidenceAt,
    latestReadinessReportId: latestReadiness?.id ?? null,
    reassessRecommended,
    message: buildMessage({
      evidenceClaimCount: stats.claim_count ?? 0,
      publishableArtifactCount: unpublishedArtifactIds.length,
      reassessRecommended,
    }),
  };
  assertValidProofEvidenceStatusResponse(response);
  return response;
}

export async function publishTargetRoleProofEvidence(
  userId: string,
  targetRoleId: string,
): Promise<PublishProofEvidenceResponse> {
  const targetRole = await getTargetRole(userId, targetRoleId);
  if (!targetRole) {
    throw notFound('Target Role not found');
  }
  if (!targetRole.linkedGoalId) {
    const status = await getTargetRoleProofEvidenceStatus(userId, targetRoleId);
    const response: PublishProofEvidenceResponse = {
      ...status,
      publishedCount: 0,
      publishedClaims: [],
    };
    assertValidPublishProofEvidenceResponse(response);
    return response;
  }

  const claims = await publishGoalArtifactsAsEvidence(userId, targetRole.linkedGoalId);
  const status = await getTargetRoleProofEvidenceStatus(userId, targetRoleId);
  const response: PublishProofEvidenceResponse = {
    ...status,
    publishedCount: claims.length,
    publishedClaims: claims,
  };
  assertValidPublishProofEvidenceResponse(response);
  return response;
}
