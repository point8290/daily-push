import { createHash } from 'crypto';
import {
  assertValidRoleMarketProfile,
  assertValidRoleMarketProfileVersion,
  roleMarketProfileFixtures,
  type ContractMeta,
  type RequirementCategory,
  type RequirementPriority,
  type RoleMarketProfile,
  type RoleMarketProfileVersion,
  type RoleMarketSignalAggregate,
  type RoleRequirement,
  type RoleTrendSignal,
  type SourceMode,
  type SourceReference,
} from '@daily-push/shared';
import { config } from '../config';
import {
  getLatestRoleMarketProfileVersionForRole,
  getPublishedRoleMarketProfileVersion,
  upsertRoleMarketProfileVersion,
} from './liveMarketProfileVersionStore';
import { getLatestRoleMarketSignalAggregate } from './liveMarketSignalStore';
import { normalizeTaxonomyLabel } from './liveMarketTaxonomyStore';
import { validateMarketProfileDraft } from './marketProfileDraftValidation';
import { computeMarketProfileDiff } from './marketProfileDiff';

type JsonObject = Record<string, unknown>;

export interface MarketProfileDraftSynthesisInput {
  roleProfileId: string;
  aggregate?: RoleMarketSignalAggregate | null;
  baselineProfile?: RoleMarketProfile | null;
  previousProfileVersion?: RoleMarketProfileVersion | null;
  createdBy?: string;
  sourceMode?: SourceMode;
  now?: () => string;
}

export interface SynthesizeAndPersistMarketProfileDraftInput
  extends MarketProfileDraftSynthesisInput {
  upsertDraft?: (draft: RoleMarketProfileVersion, metadata?: JsonObject) => Promise<RoleMarketProfileVersion>;
}

export class MarketProfileDraftSynthesisError extends Error {
  statusCode = 422;

  code = 'market_profile_draft_synthesis_error';
}

const MAX_SYNTHESIZED_REQUIREMENTS = 4;
const MAX_SYNTHESIZED_TRENDS = 2;

function cloneProfile(profile: RoleMarketProfile): RoleMarketProfile {
  return JSON.parse(JSON.stringify(profile)) as RoleMarketProfile;
}

function findBaselineProfile(roleProfileId: string): RoleMarketProfile | null {
  return roleMarketProfileFixtures.find((profile) => profile.id === roleProfileId) ?? null;
}

