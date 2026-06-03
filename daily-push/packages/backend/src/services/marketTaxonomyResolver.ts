import {
  roleMarketProfileFixtures,
  type NormalizedMarketSignal,
  type RoleTaxonomyRecord,
  type SkillTaxonomyRecord,
} from '@daily-push/shared';
import {
  buildRoleTaxonomyRecordFromProfile,
  buildSkillTaxonomyRecordsFromProfiles,
  normalizeTaxonomyLabel,
  resolveRoleTaxonomyByTitle,
  resolveSkillTaxonomyByLabel,
  type TaxonomyResolution,
} from './liveMarketTaxonomyStore';

export type TaxonomyMatchStatus = 'resolved' | 'candidate' | 'unresolved';

export interface TaxonomyCandidate {
  id: string;
  label: string;
  confidence: number;
  matchedAliases: string[];
}

export interface TaxonomyResolverMetadataItem {
  status: TaxonomyMatchStatus;
  observedLabel: string;
  canonicalId: string | null;
  matchedAlias: string | null;
  normalizedAlias: string | null;
  confidence: number;
  candidates: TaxonomyCandidate[];
  variantsTried: string[];
}

export interface TaxonomyResolverMetadata {
  role: TaxonomyResolverMetadataItem | null;
  skill: TaxonomyResolverMetadataItem | null;
}

export interface TaxonomyResolverDependencies {
  resolveRoleAlias?: (
    title: string,
  ) => Promise<TaxonomyResolution<RoleTaxonomyRecord> | null>;
  resolveSkillAlias?: (
    label: string,
  ) => Promise<TaxonomyResolution<SkillTaxonomyRecord> | null>;
  roleRecords?: RoleTaxonomyRecord[];
  skillRecords?: SkillTaxonomyRecord[];
}

export interface TaxonomyResolutionResult<TRecord> {
  status: TaxonomyMatchStatus;
  record: TRecord | null;
  canonicalId: string | null;
  matchedAlias: string | null;
  normalizedAlias: string | null;
  confidence: number;
  candidates: TaxonomyCandidate[];
  variantsTried: string[];
}

const ROLE_CANDIDATE_THRESHOLD = 0.5;
const SKILL_CANDIDATE_THRESHOLD = 0.58;

const STOP_TOKENS = new Set([
  'and',
  'for',
  'the',
  'with',
  'to',
  'of',
  'in',
  'a',
  'an',
  'job',
  'role',
  'position',
  'opening',
  'hiring',
]);

const SENIORITY_TOKENS = [
  'senior',
  'sr',
  'jr',
  'junior',
  'mid',
  'lead',
  'staff',
  'principal',
  'manager',
  'architect',
  'associate',
  'entry level',
  'entry-level',
];

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

function roleRecordsFromSeeds(): RoleTaxonomyRecord[] {
  return roleMarketProfileFixtures.map(buildRoleTaxonomyRecordFromProfile);
}

function defaultRoleRecords(
  dependencies: TaxonomyResolverDependencies,
): RoleTaxonomyRecord[] {
  return dependencies.roleRecords ?? roleRecordsFromSeeds();
}

