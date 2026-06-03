import {
  assertValidMarketProfileValidationResult,
  collectRoleMarketProfileCopyBlocks,
  evaluateRoleMarketCopySafety,
  validateRoleMarketProfile,
  type ContractMeta,
  type MarketProfileValidationFinding,
  type MarketProfileValidationResult,
  type RoleMarketProfile,
  type RoleMarketSignalAggregate,
  type SourceMode,
  type SourceReference,
} from '@daily-push/shared';
import { config } from '../config';

export interface MarketProfileDraftValidationPolicy {
  minimumSampleSize: number;
  minimumSourceCount: number;
  staleAfterHours: number;
  minimumConfidence: number;
  lowConfidenceBlocksPublish: boolean;
}

export interface ValidateMarketProfileDraftInput {
  profileVersionId: string;
  profile: RoleMarketProfile;
  aggregate: RoleMarketSignalAggregate;
  generatedAt?: string;
  sourceMode?: SourceMode;
  policy?: Partial<MarketProfileDraftValidationPolicy>;
}

type FindingCode = MarketProfileValidationFinding['code'];
type FindingSeverity = MarketProfileValidationFinding['severity'];

function defaultPolicy(): MarketProfileDraftValidationPolicy {
  return {
    minimumSampleSize: config.roleMarket.liveMinimumSampleSize,
    minimumSourceCount: config.roleMarket.liveMinimumSourceCount,
    staleAfterHours: config.roleMarket.liveSourceStaleAfterHours,
    minimumConfidence: config.roleMarket.liveMinimumConfidence,
    lowConfidenceBlocksPublish: config.roleMarket.liveLowConfidenceBlocksPublish,
  };
}

function buildMeta(generatedAt: string, sourceMode: SourceMode): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt,
    sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function finding(input: {
  profileVersionId: string;
  suffix: string;
  severity: FindingSeverity;
  code: FindingCode;
  message: string;
  path: string;
  sourceRefIds?: string[];
}): MarketProfileValidationFinding {
  return {
    id: `finding_${input.profileVersionId}_${input.suffix}`,
    severity: input.severity,
    code: input.code,
    message: input.message,
    path: input.path,
    sourceRefIds: input.sourceRefIds ?? [],
  };
}

function sourceRefIds(sourceRefs: SourceReference[]): string[] {
  return sourceRefs
    .map((sourceRef) => sourceRef.id)
    .filter((sourceRefId, index, sourceRefIds) => sourceRefId.trim() && sourceRefIds.indexOf(sourceRefId) === index);
}

function referencedSourceRefIds(profile: RoleMarketProfile): string[] {
  return [
    ...profile.requirements.flatMap((requirement) => requirement.sourceRefs),
    ...profile.trendSignals.flatMap((trendSignal) => trendSignal.sourceRefs),
  ].filter((sourceRefId, index, sourceRefIds) => sourceRefId.trim() && sourceRefIds.indexOf(sourceRefId) === index);
}

function hoursBetween(laterIso: string, earlierIso: string | null): number | null {
  if (!earlierIso) return null;
  const later = new Date(laterIso).getTime();
  const earlier = new Date(earlierIso).getTime();
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;
  return Math.max(0, (later - earlier) / (60 * 60 * 1000));
}

function sourceAgeHours(sourceRef: SourceReference, generatedAt: string): number | null {
  return hoursBetween(generatedAt, sourceRef.capturedAt ?? sourceRef.publishedAt);
}

function isFreshnessSensitiveSource(sourceRef: SourceReference): boolean {
  return ['job_post', 'company_career_page', 'user_added_jd'].includes(sourceRef.sourceType);
}

function staleSourceRefIds(profile: RoleMarketProfile, generatedAt: string, staleAfterHours: number): string[] {
  return profile.sourceRefs
    .filter((sourceRef) => isFreshnessSensitiveSource(sourceRef))
    .filter((sourceRef) => {
      const ageHours = sourceAgeHours(sourceRef, generatedAt);
      return ageHours !== null && ageHours > staleAfterHours;
    })
    .map((sourceRef) => sourceRef.id);
}

function maxSourceFreshnessHours(
  profile: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
  generatedAt: string,
): number {
  const ages = profile.sourceRefs
    .map((sourceRef) => sourceAgeHours(sourceRef, generatedAt))
    .filter((ageHours): ageHours is number => ageHours !== null);
  return Math.max(aggregate.freshnessHours, ...ages, 0);
}