function slugPart(value: string): string {
  return normalizeTaxonomyLabel(value)
    .replace(/[+#.]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeTaxonomyLabel(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return result;
}

function uniqueSourceRefs(sourceRefs: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  const result: SourceReference[] = [];
  for (const sourceRef of sourceRefs) {
    if (!sourceRef.id || seen.has(sourceRef.id)) continue;
    seen.add(sourceRef.id);
    result.push(sourceRef);
  }
  return result;
}

function collectReferencedSourceIds(profile: RoleMarketProfile): string[] {
  return uniqueStrings([
    ...profile.requirements.flatMap((requirement) => requirement.sourceRefs),
    ...profile.trendSignals.flatMap((trendSignal) => trendSignal.sourceRefs),
    ...profile.sourceRefs.map((sourceRef) => sourceRef.id),
  ]);
}

function fallbackSourceRef(sourceRefId: string, capturedAt: string): SourceReference {
  return {
    id: sourceRefId,
    title: `Curated baseline source ${sourceRefId}`,
    url: null,
    publisher: null,
    sourceType: 'industry_report',
    region: null,
    publishedAt: null,
    capturedAt,
    confidence: 0.6,
  };
}

function closeProfileSourceRefs(
  profile: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
  capturedAt: string,
): SourceReference[] {
  const known = new Map<string, SourceReference>();
  for (const sourceRef of [...profile.sourceRefs, ...aggregate.sourceRefs]) {
    known.set(sourceRef.id, sourceRef);
  }
  return collectReferencedSourceIds(profile)
    .map((sourceRefId) => known.get(sourceRefId) ?? fallbackSourceRef(sourceRefId, capturedAt))
    .concat(aggregate.sourceRefs)
    .filter((sourceRef, index, sourceRefs) =>
      sourceRefs.findIndex((candidate) => candidate.id === sourceRef.id) === index,
    );
}

function sourceRefIdsForAggregate(
  aggregate: RoleMarketSignalAggregate,
  sourceRefIds: string[],
): string[] {
  const available = new Set(aggregate.sourceRefs.map((sourceRef) => sourceRef.id));
  const ids = sourceRefIds.filter((sourceRefId) => available.has(sourceRefId));
  return ids.length > 0 ? ids : aggregate.sourceRefs.slice(0, 3).map((sourceRef) => sourceRef.id);
}

function priorityToExpectedLevel(priority: RequirementPriority): RoleRequirement['expectedLevel'] {
  if (priority === 'must_have') return 'proficient';
  if (priority === 'important') return 'working';
  return 'aware';
}

function requirementFromAggregate(
  aggregate: RoleMarketSignalAggregate,
  requirement: RoleMarketSignalAggregate['requirements'][number],
): RoleRequirement {
  const label = requirement.label.length > 120
    ? `${requirement.label.slice(0, 117)}...`
    : requirement.label;

  return {
    id: `req_live_${aggregate.roleProfileId}_${slugPart(label)}`,
    category: requirement.category,
    label,
    description:
      `Recent source-backed job-post signals mention ${label}. Keep this as an operator-reviewed draft requirement before publishing.`,
    priority: requirement.priority,
    expectedLevel: priorityToExpectedLevel(requirement.priority),
    keywords: uniqueStrings(requirement.keywords).slice(0, 12),
    proofExpected: [
      `A concrete project, case study, or work story showing ${label}.`,
    ],
    interviewSignals: [
      `Can explain specific decisions, trade-offs, and measurable evidence related to ${label}.`,
    ],
    sourceRefs: sourceRefIdsForAggregate(aggregate, requirement.sourceRefIds),
    confidence: Math.min(0.86, Math.max(0.45, requirement.confidence)),
  };
}

function mergeRequirements(
  baseline: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
): RoleRequirement[] {
  const existing = new Set(
    baseline.requirements.flatMap((requirement) => [
      normalizeTaxonomyLabel(requirement.label),
      ...requirement.keywords.map(normalizeTaxonomyLabel),
    ]),
  );
  const additions = aggregate.requirements
    .filter((requirement) => !existing.has(normalizeTaxonomyLabel(requirement.label)))
    .sort((a, b) => b.mentionCount - a.mentionCount || b.confidence - a.confidence)
    .slice(0, MAX_SYNTHESIZED_REQUIREMENTS)
    .map((requirement) => requirementFromAggregate(aggregate, requirement));

  return [...baseline.requirements, ...additions];
}

function trendSignalsFromAggregate(
  baseline: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
): RoleTrendSignal[] {
  const topSkills = aggregate.topSkills.slice(0, 5).map((skill) => skill.label);
  const requirementLabels = aggregate.requirements.slice(0, 3).map((requirement) => requirement.label);
  const sourceRefIds = aggregate.sourceRefs.slice(0, 5).map((sourceRef) => sourceRef.id);
  const trend: RoleTrendSignal = {
    id: `trend_live_${aggregate.roleProfileId}_${aggregate.id.slice(-10)}`,
    label: 'Recent job-post signals emphasize source-backed execution depth',
    summary:
      `Recent aggregate signals for ${aggregate.roleTitle} emphasize ${uniqueStrings([...topSkills, ...requirementLabels]).slice(0, 5).join(', ') || 'role-specific execution evidence'}. This is a draft signal for operator review, not a hiring prediction.`,
    direction: aggregate.demand.direction,
    impact: baseline.aiImpact,
    affectedSkills: topSkills,
    sourceRefs: sourceRefIds,
    confidence: Math.min(0.82, Math.max(0.45, aggregate.confidence)),
  };

  const existingTrendLabels = new Set(baseline.trendSignals.map((item) => normalizeTaxonomyLabel(item.label)));
  const additions = existingTrendLabels.has(normalizeTaxonomyLabel(trend.label)) ? [] : [trend];
  return [...baseline.trendSignals, ...additions].slice(0, baseline.trendSignals.length + MAX_SYNTHESIZED_TRENDS);
}

function proofExpectationsFromAggregate(
  baseline: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
): string[] {
  const requirementProof = aggregate.requirements
    .slice(0, 4)
    .map((requirement) => `Proof of ${requirement.label}`);
  const skillProof = aggregate.topSkills
    .slice(0, 4)
    .map((skill) => `${skill.label} evidence`);
  return uniqueStrings([...baseline.proofExpectations, ...requirementProof, ...skillProof]).slice(0, 16);
}

function interviewTopicsFromAggregate(
  baseline: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
): string[] {
  const requirementTopics = aggregate.requirements.slice(0, 5).map((requirement) => requirement.label);
  const skillTopics = aggregate.topSkills.slice(0, 5).map((skill) => skill.label);
  return uniqueStrings([...baseline.interviewTopics, ...requirementTopics, ...skillTopics]).slice(0, 18);
}

function marketSummaryFromAggregate(
  baseline: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
): string {
  const topSkills = aggregate.topSkills.slice(0, 4).map((skill) => skill.label).join(', ');
  const topRequirements = aggregate.requirements.slice(0, 3).map((requirement) => requirement.label).join('; ');
  const freshness = aggregate.freshnessHours < 24
    ? 'within the last day'
    : `${Math.round(aggregate.freshnessHours / 24)} day(s) ago`;
  return [
    `Draft hybrid market profile: recent source-backed signals for ${aggregate.roleTitle} show demand score ${aggregate.demand.score}/100 across ${aggregate.sampleSize} job-post sample(s) from ${aggregate.sourceCount} source(s).`,
    topSkills ? `Frequently observed skills/tools include ${topSkills}.` : '',
    topRequirements ? `Frequently observed requirement language includes ${topRequirements}.` : '',
    `The newest signal was observed ${freshness}; confidence is ${Math.round(aggregate.confidence * 100)}%.`,
    `This draft keeps the curated baseline and adds aggregate-backed emphasis for operator review.`,
    baseline.marketSummary ? `Baseline context: ${baseline.marketSummary}` : '',
  ].filter(Boolean).join(' ');
}

function buildProfileMeta(
  aggregate: RoleMarketSignalAggregate,
  generatedAt: string,
  sourceMode: SourceMode,
): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt,
    sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: aggregate.meta.warnings,
    sourceSummary: {
      sourceMode,
      sourceCount: aggregate.sourceCount,
      sampleSize: aggregate.sampleSize,
      freshnessHours: aggregate.freshnessHours,
      windowStart: aggregate.windowStart,
      windowEnd: aggregate.windowEnd,
    },
  };
}

