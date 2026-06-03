import { createHash } from 'crypto';
import {
  assertValidRoleMarketSignalAggregate,
  type AiImpact,
  type ContractMeta,
  type MarketSignalDirection,
  type NormalizedMarketSignal,
  type RemotePolicyValue,
  type RequirementCategory,
  type RequirementPriority,
  type RoleMarketProfile,
  type RoleMarketSignalAggregate,
  type SeniorityBand,
  type SourceMode,
  type SourceReference,
} from '@daily-push/shared';
import { config } from '../config';
import {
  listNormalizedMarketSignalsForRole,
  upsertRoleMarketSignalAggregate,
} from './liveMarketSignalStore';
import { getMarketProfileRegistry } from './marketProfileRegistry';
import { normalizeTaxonomyLabel } from './liveMarketTaxonomyStore';

interface AggregationGroup {
  label: string;
  documentIds: Set<string>;
  sourceRefIds: Set<string>;
  confidences: number[];
  directions: MarketSignalDirection[];
}

interface SkillAggregationGroup extends AggregationGroup {
  skillId: string | null;
  category: RequirementCategory | null;
}

interface RequirementAggregationGroup extends AggregationGroup {
  category: RequirementCategory;
  priority: RequirementPriority;
  keywords: Set<string>;
}

interface SeniorityAggregationGroup {
  seniorityBand: SeniorityBand;
  documentIds: Set<string>;
  sourceRefIds: Set<string>;
  confidences: number[];
}

interface RemotePolicyAggregationGroup {
  policy: RemotePolicyValue;
  documentIds: Set<string>;
  sourceRefIds: Set<string>;
  confidences: number[];
}

interface SalaryAggregationBucket {
  documentIds: Set<string>;
  sourceRefIds: Set<string>;
  confidences: number[];
  minimums: number[];
  maximums: number[];
}

export interface RoleSignalAggregationOptions {
  region?: string | null;
  windowDays?: number;
  windowStart?: string | null;
  windowEnd?: string | null;
  minSampleSize?: number;
  minSourceCount?: number;
  sourceMode?: SourceMode;
  now?: () => string;
}

export interface AggregateRoleMarketSignalsInput extends RoleSignalAggregationOptions {
  profile: RoleMarketProfile;
  signals: NormalizedMarketSignal[];
}

export interface AggregateAndPersistRoleSignalsInput extends RoleSignalAggregationOptions {
  profile: RoleMarketProfile;
  signals?: NormalizedMarketSignal[];
  upsertAggregate?: (aggregate: RoleMarketSignalAggregate) => Promise<RoleMarketSignalAggregate>;
}

export interface AggregateAllRoleSignalsInput extends RoleSignalAggregationOptions {
  profiles?: RoleMarketProfile[];
  skipEmpty?: boolean;
  loadSignalsForProfile?: (profile: RoleMarketProfile) => Promise<NormalizedMarketSignal[]>;
  upsertAggregate?: (aggregate: RoleMarketSignalAggregate) => Promise<RoleMarketSignalAggregate>;
}

export class RoleSignalAggregationError extends Error {
  statusCode = 422;

  code = 'role_signal_aggregation_error';
}

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_MIN_SAMPLE_SIZE = 25;
const DEFAULT_MIN_SOURCE_COUNT = 2;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function roundConfidence(value: number): number {
  return Number(clamp(value).toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? 0;
  return Math.round((left + right) / 2);
}

function parseTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function subtractDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function hoursBetween(laterIso: string, earlierIso: string): number {
  const later = parseTimestamp(laterIso);
  const earlier = parseTimestamp(earlierIso);
  if (!later || !earlier || later < earlier) return 0;
  return Math.round(((later - earlier) / (60 * 60 * 1000)) * 10) / 10;
}

function documentKey(signal: NormalizedMarketSignal): string {
  return signal.rawDocumentId || signal.sourceDocumentId || signal.id;
}

function uniqueSourceRefs(signals: NormalizedMarketSignal[]): SourceReference[] {
  const seen = new Set<string>();
  const sourceRefs: SourceReference[] = [];
  for (const signal of signals) {
    if (seen.has(signal.sourceRef.id)) continue;
    seen.add(signal.sourceRef.id);
    sourceRefs.push(signal.sourceRef);
  }
  return sourceRefs.sort((a, b) => a.id.localeCompare(b.id));
}

function topDirection(directions: MarketSignalDirection[]): MarketSignalDirection {
  if (directions.length === 0) return 'stable';
  const order: MarketSignalDirection[] = ['increasing', 'stable', 'declining', 'uncertain'];
  const counts = new Map<MarketSignalDirection, number>();
  for (const direction of directions) {
    counts.set(direction, (counts.get(direction) ?? 0) + 1);
  }
  return order.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0] ?? 'stable';
}

