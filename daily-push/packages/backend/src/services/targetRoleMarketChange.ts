import {
  assertValidTargetRoleMarketChangeResponse,
  type ContractMeta,
  type ContractWarning,
  type RoleMarketProfile,
  type RoleMarketProfileVersion,
  type RoleReadinessReport,
  type RoleTrendSignal,
  type TargetRole,
  type TargetRoleMarketChangeMateriality,
  type TargetRoleMarketChangeResponse,
  type TargetRoleMarketChangeSignals,
  type TargetRoleMarketChangeStatus,
  type TargetRoleMarketRequirementChange,
} from '@daily-push/shared';
import { config } from '../config';
import { DependencyUnavailableError } from '../middleware/roleMarketFeature';
import { computeMarketProfileDiff } from './marketProfileDiff';
import { getMarketProfileRegistry } from './marketProfileRegistry';
import {
  getRoleMarketProfileVersion,
} from './liveMarketProfileVersionStore';
import { getLatestRoleReadinessReport } from './roleReadiness';
import { getTargetRole } from './targetRoles';

const HIGH_CONFIDENCE_TREND_THRESHOLD = 0.78;
const MATERIAL_CONFIDENCE_DROP_THRESHOLD = -0.08;

function buildMeta(
  sourceMode: ContractMeta['sourceMode'],
  warnings: ContractWarning[] = [],
): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings,
  };
}