function buildProfileVersionMeta(generatedAt: string, sourceMode: SourceMode): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt,
    sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function buildDraftId(roleProfileId: string, aggregateId: string, version: number): string {
  const hash = createHash('sha1')
    .update([roleProfileId, aggregateId, version].join('|'))
    .digest('hex')
    .slice(0, 18);
  return `market_profile_version_${hash}`;
}

function buildChangeSummary(
  baseline: RoleMarketProfile,
  aggregate: RoleMarketSignalAggregate,
  addedRequirementCount: number,
): string {
  const skills = aggregate.topSkills.slice(0, 4).map((skill) => skill.label).join(', ') || 'role-specific skills';
  return [
    `Draft synthesized from aggregate ${aggregate.id}.`,
    `Keeps curated baseline ${baseline.title} and adds ${addedRequirementCount} aggregate-backed requirement(s).`,
    `Highlights recent signals around ${skills}.`,
    `Sample size ${aggregate.sampleSize}, sources ${aggregate.sourceCount}, confidence ${Math.round(aggregate.confidence * 100)}%.`,
  ].join(' ');
}

function synthesizeProfile(input: {
  baseline: RoleMarketProfile;
  aggregate: RoleMarketSignalAggregate;
  generatedAt: string;
  sourceMode: SourceMode;
}): RoleMarketProfile {
  const baseline = cloneProfile(input.baseline);
  const sourceRefs = closeProfileSourceRefs(baseline, input.aggregate, input.generatedAt);
  const profile: RoleMarketProfile = {
    ...baseline,
    marketSummary: marketSummaryFromAggregate(baseline, input.aggregate),
    requirements: mergeRequirements(baseline, input.aggregate),
    trendSignals: trendSignalsFromAggregate(baseline, input.aggregate),
    proofExpectations: proofExpectationsFromAggregate(baseline, input.aggregate),
    interviewTopics: interviewTopicsFromAggregate(baseline, input.aggregate),
    sourceRefs,
    lastUpdated: input.generatedAt,
    confidence: Math.min(0.92, Math.max(baseline.confidence, input.aggregate.confidence)),
    meta: buildProfileMeta(input.aggregate, input.generatedAt, input.sourceMode),
  };
  assertValidRoleMarketProfile(profile);
  return profile;
}

