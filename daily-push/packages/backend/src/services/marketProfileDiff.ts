import {
  assertValidMarketProfileDiff,
  type ContractMeta,
  type MarketProfileDiff,
  type MarketProfileRequirementDiffItem,
  type MarketProfileRequirementSnapshot,
  type MarketProfileStringListDiff,
  type RoleMarketProfile,
  type RoleRequirement,
  type SourceMode,
} from '@daily-push/shared';
import { config } from '../config';
import { normalizeTaxonomyLabel } from './liveMarketTaxonomyStore';

export interface ComputeMarketProfileDiffInput {
  profileVersionId: string;
  roleProfileId: string;
  previousProfileVersionId: string | null;
  beforeProfile: RoleMarketProfile;
  afterProfile: RoleMarketProfile;
  generatedAt?: string;
  sourceMode?: SourceMode;
}

type ComparableString = {
  key: string;
  label: string;
};

function normalizedKey(value: string): string {
  return normalizeTaxonomyLabel(value);
}

function uniqueComparableStrings(values: string[]): ComparableString[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const label = value.trim();
    const key = normalizedKey(label);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, label);
  }
  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, label]) => ({ key, label }));
}

function stringSet(values: string[], normalize = true): Set<string> {
  return new Set(
    values
      .map((value) => (normalize ? normalizedKey(value) : value.trim()))
      .filter(Boolean),
  );
}

function sortedUnique(values: string[], normalize = false): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = value.trim();
    const key = normalize ? normalizedKey(label) : label;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result.sort((left, right) => left.localeCompare(right));
}

function formatRequirementKey(requirement: RoleRequirement): string {
  return normalizedKey(requirement.label) || requirement.id;
}

function snapshotRequirement(requirement: RoleRequirement): MarketProfileRequirementSnapshot {
  return {
    requirementId: requirement.id || null,
    label: requirement.label,
    category: requirement.category,
    priority: requirement.priority,
    keywords: sortedUnique(requirement.keywords, true),
    sourceRefIds: sortedUnique(requirement.sourceRefs, false),
    confidence: Number(requirement.confidence.toFixed(3)),
  };
}

function sameSet(left: string[], right: string[], normalize = true): boolean {
  const leftSet = stringSet(left, normalize);
  const rightSet = stringSet(right, normalize);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((item) => rightSet.has(item));
}

function requirementChanged(before: MarketProfileRequirementSnapshot, after: MarketProfileRequirementSnapshot): boolean {
  return before.category !== after.category ||
    before.priority !== after.priority ||
    Math.abs(before.confidence - after.confidence) > 0.001 ||
    !sameSet(before.keywords, after.keywords, true) ||
    !sameSet(before.sourceRefIds, after.sourceRefIds, false);
}

function summarizeRequirementChange(
  before: MarketProfileRequirementSnapshot | null,
  after: MarketProfileRequirementSnapshot | null,
): string {
  if (!before && after) {
    return `Added ${after.priority.replace(/_/g, ' ')} ${after.category} requirement with ${after.sourceRefIds.length} source reference(s).`;
  }
  if (before && !after) {
    return `Removed ${before.priority.replace(/_/g, ' ')} ${before.category} requirement.`;
  }
  if (!before || !after) return 'Requirement changed.';

  const changes: string[] = [];
  if (before.priority !== after.priority) changes.push(`priority ${before.priority} -> ${after.priority}`);
  if (before.category !== after.category) changes.push(`category ${before.category} -> ${after.category}`);
  if (!sameSet(before.keywords, after.keywords, true)) changes.push('keyword coverage changed');
  if (!sameSet(before.sourceRefIds, after.sourceRefIds, false)) changes.push('source references changed');
  if (Math.abs(before.confidence - after.confidence) > 0.001) {
    changes.push(`confidence ${Math.round(before.confidence * 100)}% -> ${Math.round(after.confidence * 100)}%`);
  }
  return changes.length > 0 ? changes.join('; ') : 'No material field change detected.';
}