function defaultSkillRecords(
  dependencies: TaxonomyResolverDependencies,
): SkillTaxonomyRecord[] {
  return dependencies.skillRecords ?? buildSkillTaxonomyRecordsFromProfiles();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWholeWord(value: string, search: string, replacement: string): string {
  return value.replace(new RegExp(`\\b${escapeRegex(search)}\\b`, 'gi'), replacement);
}

function stripSeniority(value: string): string {
  let result = value;
  for (const token of SENIORITY_TOKENS) {
    result = replaceWholeWord(result, token, ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function normalizePunctuation(value: string): string {
  return value
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\\/]+/g, ' ')
    .replace(/fullstack/gi, 'full stack')
    .replace(/full-stack/gi, 'full stack')
    .replace(/\s+/g, ' ')
    .trim();
}

export function roleTitleVariants(title: string): string[] {
  const normalized = normalizePunctuation(title);
  const stripped = stripSeniority(normalized);
  const developerToEngineer = replaceWholeWord(normalized, 'developer', 'engineer');
  const strippedDeveloperToEngineer = replaceWholeWord(stripped, 'developer', 'engineer');

  return uniqueStrings([
    title,
    normalized,
    stripped,
    developerToEngineer,
    strippedDeveloperToEngineer,
    normalized.replace(/\bsoftware engineer\b/gi, 'engineer'),
    stripped.replace(/\bsoftware engineer\b/gi, 'engineer'),
  ]);
}

export function skillLabelVariants(label: string): string[] {
  const normalized = normalizePunctuation(label);
  const compact = normalized.replace(/\s+/g, '');
  const variants = [
    label,
    normalized,
    compact,
    normalized.replace(/node\s*\.?\s*js/gi, 'node.js'),
    normalized.replace(/\bnodejs\b/gi, 'node.js'),
    normalized.replace(/\bk8s\b/gi, 'kubernetes'),
    normalized.replace(/\bpostgres\b/gi, 'postgresql'),
    normalized.replace(/\bcicd\b/gi, 'ci/cd'),
    normalized.replace(/\bgenai\b/gi, 'generative ai'),
    normalized.replace(/\bllms\b/gi, 'llm'),
    normalized.replace(/\blarge language models\b/gi, 'large language model'),
  ];

  return uniqueStrings(variants);
}

function tokenize(value: string): Set<string> {
  const normalized = normalizeTaxonomyLabel(value)
    .replace(/\bnode js\b/g, 'nodejs')
    .replace(/\bnode\.js\b/g, 'nodejs')
    .replace(/\bci cd\b/g, 'cicd')
    .replace(/\bc i c d\b/g, 'cicd')
    .replace(/\bfull stack\b/g, 'fullstack')
    .replace(/\bsite reliability\b/g, 'sre')
    .replace(/\blarge language model\b/g, 'llm');

  return new Set(
    normalized
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOP_TOKENS.has(token)),
  );
}

function scoreAgainstAlias(input: string, alias: string): number {
  const inputNormalized = normalizeTaxonomyLabel(input);
  const aliasNormalized = normalizeTaxonomyLabel(alias);
  if (!inputNormalized || !aliasNormalized) return 0;
  if (inputNormalized === aliasNormalized) return 1;
  if (inputNormalized.includes(aliasNormalized) || aliasNormalized.includes(inputNormalized)) {
    return 0.82;
  }

  const inputTokens = tokenize(inputNormalized);
  const aliasTokens = tokenize(aliasNormalized);
  if (inputTokens.size === 0 || aliasTokens.size === 0) return 0;

  const overlap = Array.from(inputTokens).filter((token) => aliasTokens.has(token)).length;
  const denominator = Math.max(inputTokens.size, aliasTokens.size);
  const coverage = overlap / denominator;
  const precision = overlap / inputTokens.size;
  return Number(((coverage * 0.7) + (precision * 0.3)).toFixed(2));
}

function topCandidates<TRecord extends { id: string }>(
  input: string,
  records: TRecord[],
  labelFor: (record: TRecord) => string,
  aliasesFor: (record: TRecord) => string[],
  threshold: number,
): TaxonomyCandidate[] {
  return records
    .map((record) => {
      const aliases = aliasesFor(record);
      const scoredAliases = aliases
        .map((alias) => ({ alias, score: scoreAgainstAlias(input, alias) }))
        .filter((item) => item.score >= threshold)
        .sort((a, b) => b.score - a.score);
      const score = scoredAliases[0]?.score ?? 0;
      return {
        id: record.id,
        label: labelFor(record),
        confidence: score,
        matchedAliases: scoredAliases.slice(0, 3).map((item) => item.alias),
      };
    })
    .filter((candidate) => candidate.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label))
    .slice(0, 5);
}

async function tryAliasResolution<TRecord>(
  variants: string[],
  resolver: (label: string) => Promise<TaxonomyResolution<TRecord> | null>,
): Promise<TaxonomyResolution<TRecord> | null> {
  for (const variant of variants) {
    const resolved = await resolver(variant);
    if (resolved) return resolved;
  }
  return null;
}

export async function resolveRoleTitleToTaxonomy(
  title: string,
  dependencies: TaxonomyResolverDependencies = {},
): Promise<TaxonomyResolutionResult<RoleTaxonomyRecord>> {
  const variants = roleTitleVariants(title);
  const resolver = dependencies.resolveRoleAlias ?? resolveRoleTaxonomyByTitle;
  const exact = await tryAliasResolution(variants, resolver);
  if (exact) {
    return {
      status: 'resolved',
      record: exact.record,
      canonicalId: exact.record.id,
      matchedAlias: exact.matchedAlias,
      normalizedAlias: exact.normalizedAlias,
      confidence: exact.confidence,
      candidates: [],
      variantsTried: variants,
    };
  }

  const candidates = topCandidates(
    title,
    defaultRoleRecords(dependencies),
    (record) => record.title,
    (record) => [record.title, record.slug, ...record.aliases],
    ROLE_CANDIDATE_THRESHOLD,
  );

  return {
    status: candidates.length > 0 ? 'candidate' : 'unresolved',
    record: null,
    canonicalId: null,
    matchedAlias: null,
    normalizedAlias: null,
    confidence: candidates[0]?.confidence ?? 0,
    candidates,
    variantsTried: variants,
  };
}