export async function synthesizeMarketProfileDraft(
  input: MarketProfileDraftSynthesisInput,
): Promise<RoleMarketProfileVersion> {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  const baseline = input.baselineProfile ?? findBaselineProfile(input.roleProfileId);
  if (!baseline) {
    throw new MarketProfileDraftSynthesisError(`No curated baseline profile found for ${input.roleProfileId}.`);
  }

  const aggregate = input.aggregate ?? await getLatestRoleMarketSignalAggregate(input.roleProfileId);
  if (!aggregate) {
    throw new MarketProfileDraftSynthesisError(`No aggregate found for ${input.roleProfileId}.`);
  }
  if (aggregate.roleProfileId !== baseline.id) {
    throw new MarketProfileDraftSynthesisError('Aggregate roleProfileId must match the baseline profile.');
  }

  const previousProfileVersion = Object.prototype.hasOwnProperty.call(input, 'previousProfileVersion')
    ? input.previousProfileVersion ?? null
    : await getPublishedRoleMarketProfileVersion(input.roleProfileId) ??
      await getLatestRoleMarketProfileVersionForRole(input.roleProfileId);
  const version = previousProfileVersion ? previousProfileVersion.version + 1 : 1;
  const sourceMode = input.sourceMode ?? 'hybrid';
  const profile = synthesizeProfile({
    baseline,
    aggregate,
    generatedAt,
    sourceMode,
  });
  const addedRequirementCount = Math.max(0, profile.requirements.length - baseline.requirements.length);
  const id = buildDraftId(input.roleProfileId, aggregate.id, version);
  const profileDiff = computeMarketProfileDiff({
    profileVersionId: id,
    roleProfileId: baseline.id,
    previousProfileVersionId: previousProfileVersion?.id ?? null,
    beforeProfile: previousProfileVersion?.profile ?? baseline,
    afterProfile: profile,
    generatedAt,
    sourceMode,
  });
  const draft: RoleMarketProfileVersion = {
    id,
    roleProfileId: baseline.id,
    version,
    status: 'draft',
    sourceMode,
    profile,
    aggregateId: aggregate.id,
    previousVersionId: previousProfileVersion?.id ?? null,
    sourceRefs: profile.sourceRefs,
    changeSummary: buildChangeSummary(baseline, aggregate, addedRequirementCount),
    profileDiff,
    validationResult: validateMarketProfileDraft({
      profileVersionId: id,
      profile,
      aggregate,
      generatedAt,
      sourceMode,
    }),
    createdBy: input.createdBy ?? 'market-profile-draft-synthesis',
    createdAt: generatedAt,
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: null,
    rollbackOfVersionId: null,
    meta: buildProfileVersionMeta(generatedAt, sourceMode),
  };
  assertValidRoleMarketProfileVersion(draft);
  return draft;
}

export async function synthesizeAndPersistMarketProfileDraft(
  input: SynthesizeAndPersistMarketProfileDraftInput,
): Promise<RoleMarketProfileVersion> {
  const draft = await synthesizeMarketProfileDraft(input);
  const upsertDraft = input.upsertDraft ?? upsertRoleMarketProfileVersion;
  return upsertDraft(draft, {
    synthesizedFrom: 'role_market_signal_aggregate',
    aggregateId: draft.aggregateId,
  });
}