function addContractFindings(
  findings: MarketProfileValidationFinding[],
  input: ValidateMarketProfileDraftInput,
): void {
  const result = validateRoleMarketProfile(input.profile, 'profile');
  if (result.valid) return;

  result.errors.slice(0, 12).forEach((error, index) => {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: `invalid_contract_${index}`,
      severity: 'blocker',
      code: 'invalid_contract',
      message: error,
      path: error.split(' ')[0] || 'profile',
    }));
  });
}

function addCopySafetyFindings(
  findings: MarketProfileValidationFinding[],
  input: ValidateMarketProfileDraftInput,
): void {
  const result = evaluateRoleMarketCopySafety(collectRoleMarketProfileCopyBlocks(input.profile));
  result.findings.slice(0, 12).forEach((copyFinding, index) => {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: `unsafe_copy_${index}`,
      severity: 'blocker',
      code: 'unsafe_copy',
      message: copyFinding.message,
      path: copyFinding.source,
    }));
  });
}

function addSourceIntegrityFindings(
  findings: MarketProfileValidationFinding[],
  input: ValidateMarketProfileDraftInput,
): number {
  const declaredSourceRefIds = new Set(sourceRefIds(input.profile.sourceRefs));
  let missingSourceRefCount = 0;

  if (declaredSourceRefIds.size === 0) {
    missingSourceRefCount += 1;
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: 'missing_profile_sources',
      severity: 'blocker',
      code: 'missing_source_reference',
      message: 'Draft profile must include at least one source reference before publishing.',
      path: 'profile.sourceRefs',
    }));
  }

  input.profile.requirements.forEach((requirement, index) => {
    if (requirement.sourceRefs.length === 0) {
      missingSourceRefCount += 1;
      findings.push(finding({
        profileVersionId: input.profileVersionId,
        suffix: `missing_requirement_sources_${index}`,
        severity: 'blocker',
        code: 'missing_source_reference',
        message: `Requirement "${requirement.label}" has no source reference.`,
        path: `profile.requirements[${index}].sourceRefs`,
      }));
      return;
    }

    const unknownSourceRefIds = requirement.sourceRefs.filter((sourceRefId) => !declaredSourceRefIds.has(sourceRefId));
    if (unknownSourceRefIds.length > 0) {
      missingSourceRefCount += unknownSourceRefIds.length;
      findings.push(finding({
        profileVersionId: input.profileVersionId,
        suffix: `unknown_requirement_sources_${index}`,
        severity: 'blocker',
        code: 'missing_source_reference',
        message: `Requirement "${requirement.label}" references source IDs that are not present in profile.sourceRefs.`,
        path: `profile.requirements[${index}].sourceRefs`,
        sourceRefIds: unknownSourceRefIds,
      }));
    }
  });

  input.profile.trendSignals.forEach((trendSignal, index) => {
    if (trendSignal.sourceRefs.length === 0) {
      missingSourceRefCount += 1;
      findings.push(finding({
        profileVersionId: input.profileVersionId,
        suffix: `missing_trend_sources_${index}`,
        severity: 'blocker',
        code: 'missing_source_reference',
        message: `Trend signal "${trendSignal.label}" has no source reference.`,
        path: `profile.trendSignals[${index}].sourceRefs`,
      }));
      return;
    }

    const unknownSourceRefIds = trendSignal.sourceRefs.filter((sourceRefId) => !declaredSourceRefIds.has(sourceRefId));
    if (unknownSourceRefIds.length > 0) {
      missingSourceRefCount += unknownSourceRefIds.length;
      findings.push(finding({
        profileVersionId: input.profileVersionId,
        suffix: `unknown_trend_sources_${index}`,
        severity: 'blocker',
        code: 'missing_source_reference',
        message: `Trend signal "${trendSignal.label}" references source IDs that are not present in profile.sourceRefs.`,
        path: `profile.trendSignals[${index}].sourceRefs`,
        sourceRefIds: unknownSourceRefIds,
      }));
    }
  });

  const referencedButMissing = referencedSourceRefIds(input.profile)
    .filter((sourceRefId) => !declaredSourceRefIds.has(sourceRefId));
  if (referencedButMissing.length > 0) {
    missingSourceRefCount += referencedButMissing.length;
  }

  return missingSourceRefCount;
}