function freshnessRatio(freshnessHours: number): number {
  if (freshnessHours <= 24) return 1;
  if (freshnessHours >= 168) return 0;
  return clamp(1 - ((freshnessHours - 24) / 144));
}

function buildAggregateId(profile: RoleMarketProfile, region: string | null, windowStart: string, windowEnd: string): string {
  const hash = createHash('sha1')
    .update([profile.id, region ?? 'global', windowStart, windowEnd].join('|'))
    .digest('hex')
    .slice(0, 20);
  return `market_aggregate_${hash}`;
}

function buildMeta(input: {
  generatedAt: string;
  sourceMode: SourceMode;
  sampleSize: number;
  minSampleSize: number;
  sourceCount: number;
  minSourceCount: number;
  freshnessHours: number;
  windowStart: string;
  windowEnd: string;
}): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: input.generatedAt,
    sourceMode: input.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [
      ...(input.sampleSize < input.minSampleSize
        ? [{
            code: 'low_confidence' as const,
            message:
              `Only ${input.sampleSize} source-backed job samples are available; confidence is capped until at least ${input.minSampleSize} are observed.`,
          }]
        : []),
      ...(input.sourceCount < input.minSourceCount
        ? [{
            code: 'low_confidence' as const,
            message:
              `Signals currently come from ${input.sourceCount} source(s); confidence is capped until source diversity improves.`,
          }]
        : []),
      ...(input.freshnessHours > 168
        ? [{
            code: 'source_stale' as const,
            message: 'The newest signal in this aggregate is more than seven days old.',
          }]
        : []),
    ],
    sourceSummary: {
      sourceMode: input.sourceMode,
      sourceCount: input.sourceCount,
      sampleSize: input.sampleSize,
      freshnessHours: input.freshnessHours,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    },
  };
}

function confidenceCap(input: {
  confidence: number;
  sampleSize: number;
  minSampleSize: number;
  sourceCount: number;
  minSourceCount: number;
  freshnessHours: number;
}): number {
  let capped = input.confidence;
  if (input.sampleSize < input.minSampleSize || input.sourceCount < input.minSourceCount) {
    capped = Math.min(capped, 0.69);
  }
  if (input.sampleSize < Math.ceil(input.minSampleSize / 2)) {
    capped = Math.min(capped, 0.55);
  }
  if (input.freshnessHours > 168) {
    capped = Math.min(capped, 0.55);
  }
  return roundConfidence(capped);
}

function filterSignals(
  profile: RoleMarketProfile,
  signals: NormalizedMarketSignal[],
  options: {
    region: string | null;
    windowStart: string;
    windowEnd: string;
  },
): NormalizedMarketSignal[] {
  const windowStartTs = parseTimestamp(options.windowStart);
  const windowEndTs = parseTimestamp(options.windowEnd);
  return signals.filter((signal) => {
    if (signal.canonicalRoleId !== profile.id) return false;
    if (options.region !== null && signal.region !== options.region) return false;
    const observedAt = parseTimestamp(signal.observedAt);
    if (!observedAt) return false;
    return observedAt >= windowStartTs && observedAt <= windowEndTs;
  });
}

function groupSkillSignals(
  signals: NormalizedMarketSignal[],
  sampleSize: number,
): RoleMarketSignalAggregate['topSkills'] {
  const groups = new Map<string, SkillAggregationGroup>();
  for (const signal of signals) {
    if (signal.signalType !== 'skill' && signal.signalType !== 'tool' && signal.signalType !== 'domain') continue;
    const key = signal.canonicalSkillId ?? normalizeTaxonomyLabel(signal.normalizedLabel);
    if (!key) continue;
    const existing = groups.get(key) ?? {
      skillId: signal.canonicalSkillId,
      label: signal.normalizedLabel,
      category: signal.requirementCategory,
      documentIds: new Set<string>(),
      sourceRefIds: new Set<string>(),
      confidences: [],
      directions: [],
    };
    existing.documentIds.add(documentKey(signal));
    existing.sourceRefIds.add(signal.sourceRef.id);
    existing.confidences.push(signal.confidence);
    existing.directions.push(signal.direction);
    if (!existing.category && signal.requirementCategory) existing.category = signal.requirementCategory;
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      skillId: group.skillId,
      label: group.label,
      category: group.category,
      mentionCount: group.documentIds.size,
      demandShare: roundConfidence(group.documentIds.size / sampleSize),
      direction: topDirection(group.directions),
      sourceRefIds: Array.from(group.sourceRefIds).sort(),
      confidence: roundConfidence(average(group.confidences)),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount || b.confidence - a.confidence || a.label.localeCompare(b.label))
    .slice(0, 12);
}