export async function resolveSkillLabelToTaxonomy(
  label: string,
  dependencies: TaxonomyResolverDependencies = {},
): Promise<TaxonomyResolutionResult<SkillTaxonomyRecord>> {
  const variants = skillLabelVariants(label);
  const resolver = dependencies.resolveSkillAlias ?? resolveSkillTaxonomyByLabel;
  const exact = await tryAliasResolution(variants, resolver);
  if (exact) {
    return {
      status: 'resolved',
      record: exact.record,
      canonicalId: exact.record.id,
      matchedAlias: exact.matchedAlias,
      normalizedAlias: exact.normalizedAlias,
      confidence: exact.confidence,
      candidates: [],
      variantsTried: variants,
    };
  }

  const candidates = topCandidates(
    label,
    defaultSkillRecords(dependencies),
    (record) => record.canonicalLabel,
    (record) => [record.canonicalLabel, record.slug, ...record.aliases],
    SKILL_CANDIDATE_THRESHOLD,
  );

  return {
    status: candidates.length > 0 ? 'candidate' : 'unresolved',
    record: null,
    canonicalId: null,
    matchedAlias: null,
    normalizedAlias: null,
    confidence: candidates[0]?.confidence ?? 0,
    candidates,
    variantsTried: variants,
  };
}

function metadataFromResult<TRecord>(
  observedLabel: string,
  result: TaxonomyResolutionResult<TRecord>,
): TaxonomyResolverMetadataItem {
  return {
    status: result.status,
    observedLabel,
    canonicalId: result.canonicalId,
    matchedAlias: result.matchedAlias,
    normalizedAlias: result.normalizedAlias,
    confidence: result.confidence,
    candidates: result.candidates,
    variantsTried: result.variantsTried,
  };
}

function preassignedMetadata(
  observedLabel: string,
  canonicalId: string,
  variantsTried: string[],
): TaxonomyResolverMetadataItem {
  return {
    status: 'resolved',
    observedLabel,
    canonicalId,
    matchedAlias: null,
    normalizedAlias: null,
    confidence: 1,
    candidates: [],
    variantsTried,
  };
}

export async function resolveNormalizedMarketSignalTaxonomy(
  signal: NormalizedMarketSignal,
  dependencies: TaxonomyResolverDependencies = {},
): Promise<{
  signal: NormalizedMarketSignal;
  metadata: TaxonomyResolverMetadata;
}> {
  let resolvedSignal = signal;
  let roleMetadata: TaxonomyResolverMetadataItem | null = null;
  let skillMetadata: TaxonomyResolverMetadataItem | null = null;

  if (signal.canonicalRoleId) {
    roleMetadata = preassignedMetadata(
      signal.observedRoleTitle,
      signal.canonicalRoleId,
      roleTitleVariants(signal.observedRoleTitle),
    );
  } else if (signal.observedRoleTitle.trim()) {
    const roleResult = await resolveRoleTitleToTaxonomy(signal.observedRoleTitle, dependencies);
    roleMetadata = metadataFromResult(signal.observedRoleTitle, roleResult);
    if (roleResult.status === 'resolved' && roleResult.canonicalId) {
      resolvedSignal = {
        ...resolvedSignal,
        canonicalRoleId: roleResult.canonicalId,
      };
    }
  }

  if (signal.signalType === 'skill' || signal.signalType === 'tool' || signal.signalType === 'domain') {
    const skillResult = await resolveSkillLabelToTaxonomy(signal.normalizedLabel, dependencies);
    skillMetadata = metadataFromResult(signal.normalizedLabel, skillResult);
    if (skillResult.status === 'resolved' && skillResult.canonicalId) {
      resolvedSignal = {
        ...resolvedSignal,
        canonicalSkillId: skillResult.canonicalId,
      };
    }
  }

  return {
    signal: resolvedSignal,
    metadata: {
      role: roleMetadata,
      skill: skillMetadata,
    },
  };
}