function addAggregateQualityFindings(
  findings: MarketProfileValidationFinding[],
  input: ValidateMarketProfileDraftInput,
  policy: MarketProfileDraftValidationPolicy,
): void {
  const aggregateSourceRefIds = sourceRefIds(input.aggregate.sourceRefs);
  if (input.aggregate.sampleSize < policy.minimumSampleSize) {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: 'sample_size',
      severity: 'blocker',
      code: 'sample_too_small',
      message:
        `Aggregate has ${input.aggregate.sampleSize} sample(s), below the publish threshold of ${policy.minimumSampleSize}.`,
      path: 'aggregate.sampleSize',
      sourceRefIds: aggregateSourceRefIds,
    }));
  }

  if (input.aggregate.sourceCount < policy.minimumSourceCount) {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: 'source_diversity',
      severity: 'blocker',
      code: 'low_confidence',
      message:
        `Aggregate has ${input.aggregate.sourceCount} source(s), below the publish threshold of ${policy.minimumSourceCount}.`,
      path: 'aggregate.sourceCount',
      sourceRefIds: aggregateSourceRefIds,
    }));
  }

  const lowestConfidence = Math.min(input.aggregate.confidence, input.profile.confidence);
  if (lowestConfidence < policy.minimumConfidence) {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: 'low_confidence',
      severity: policy.lowConfidenceBlocksPublish ? 'blocker' : 'warning',
      code: 'low_confidence',
      message:
        `Draft confidence is ${Math.round(lowestConfidence * 100)}%, below the configured threshold of ${Math.round(policy.minimumConfidence * 100)}%.`,
      path: lowestConfidence === input.aggregate.confidence ? 'aggregate.confidence' : 'profile.confidence',
      sourceRefIds: aggregateSourceRefIds,
    }));
  }

  if (input.aggregate.freshnessHours > policy.staleAfterHours) {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: 'aggregate_freshness',
      severity: 'blocker',
      code: 'stale_source',
      message:
        `Aggregate freshness is ${Math.round(input.aggregate.freshnessHours)} hour(s), above the publish threshold of ${policy.staleAfterHours}.`,
      path: 'aggregate.freshnessHours',
      sourceRefIds: aggregateSourceRefIds,
    }));
  }
}

export function validateMarketProfileDraft(input: ValidateMarketProfileDraftInput): MarketProfileValidationResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceMode = input.sourceMode ?? input.profile.meta.sourceMode ?? 'hybrid';
  const policy = {
    ...defaultPolicy(),
    ...input.policy,
  };
  const findings: MarketProfileValidationFinding[] = [];

  addContractFindings(findings, input);
  addCopySafetyFindings(findings, input);
  const missingSourceRefCount = addSourceIntegrityFindings(findings, input);
  addAggregateQualityFindings(findings, input, policy);

  const staleProfileSourceRefIds = staleSourceRefIds(input.profile, generatedAt, policy.staleAfterHours);
  if (staleProfileSourceRefIds.length > 0) {
    findings.push(finding({
      profileVersionId: input.profileVersionId,
      suffix: 'profile_source_freshness',
      severity: 'blocker',
      code: 'stale_source',
      message:
        `${staleProfileSourceRefIds.length} profile source reference(s) are older than the publish threshold of ${policy.staleAfterHours} hour(s).`,
      path: 'profile.sourceRefs',
      sourceRefIds: staleProfileSourceRefIds,
    }));
  }

  const hasBlocker = findings.some((item) => item.severity === 'blocker');
  const result: MarketProfileValidationResult = {
    profileVersionId: input.profileVersionId,
    status: hasBlocker ? 'blocked' : findings.length > 0 ? 'passed_with_warnings' : 'passed',
    canPublish: !hasBlocker,
    checkedAt: generatedAt,
    findings,
    sourceIntegrity: {
      sourceRefCount: input.profile.sourceRefs.length,
      missingSourceRefCount,
      staleSourceRefCount:
        staleProfileSourceRefIds.length +
        (input.aggregate.freshnessHours > policy.staleAfterHours ? input.aggregate.sourceRefs.length : 0),
    },
    freshnessHours: maxSourceFreshnessHours(input.profile, input.aggregate, generatedAt),
    confidence: Math.min(input.aggregate.confidence, input.profile.confidence),
    meta: buildMeta(generatedAt, sourceMode),
  };

  assertValidMarketProfileValidationResult(result);
  return result;
}