function diffRequirements(
  beforeProfile: RoleMarketProfile,
  afterProfile: RoleMarketProfile,
): MarketProfileDiff['requirements'] {
  const before = new Map(
    beforeProfile.requirements.map((requirement) => [formatRequirementKey(requirement), snapshotRequirement(requirement)]),
  );
  const after = new Map(
    afterProfile.requirements.map((requirement) => [formatRequirementKey(requirement), snapshotRequirement(requirement)]),
  );

  const added: MarketProfileRequirementDiffItem[] = [];
  const removed: MarketProfileRequirementDiffItem[] = [];
  const changed: MarketProfileRequirementDiffItem[] = [];

  for (const [key, afterSnapshot] of after) {
    const beforeSnapshot = before.get(key);
    if (!beforeSnapshot) {
      added.push({
        label: afterSnapshot.label,
        before: null,
        after: afterSnapshot,
        changeSummary: summarizeRequirementChange(null, afterSnapshot),
      });
      continue;
    }

    if (requirementChanged(beforeSnapshot, afterSnapshot)) {
      changed.push({
        label: afterSnapshot.label,
        before: beforeSnapshot,
        after: afterSnapshot,
        changeSummary: summarizeRequirementChange(beforeSnapshot, afterSnapshot),
      });
    }
  }

  for (const [key, beforeSnapshot] of before) {
    if (after.has(key)) continue;
    removed.push({
      label: beforeSnapshot.label,
      before: beforeSnapshot,
      after: null,
      changeSummary: summarizeRequirementChange(beforeSnapshot, null),
    });
  }

  const byLabel = (left: MarketProfileRequirementDiffItem, right: MarketProfileRequirementDiffItem) =>
    left.label.localeCompare(right.label);

  return {
    added: added.sort(byLabel),
    removed: removed.sort(byLabel),
    changed: changed.sort(byLabel),
  };
}

function diffStringList(beforeValues: string[], afterValues: string[]): MarketProfileStringListDiff {
  const before = uniqueComparableStrings(beforeValues);
  const after = uniqueComparableStrings(afterValues);
  const beforeKeys = new Set(before.map((item) => item.key));
  const afterKeys = new Set(after.map((item) => item.key));

  return {
    added: after.filter((item) => !beforeKeys.has(item.key)).map((item) => item.label),
    removed: before.filter((item) => !afterKeys.has(item.key)).map((item) => item.label),
    unchangedCount: before.filter((item) => afterKeys.has(item.key)).length,
  };
}

function collectTopSkillSignals(profile: RoleMarketProfile): string[] {
  return uniqueComparableStrings(profile.requirements.flatMap((requirement) => requirement.keywords))
    .map((item) => item.label)
    .slice(0, 40);
}