function groupRequirementSignals(
  signals: NormalizedMarketSignal[],
): RoleMarketSignalAggregate['requirements'] {
  const groups = new Map<string, RequirementAggregationGroup>();
  for (const signal of signals) {
    if (signal.signalType !== 'requirement') continue;
    const key = normalizeTaxonomyLabel(signal.normalizedLabel || signal.value);
    if (!key) continue;
    const existing = groups.get(key) ?? {
      label: signal.normalizedLabel,
      category: signal.requirementCategory ?? 'skill',
      priority: signal.requirementPriority ?? 'important',
      documentIds: new Set<string>(),
      sourceRefIds: new Set<string>(),
      confidences: [],
      directions: [],
      keywords: new Set<string>(),
    };
    existing.documentIds.add(documentKey(signal));
    existing.sourceRefIds.add(signal.sourceRef.id);
    existing.confidences.push(signal.confidence);
    existing.directions.push(signal.direction);
    signal.keywords.forEach((keyword) => existing.keywords.add(keyword));
    if (signal.requirementPriority === 'must_have') existing.priority = 'must_have';
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      label: group.label,
      category: group.category,
      priority: group.priority,
      mentionCount: group.documentIds.size,
      keywords: Array.from(group.keywords).slice(0, 20),
      sourceRefIds: Array.from(group.sourceRefIds).sort(),
      confidence: roundConfidence(average(group.confidences)),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount || b.confidence - a.confidence || a.label.localeCompare(b.label))
    .slice(0, 12);
}

function groupSenioritySignals(
  signals: NormalizedMarketSignal[],
  sampleSize: number,
): RoleMarketSignalAggregate['seniority'] {
  const groups = new Map<SeniorityBand, SeniorityAggregationGroup>();
  for (const signal of signals) {
    if (!signal.seniorityBand) continue;
    const existing = groups.get(signal.seniorityBand) ?? {
      seniorityBand: signal.seniorityBand,
      documentIds: new Set<string>(),
      sourceRefIds: new Set<string>(),
      confidences: [],
    };
    existing.documentIds.add(documentKey(signal));
    existing.sourceRefIds.add(signal.sourceRef.id);
    existing.confidences.push(signal.confidence);
    groups.set(signal.seniorityBand, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      seniorityBand: group.seniorityBand,
      share: roundConfidence(group.documentIds.size / sampleSize),
      mentionCount: group.documentIds.size,
      sourceRefIds: Array.from(group.sourceRefIds).sort(),
      confidence: roundConfidence(average(group.confidences)),
    }))
    .sort((a, b) => b.share - a.share || a.seniorityBand.localeCompare(b.seniorityBand));
}

function readRemotePolicy(signal: NormalizedMarketSignal): RemotePolicyValue | null {
  if (signal.signalType !== 'remote_policy') return null;
  const value = normalizeTaxonomyLabel(`${signal.value} ${signal.normalizedLabel}`);
  if (value.includes('hybrid')) return 'hybrid';
  if (value.includes('remote')) return 'remote';
  if (value.includes('on site') || value.includes('onsite') || value.includes('on-site')) return 'on-site';
  if (value.includes('unknown')) return 'unknown';
  return null;
}

function groupRemotePolicySignals(
  signals: NormalizedMarketSignal[],
  sampleSize: number,
): RoleMarketSignalAggregate['remotePolicy'] {
  const groups = new Map<RemotePolicyValue, RemotePolicyAggregationGroup>();
  for (const signal of signals) {
    const policy = readRemotePolicy(signal);
    if (!policy) continue;
    const existing = groups.get(policy) ?? {
      policy,
      documentIds: new Set<string>(),
      sourceRefIds: new Set<string>(),
      confidences: [],
    };
    existing.documentIds.add(documentKey(signal));
    existing.sourceRefIds.add(signal.sourceRef.id);
    existing.confidences.push(signal.confidence);
    groups.set(policy, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      policy: group.policy,
      share: roundConfidence(group.documentIds.size / sampleSize),
      mentionCount: group.documentIds.size,
      sourceRefIds: Array.from(group.sourceRefIds).sort(),
      confidence: roundConfidence(average(group.confidences)),
    }))
    .sort((a, b) => b.share - a.share || a.policy.localeCompare(b.policy));
}

