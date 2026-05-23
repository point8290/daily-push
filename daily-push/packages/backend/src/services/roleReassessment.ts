import {
  assertValidReassessmentResponse,
  type ContractMeta,
  type ReassessmentResponse,
  type ReassessmentResult,
  type RequirementCoverage,
  type RoleReadinessReport,
} from '@daily-push/shared';
import { config } from '../config';
import {
  buildRoleReadinessReport,
  getRoleReadinessReportById,
  persistRoleReadinessReport,
} from './roleReadiness';

function buildMeta(): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 8): string[] {
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

function coverageRank(status: RequirementCoverage['status']): number {
  if (status === 'covered') return 3;
  if (status === 'weak') return 2;
  if (status === 'not_applicable') return 1;
  return 0;
}

function priorityRank(priority: RequirementCoverage['priority']): number {
  if (priority === 'must_have') return 0;
  if (priority === 'important') return 1;
  return 2;
}

function signedDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatCoverageStatus(status: RequirementCoverage['status']): string {
  return status.replace(/_/g, ' ');
}

function buildImprovedRequirements(
  previous: RoleReadinessReport,
  current: RoleReadinessReport,
): string[] {
  const previousByRequirement = new Map(
    previous.coverage.map((item) => [item.requirementId, item]),
  );

  return uniqueStrings(
    current.coverage
      .map((item) => {
        const before = previousByRequirement.get(item.requirementId);
        if (!before) return null;
        const scoreDelta = item.score - before.score;
        const rankDelta = coverageRank(item.status) - coverageRank(before.status);
        if (rankDelta <= 0 && scoreDelta < 8) return null;
        const transition = before.status === item.status
          ? `${formatCoverageStatus(item.status)} evidence ${signedDelta(scoreDelta)} points`
          : `${formatCoverageStatus(before.status)} -> ${formatCoverageStatus(item.status)} (${signedDelta(scoreDelta)})`;
        return `${item.requirementLabel}: ${transition}`;
      }),
    8,
  );
}

function buildStillWeakRequirements(current: RoleReadinessReport): string[] {
  return uniqueStrings(
    current.coverage
      .filter((item) => item.status === 'weak' || item.status === 'missing')
      .sort((a, b) => {
        const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
        return priorityDelta || a.score - b.score;
      })
      .map((item) => {
        const reason = item.gapReason ?? item.suggestedAction;
        return `${item.requirementLabel}: ${formatCoverageStatus(item.status)} at ${item.score}/100 - ${reason}`;
      }),
    8,
  );
}

function buildNewRecommendedActions(
  previous: RoleReadinessReport,
  current: RoleReadinessReport,
): string[] {
  const previousActions = new Set(
    previous.coverage
      .filter((item) => item.status !== 'covered')
      .map((item) => `${item.requirementId}:${item.suggestedAction.toLowerCase()}`),
  );
  const newWeakActions = current.coverage
    .filter((item) => item.status === 'weak' || item.status === 'missing')
    .sort((a, b) => {
      const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
      return priorityDelta || a.score - b.score;
    })
    .map((item) => {
      const actionKey = `${item.requirementId}:${item.suggestedAction.toLowerCase()}`;
      const prefix = previousActions.has(actionKey) ? 'Keep working on' : 'New focus';
      return `${prefix} ${item.requirementLabel}: ${item.suggestedAction}`;
    });

  return uniqueStrings([current.recommendedNextStep, ...newWeakActions], 8);
}

function buildSummary(params: {
  current: RoleReadinessReport;
  scoreDelta: number;
  improvedCount: number;
  stillWeakCount: number;
}): string {
  const { current, scoreDelta, improvedCount, stillWeakCount } = params;
  const direction = scoreDelta > 0
    ? `up ${scoreDelta} point${scoreDelta === 1 ? '' : 's'}`
    : scoreDelta < 0
      ? `down ${Math.abs(scoreDelta)} point${Math.abs(scoreDelta) === 1 ? '' : 's'}`
      : 'unchanged';
  const improvementPhrase = improvedCount > 0
    ? `${improvedCount} requirement${improvedCount === 1 ? '' : 's'} improved`
    : 'no requirement-level improvement detected yet';

  if (current.verdict === 'apply_now') {
    return `Readiness is ${direction} at ${current.score.overall}/100, with ${improvementPhrase}. You can apply now while polishing the remaining ${stillWeakCount} weak area${stillWeakCount === 1 ? '' : 's'}.`;
  }
  if (current.verdict === 'apply_after_edits') {
    return `Readiness is ${direction} at ${current.score.overall}/100, with ${improvementPhrase}. Make the recommended edits, then apply selectively.`;
  }
  return `Readiness is ${direction} at ${current.score.overall}/100, with ${improvementPhrase}. Continue upgrading before applying broadly; ${stillWeakCount} role requirement${stillWeakCount === 1 ? '' : 's'} still need stronger proof.`;
}

export async function reassessTargetRoleReadiness(params: {
  userId: string;
  targetRoleId: string;
  previousReadinessReportId: string;
  includeAiSummary?: boolean;
}): Promise<ReassessmentResponse> {
  const previous = await getRoleReadinessReportById(
    params.userId,
    params.targetRoleId,
    params.previousReadinessReportId,
  );
  if (!previous) {
    const error = new Error('Previous readiness report not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const generated = await buildRoleReadinessReport(params.userId, params.targetRoleId, {
    includeAiSummary: params.includeAiSummary,
  });
  const report = await persistRoleReadinessReport(
    params.userId,
    params.targetRoleId,
    generated,
  );
  const scoreDelta = report.score.overall - previous.score.overall;
  const improvedRequirements = buildImprovedRequirements(previous, report);
  const stillWeakRequirements = buildStillWeakRequirements(report);
  const newRecommendedActions = buildNewRecommendedActions(previous, report);
  const result: ReassessmentResult = {
    targetRoleId: params.targetRoleId,
    previousReadinessReportId: previous.id,
    newReadinessReportId: report.id,
    scoreDelta,
    improvedRequirements,
    stillWeakRequirements,
    newRecommendedActions,
    summary: buildSummary({
      current: report,
      scoreDelta,
      improvedCount: improvedRequirements.length,
      stillWeakCount: stillWeakRequirements.length,
    }),
    meta: buildMeta(),
  };

  const response: ReassessmentResponse = {
    result,
    report,
  };
  assertValidReassessmentResponse(response);
  return response;
}