function emptySignals(): TargetRoleMarketChangeSignals {
  return {
    addedMustHaveRequirements: [],
    removedMustHaveRequirements: [],
    changedRequirements: [],
    highConfidenceTrendChanges: [],
    confidenceDrop: null,
    requirementChangeCount: 0,
  };
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function trendByLabel(profile: RoleMarketProfile): Map<string, RoleTrendSignal> {
  return new Map(
    profile.trendSignals.map((trendSignal) => [
      normalizeLabel(trendSignal.label),
      trendSignal,
    ]),
  );
}

function describeTrendChange(
  label: string,
  before: RoleTrendSignal | null,
  after: RoleTrendSignal | null,
): string | null {
  if (!before && after && after.confidence >= HIGH_CONFIDENCE_TREND_THRESHOLD) {
    return `New high-confidence trend: ${after.label}.`;
  }
  if (before && !after && before.confidence >= HIGH_CONFIDENCE_TREND_THRESHOLD) {
    return `Removed high-confidence trend: ${before.label}.`;
  }
  if (!before || !after) return null;

  const changed =
    before.direction !== after.direction ||
    before.impact !== after.impact ||
    Math.abs(before.confidence - after.confidence) >= 0.12;
  const highConfidence = Math.max(before.confidence, after.confidence) >= HIGH_CONFIDENCE_TREND_THRESHOLD;
  if (!changed || !highConfidence) return null;

  return `High-confidence trend changed: ${label} (${before.direction}/${before.impact} -> ${after.direction}/${after.impact}).`;
}

function highConfidenceTrendChanges(
  beforeProfile: RoleMarketProfile,
  afterProfile: RoleMarketProfile,
): string[] {
  const before = trendByLabel(beforeProfile);
  const after = trendByLabel(afterProfile);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes: string[] = [];
  for (const key of keys) {
    const change = describeTrendChange(
      before.get(key)?.label ?? after.get(key)?.label ?? key,
      before.get(key) ?? null,
      after.get(key) ?? null,
    );
    if (change) changes.push(change);
  }
  return changes.slice(0, 6);
}

function mapRequirementChange(
  change: {
    label: string;
    before: {
      priority: TargetRoleMarketRequirementChange['beforePriority'];
      keywords: string[];
    } | null;
    after: {
      priority: TargetRoleMarketRequirementChange['afterPriority'];
      keywords: string[];
    } | null;
    changeSummary: string;
  },
  changeType: TargetRoleMarketRequirementChange['changeType'],
): TargetRoleMarketRequirementChange {
  return {
    label: change.label,
    changeType,
    beforePriority: change.before?.priority ?? null,
    afterPriority: change.after?.priority ?? null,
    beforeKeywords: change.before?.keywords ?? [],
    afterKeywords: change.after?.keywords ?? [],
    summary: change.changeSummary,
  };
}

function materialityWithNone(
  materiality: TargetRoleMarketChangeMateriality,
): TargetRoleMarketChangeMateriality {
  return materiality;
}

function classifyChange(input: {
  signals: TargetRoleMarketChangeSignals;
  diffMateriality: 'low' | 'medium' | 'high';
}): {
  status: TargetRoleMarketChangeStatus;
  materiality: TargetRoleMarketChangeMateriality;
  hasMaterialChange: boolean;
  shouldPromptReassessment: boolean;
} {
  const hasMaterialChange =
    input.signals.addedMustHaveRequirements.length > 0 ||
    input.signals.removedMustHaveRequirements.length > 0 ||
    input.signals.highConfidenceTrendChanges.length > 0 ||
    input.signals.confidenceDrop !== null ||
    input.diffMateriality === 'high';

  if (hasMaterialChange) {
    return {
      status: 'material_change',
      materiality: 'high',
      hasMaterialChange: true,
      shouldPromptReassessment: true,
    };
  }

  return {
    status: 'low_change',
    materiality: materialityWithNone(input.diffMateriality),
    hasMaterialChange: false,
    shouldPromptReassessment: false,
  };
}

function summarizeReasons(signals: TargetRoleMarketChangeSignals): string[] {
  const reasons: string[] = [];
  signals.addedMustHaveRequirements.slice(0, 3).forEach((label) => {
    reasons.push(`New must-have requirement: ${label}.`);
  });
  signals.removedMustHaveRequirements.slice(0, 3).forEach((label) => {
    reasons.push(`Removed must-have requirement: ${label}.`);
  });
  signals.highConfidenceTrendChanges.slice(0, 3).forEach((change) => {
    reasons.push(change);
  });
  if (signals.confidenceDrop !== null) {
    reasons.push(`Market profile confidence dropped by ${Math.abs(Math.round(signals.confidenceDrop * 100))} point(s).`);
  }
  return reasons.slice(0, 6);
}

function summaryText(input: {
  status: TargetRoleMarketChangeStatus;
  currentProfileVersionId: string | null;
  reasons: string[];
  materiality: TargetRoleMarketChangeMateriality;
}): string {
  if (input.status === 'not_assessed') {
    return 'Generate a readiness report before checking whether market requirements changed.';
  }
  if (input.status === 'no_current_published_profile') {
    return 'No current reviewed market profile is available for this Target Role, so there is nothing newer to compare yet.';
  }
  if (input.status === 'version_unpinned') {
    return 'Your latest readiness report was created before market profile version pinning. A new report can create a source-pinned baseline.';
  }
  if (input.status === 'report_version_unavailable') {
    return 'The market profile version used by your latest report is no longer available for comparison. A new report can refresh the baseline.';
  }
  if (input.status === 'up_to_date') {
    return 'Your latest readiness report already uses the current reviewed market profile.';
  }
  if (input.status === 'material_change') {
    const topReason = input.reasons[0] ? ` ${input.reasons[0]}` : '';
    return `Market requirements changed since your last report.${topReason} Reassess when you want the latest gap view.`;
  }
  return `The current market profile has ${input.materiality} updates since your last report, but no material reassessment trigger was found.`;
}

function buildResponse(params: {
  targetRole: TargetRole;
  latestReadinessReport: RoleReadinessReport | null;
  currentPublishedVersion: RoleMarketProfileVersion | null;
  reportProfileVersion: RoleMarketProfileVersion | null;
  status: TargetRoleMarketChangeStatus;
  materiality: TargetRoleMarketChangeMateriality;
  hasMaterialChange: boolean;
  shouldPromptReassessment: boolean;
  reasons?: string[];
  signals?: TargetRoleMarketChangeSignals;
  warnings?: ContractWarning[];
}): TargetRoleMarketChangeResponse {
  const reasons = params.reasons ?? [];
  const signals = params.signals ?? emptySignals();
  const sourceMode =
    params.currentPublishedVersion?.sourceMode ??
    params.latestReadinessReport?.meta.sourceMode ??
    config.roleMarket.sourceMode;
  const response: TargetRoleMarketChangeResponse = {
    summary: {
      targetRoleId: params.targetRole.id,
      roleProfileId: params.targetRole.roleProfileId,
      latestReadinessReportId: params.latestReadinessReport?.id ?? null,
      latestReadinessGeneratedAt: params.latestReadinessReport?.generatedAt ?? null,
      reportProfileVersionId:
        params.latestReadinessReport?.meta.profileVersion?.profileVersionId ?? null,
      reportProfilePublishedAt:
        params.latestReadinessReport?.meta.profileVersion?.publishedAt ?? null,
      currentProfileVersionId: params.currentPublishedVersion?.id ?? null,
      currentProfilePublishedAt: params.currentPublishedVersion?.publishedAt ?? null,
      status: params.status,
      materiality: params.materiality,
      hasMaterialChange: params.hasMaterialChange,
      shouldPromptReassessment: params.shouldPromptReassessment,
      summary: summaryText({
        status: params.status,
        currentProfileVersionId: params.currentPublishedVersion?.id ?? null,
        reasons,
        materiality: params.materiality,
      }),
      reasons,
      signals,
      meta: buildMeta(sourceMode, params.warnings ?? []),
    },
  };
  assertValidTargetRoleMarketChangeResponse(response);
  return response;
}

export function buildTargetRoleMarketChangeResponseFromInputs(params: {
  targetRole: TargetRole;
  latestReadinessReport: RoleReadinessReport | null;
  currentPublishedVersion: RoleMarketProfileVersion | null;
  reportProfileVersion: RoleMarketProfileVersion | null;
}): TargetRoleMarketChangeResponse {
  const {
    targetRole,
    latestReadinessReport,
    currentPublishedVersion,
    reportProfileVersion,
  } = params;

  if (!latestReadinessReport) {
    return buildResponse({
      targetRole,
      latestReadinessReport,
      currentPublishedVersion,
      reportProfileVersion,
      status: 'not_assessed',
      materiality: 'none',
      hasMaterialChange: false,
      shouldPromptReassessment: false,
    });
  }

  if (!currentPublishedVersion) {
    return buildResponse({
      targetRole,
      latestReadinessReport,
      currentPublishedVersion,
      reportProfileVersion,
      status: 'no_current_published_profile',
      materiality: 'none',
      hasMaterialChange: false,
      shouldPromptReassessment: false,
    });
  }

  const reportProfileVersionId = latestReadinessReport.meta.profileVersion?.profileVersionId ?? null;
  if (!reportProfileVersionId) {
    return buildResponse({
      targetRole,
      latestReadinessReport,
      currentPublishedVersion,
      reportProfileVersion,
      status: 'version_unpinned',
      materiality: 'none',
      hasMaterialChange: false,
      shouldPromptReassessment: true,
      reasons: ['Latest readiness report does not include market profile version metadata.'],
    });
  }

  if (reportProfileVersionId === currentPublishedVersion.id) {
    return buildResponse({
      targetRole,
      latestReadinessReport,
      currentPublishedVersion,
      reportProfileVersion,
      status: 'up_to_date',
      materiality: 'none',
      hasMaterialChange: false,
      shouldPromptReassessment: false,
    });
  }

  if (!reportProfileVersion) {
    return buildResponse({
      targetRole,
      latestReadinessReport,
      currentPublishedVersion,
      reportProfileVersion,
      status: 'report_version_unavailable',
      materiality: 'none',
      hasMaterialChange: false,
      shouldPromptReassessment: true,
      reasons: [`Previous profile version ${reportProfileVersionId} was not found.`],
    });
  }

  const diff =
    currentPublishedVersion.profileDiff?.previousProfileVersionId === reportProfileVersion.id
      ? currentPublishedVersion.profileDiff
      : computeMarketProfileDiff({
        profileVersionId: currentPublishedVersion.id,
        roleProfileId: currentPublishedVersion.roleProfileId,
        previousProfileVersionId: reportProfileVersion.id,
        beforeProfile: reportProfileVersion.profile,
        afterProfile: currentPublishedVersion.profile,
        sourceMode: currentPublishedVersion.sourceMode,
      });
  const signals: TargetRoleMarketChangeSignals = {
    addedMustHaveRequirements: diff.requirements.added
      .filter((item) => item.after?.priority === 'must_have')
      .map((item) => item.label),
    removedMustHaveRequirements: diff.requirements.removed
      .filter((item) => item.before?.priority === 'must_have')
      .map((item) => item.label),
    changedRequirements: [
      ...diff.requirements.added.map((item) => mapRequirementChange(item, 'added')),
      ...diff.requirements.removed.map((item) => mapRequirementChange(item, 'removed')),
      ...diff.requirements.changed.map((item) => mapRequirementChange(item, 'changed')),
    ].slice(0, 12),
    highConfidenceTrendChanges: highConfidenceTrendChanges(
      reportProfileVersion.profile,
      currentPublishedVersion.profile,
    ),
    confidenceDrop:
      diff.confidence.delta <= MATERIAL_CONFIDENCE_DROP_THRESHOLD
        ? diff.confidence.delta
        : null,
    requirementChangeCount:
      diff.requirements.added.length +
      diff.requirements.removed.length +
      diff.requirements.changed.length,
  };
  const classification = classifyChange({
    signals,
    diffMateriality: diff.materiality,
  });
  const reasons = summarizeReasons(signals);

  return buildResponse({
    targetRole,
    latestReadinessReport,
    currentPublishedVersion,
    reportProfileVersion,
    status: classification.status,
    materiality: classification.materiality,
    hasMaterialChange: classification.hasMaterialChange,
    shouldPromptReassessment: classification.shouldPromptReassessment,
    reasons,
    signals,
  });
}

async function loadCurrentPublishedVersion(targetRole: TargetRole): Promise<RoleMarketProfileVersion | null> {
  let roleProfile: RoleMarketProfile;
  try {
    roleProfile = await getMarketProfileRegistry().getProfile(
      targetRole.roleProfileId,
      { region: targetRole.candidateInput?.region ?? null },
    );
  } catch (error) {
    if (error instanceof DependencyUnavailableError) return null;
    throw error;
  }
  const currentProfileVersionId = roleProfile.meta.profileVersion?.profileVersionId ?? null;
  return currentProfileVersionId
    ? getRoleMarketProfileVersion(currentProfileVersionId)
    : null;
}

export async function getTargetRoleMarketChange(
  userId: string,
  targetRoleId: string,
): Promise<TargetRoleMarketChangeResponse> {
  const targetRole = await getTargetRole(userId, targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const latestReadinessReport = await getLatestRoleReadinessReport(userId, targetRoleId);
  const currentPublishedVersion = await loadCurrentPublishedVersion(targetRole);
  const reportProfileVersionId = latestReadinessReport?.meta.profileVersion?.profileVersionId ?? null;
  const reportProfileVersion = reportProfileVersionId
    ? await getRoleMarketProfileVersion(reportProfileVersionId)
    : null;

  return buildTargetRoleMarketChangeResponseFromInputs({
    targetRole,
    latestReadinessReport,
    currentPublishedVersion,
    reportProfileVersion,
  });
}