function parseSalaryNumber(signal: NormalizedMarketSignal, key: 'salary_min' | 'salary_max'): number | null {
  const match = new RegExp(`${key}=([0-9]+(?:\\.[0-9]+)?)`).exec(signal.value);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function aggregateSalarySignals(signals: NormalizedMarketSignal[]): RoleMarketSignalAggregate['salary'] {
  const bucket: SalaryAggregationBucket = {
    documentIds: new Set<string>(),
    sourceRefIds: new Set<string>(),
    confidences: [],
    minimums: [],
    maximums: [],
  };

  for (const signal of signals) {
    if (signal.signalType !== 'salary') continue;
    bucket.documentIds.add(documentKey(signal));
    bucket.sourceRefIds.add(signal.sourceRef.id);
    bucket.confidences.push(signal.confidence);
    const salaryMin = parseSalaryNumber(signal, 'salary_min');
    const salaryMax = parseSalaryNumber(signal, 'salary_max');
    if (salaryMin !== null) bucket.minimums.push(salaryMin);
    if (salaryMax !== null) bucket.maximums.push(salaryMax);
  }

  if (bucket.documentIds.size === 0) return [];
  return [{
    label: 'Salary range',
    salaryMin: median(bucket.minimums),
    salaryMax: median(bucket.maximums),
    mentionCount: bucket.documentIds.size,
    sourceRefIds: Array.from(bucket.sourceRefIds).sort(),
    confidence: roundConfidence(average(bucket.confidences)),
  }];
}

function aggregateAiImpactSignals(signals: NormalizedMarketSignal[]): RoleMarketSignalAggregate['aiImpact'] {
  const groups = new Map<string, AggregationGroup>();
  for (const signal of signals) {
    if (signal.signalType !== 'ai_impact') continue;
    const key = normalizeTaxonomyLabel(signal.normalizedLabel);
    if (!key) continue;
    const existing = groups.get(key) ?? {
      label: signal.normalizedLabel,
      documentIds: new Set<string>(),
      sourceRefIds: new Set<string>(),
      confidences: [],
      directions: [],
    };
    existing.documentIds.add(documentKey(signal));
    existing.sourceRefIds.add(signal.sourceRef.id);
    existing.confidences.push(signal.confidence);
    existing.directions.push(signal.direction);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      impact: 'amplified' as AiImpact,
      summary: group.label,
      affectedSkills: [],
      sourceRefIds: Array.from(group.sourceRefIds).sort(),
      confidence: roundConfidence(average(group.confidences)),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

export function aggregateRoleMarketSignals(
  input: AggregateRoleMarketSignalsInput,
): RoleMarketSignalAggregate {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  const windowDays = Math.max(1, Math.min(365, Math.round(input.windowDays ?? DEFAULT_WINDOW_DAYS)));
  const windowEnd = input.windowEnd ?? generatedAt;
  const windowStart = input.windowStart ?? subtractDays(windowEnd, windowDays);
  const region = input.region ?? null;
  const minSampleSize = Math.max(1, Math.round(input.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE));
  const minSourceCount = Math.max(1, Math.round(input.minSourceCount ?? DEFAULT_MIN_SOURCE_COUNT));
  const sourceMode = input.sourceMode ?? 'live';
  const signals = filterSignals(input.profile, input.signals, { region, windowStart, windowEnd });

  if (signals.length === 0) {
    throw new RoleSignalAggregationError(
      `No taxonomy-resolved market signals are available for ${input.profile.title}.`,
    );
  }

  const documentIds = new Set(signals.map(documentKey));
  const sampleSize = documentIds.size;
  const sourceIds = new Set(signals.map((signal) => signal.sourceId));
  const sourceCount = sourceIds.size;
  const sourceRefs = uniqueSourceRefs(signals);
  const latestObservedAt = signals
    .map((signal) => signal.observedAt)
    .sort((a, b) => parseTimestamp(b) - parseTimestamp(a))[0] ?? windowStart;
  const freshnessHours = hoursBetween(generatedAt, latestObservedAt);
  const sampleRatio = clamp(sampleSize / minSampleSize);
  const sourceRatio = clamp(sourceCount / minSourceCount);
  const freshRatio = freshnessRatio(freshnessHours);
  const avgSignalConfidence = average(signals.map((signal) => signal.confidence));
  const uncappedConfidence = (avgSignalConfidence * 0.45) + (sampleRatio * 0.3) + (sourceRatio * 0.15) + (freshRatio * 0.1);
  const aggregateConfidence = confidenceCap({
    confidence: uncappedConfidence,
    sampleSize,
    minSampleSize,
    sourceCount,
    minSourceCount,
    freshnessHours,
  });
  const roleDemandSignals = signals.filter((signal) => signal.signalType === 'role_demand');

  const aggregate: RoleMarketSignalAggregate = {
    id: buildAggregateId(input.profile, region, windowStart, windowEnd),
    roleProfileId: input.profile.id,
    roleTitle: input.profile.title,
    category: input.profile.category,
    region,
    sourceMode,
    windowStart,
    windowEnd,
    sampleSize,
    sourceCount,
    sourceRefs,
    demand: {
      score: Math.round(100 * ((sampleRatio * 0.55) + (sourceRatio * 0.25) + (freshRatio * 0.2))),
      direction: topDirection(roleDemandSignals.map((signal) => signal.direction)),
      sampleSize,
      sourceDiversity: sourceCount,
      confidence: aggregateConfidence,
    },
    topSkills: groupSkillSignals(signals, sampleSize),
    requirements: groupRequirementSignals(signals),
    seniority: groupSenioritySignals(signals, sampleSize),
    remotePolicy: groupRemotePolicySignals(signals, sampleSize),
    salary: aggregateSalarySignals(signals),
    aiImpact: aggregateAiImpactSignals(signals),
    freshnessHours,
    confidence: aggregateConfidence,
    generatedAt,
    meta: buildMeta({
      generatedAt,
      sourceMode,
      sampleSize,
      minSampleSize,
      sourceCount,
      minSourceCount,
      freshnessHours,
      windowStart,
      windowEnd,
    }),
  };

  assertValidRoleMarketSignalAggregate(aggregate);
  return aggregate;
}

export async function aggregateAndPersistRoleMarketSignals(
  input: AggregateAndPersistRoleSignalsInput,
): Promise<RoleMarketSignalAggregate> {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  const windowDays = Math.max(1, Math.min(365, Math.round(input.windowDays ?? DEFAULT_WINDOW_DAYS)));
  const windowEnd = input.windowEnd ?? generatedAt;
  const windowStart = input.windowStart ?? subtractDays(windowEnd, windowDays);
  const signals = input.signals ?? await listNormalizedMarketSignalsForRole({
    roleProfileId: input.profile.id,
    region: input.region ?? null,
    windowStart,
    windowEnd,
  });
  const aggregate = aggregateRoleMarketSignals({
    ...input,
    signals,
    windowStart,
    windowEnd,
    now: () => generatedAt,
  });
  const upsertAggregate = input.upsertAggregate ?? upsertRoleMarketSignalAggregate;
  return upsertAggregate(aggregate);
}

export async function aggregateAndPersistAllRoleMarketSignals(
  input: AggregateAllRoleSignalsInput = {},
): Promise<RoleMarketSignalAggregate[]> {
  const profiles = input.profiles ?? await getMarketProfileRegistry().listProfiles();
  const generatedAt = input.now?.() ?? new Date().toISOString();
  const windowDays = Math.max(1, Math.min(365, Math.round(input.windowDays ?? DEFAULT_WINDOW_DAYS)));
  const windowEnd = input.windowEnd ?? generatedAt;
  const windowStart = input.windowStart ?? subtractDays(windowEnd, windowDays);
  const aggregates: RoleMarketSignalAggregate[] = [];
  for (const profile of profiles) {
    try {
      const signals = input.loadSignalsForProfile
        ? await input.loadSignalsForProfile(profile)
        : undefined;
      aggregates.push(await aggregateAndPersistRoleMarketSignals({
        ...input,
        profile,
        signals,
        windowStart,
        windowEnd,
        now: () => generatedAt,
        upsertAggregate: input.upsertAggregate,
      }));
    } catch (error) {
      if (!(error instanceof RoleSignalAggregationError) || input.skipEmpty === false) {
        throw error;
      }
    }
  }
  return aggregates;
}