function sourceRefDiff(beforeProfile: RoleMarketProfile, afterProfile: RoleMarketProfile): MarketProfileDiff['sourceRefs'] {
  const before = sortedUnique(beforeProfile.sourceRefs.map((sourceRef) => sourceRef.id), false);
  const after = sortedUnique(afterProfile.sourceRefs.map((sourceRef) => sourceRef.id), false);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    addedSourceRefIds: after.filter((sourceRefId) => !beforeSet.has(sourceRefId)),
    removedSourceRefIds: before.filter((sourceRefId) => !afterSet.has(sourceRefId)),
    unchangedCount: before.filter((sourceRefId) => afterSet.has(sourceRefId)).length,
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

function hasMustHaveRequirementChange(requirements: MarketProfileDiff['requirements']): boolean {
  return [...requirements.added, ...requirements.removed].some((item) =>
    item.before?.priority === 'must_have' || item.after?.priority === 'must_have',
  );
}

function determineMateriality(input: {
  requirements: MarketProfileDiff['requirements'];
  topSkills: MarketProfileStringListDiff;
  proofExpectations: MarketProfileStringListDiff;
  trendSignals: MarketProfileStringListDiff;
  sourceRefs: MarketProfileDiff['sourceRefs'];
  confidenceDelta: number;
}): MarketProfileDiff['materiality'] {
  const requirementChangeCount =
    input.requirements.added.length + input.requirements.removed.length + input.requirements.changed.length;
  const confidenceDeltaAbs = Math.abs(input.confidenceDelta);
  if (hasMustHaveRequirementChange(input.requirements) || confidenceDeltaAbs >= 0.15 || requirementChangeCount >= 3) {
    return 'high';
  }

  const listChanged =
    input.topSkills.added.length > 0 ||
    input.topSkills.removed.length > 0 ||
    input.proofExpectations.added.length > 0 ||
    input.proofExpectations.removed.length > 0 ||
    input.trendSignals.added.length > 0 ||
    input.trendSignals.removed.length > 0 ||
    input.sourceRefs.addedSourceRefIds.length > 0 ||
    input.sourceRefs.removedSourceRefIds.length > 0;
  if (requirementChangeCount > 0 || listChanged || confidenceDeltaAbs >= 0.05) return 'medium';
  return 'low';
}

function summarizeDiff(input: {
  materiality: MarketProfileDiff['materiality'];
  requirements: MarketProfileDiff['requirements'];
  topSkills: MarketProfileStringListDiff;
  sourceRefs: MarketProfileDiff['sourceRefs'];
  confidenceDelta: number;
}): string {
  const requirementChangeCount =
    input.requirements.added.length + input.requirements.removed.length + input.requirements.changed.length;
  const confidencePoints = Math.round(input.confidenceDelta * 100);
  const confidenceDirection = confidencePoints > 0 ? `+${confidencePoints}` : `${confidencePoints}`;
  return [
    `Profile diff: ${input.requirements.added.length} requirement(s) added, ${input.requirements.removed.length} removed, ${input.requirements.changed.length} changed.`,
    `${input.topSkills.added.length} skill signal(s) added and ${input.topSkills.removed.length} removed.`,
    `${input.sourceRefs.addedSourceRefIds.length} source reference(s) added and ${input.sourceRefs.removedSourceRefIds.length} removed.`,
    `Confidence moved ${confidenceDirection} point(s).`,
    `Materiality is ${input.materiality}${requirementChangeCount === 0 ? ' with no requirement-level changes' : ''}.`,
  ].join(' ');
}

export function computeMarketProfileDiff(input: ComputeMarketProfileDiffInput): MarketProfileDiff {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceMode = input.sourceMode ?? input.afterProfile.meta.sourceMode ?? 'hybrid';
  const requirements = diffRequirements(input.beforeProfile, input.afterProfile);
  const topSkills = diffStringList(
    collectTopSkillSignals(input.beforeProfile),
    collectTopSkillSignals(input.afterProfile),
  );
  const proofExpectations = diffStringList(
    input.beforeProfile.proofExpectations,
    input.afterProfile.proofExpectations,
  );
  const trendSignals = diffStringList(
    input.beforeProfile.trendSignals.map((trendSignal) => trendSignal.label),
    input.afterProfile.trendSignals.map((trendSignal) => trendSignal.label),
  );
  const sourceRefs = sourceRefDiff(input.beforeProfile, input.afterProfile);
  const confidenceDelta = Number((input.afterProfile.confidence - input.beforeProfile.confidence).toFixed(3));
  const materiality = determineMateriality({
    requirements,
    topSkills,
    proofExpectations,
    trendSignals,
    sourceRefs,
    confidenceDelta,
  });

  const diff: MarketProfileDiff = {
    profileVersionId: input.profileVersionId,
    roleProfileId: input.roleProfileId,
    previousProfileVersionId: input.previousProfileVersionId,
    generatedAt,
    materiality,
    summary: summarizeDiff({
      materiality,
      requirements,
      topSkills,
      sourceRefs,
      confidenceDelta,
    }),
    requirements,
    topSkills,
    proofExpectations,
    trendSignals,
    sourceRefs,
    confidence: {
      before: Number(input.beforeProfile.confidence.toFixed(3)),
      after: Number(input.afterProfile.confidence.toFixed(3)),
      delta: confidenceDelta,
    },
    meta: buildMeta(generatedAt, sourceMode),
  };

  assertValidMarketProfileDiff(diff);
  return diff;
}
