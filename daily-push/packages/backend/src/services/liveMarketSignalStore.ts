import {
  validateNormalizedMarketSignal,
  validateRoleMarketSignalAggregate,
  type ContractMeta,
  type NormalizedMarketSignal,
  type RoleMarketSignalAggregate,
  type SourceReference,
} from '@daily-push/shared';
import { pool } from '../db/postgres';

type JsonObject = Record<string, unknown>;

interface NormalizedMarketSignalRow {
  id: string;
  source_id: string;
  ingestion_run_id: string;
  raw_document_id: string;
  source_document_id: string;
  source_ref: SourceReference;
  signal_type: NormalizedMarketSignal['signalType'];
  canonical_role_id: string | null;
  observed_role_title: string;
  canonical_skill_id: string | null;
  normalized_label: string;
  requirement_category: NormalizedMarketSignal['requirementCategory'];
  requirement_priority: NormalizedMarketSignal['requirementPriority'];
  seniority_band: NormalizedMarketSignal['seniorityBand'];
  region: string | null;
  signal_value: string;
  keywords: string[];
  evidence_text: string;
  direction: NormalizedMarketSignal['direction'];
  observed_at: string;
  confidence: number;
  contract_meta: ContractMeta;
}

interface RoleMarketSignalAggregateRow {
  aggregate_json: RoleMarketSignalAggregate;
}

export class LiveMarketSignalStoreError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

function confidenceToSmallInt(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function confidenceFromSmallInt(value: number): number {
  return Math.max(0, Math.min(1, value / 100));
}

function scoreToSmallInt(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateWindowDays(aggregate: RoleMarketSignalAggregate): number {
  const windowStart = new Date(aggregate.windowStart).getTime();
  const windowEnd = new Date(aggregate.windowEnd).getTime();
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    return 1;
  }
  return Math.max(1, Math.ceil((windowEnd - windowStart) / (24 * 60 * 60 * 1000)));
}

function calculateFreshnessScore(aggregate: RoleMarketSignalAggregate): number {
  if (aggregate.freshnessHours <= 24) return 100;
  if (aggregate.freshnessHours >= 168) return 0;
  return scoreToSmallInt(100 - ((aggregate.freshnessHours - 24) / 144) * 100);
}

function assertValidNormalizedSignal(signal: NormalizedMarketSignal): void {
  const validation = validateNormalizedMarketSignal(signal);
  if (!validation.valid) {
    throw new LiveMarketSignalStoreError(validation.errors.join('; '));
  }
}

function assertValidAggregate(aggregate: RoleMarketSignalAggregate): void {
  const validation = validateRoleMarketSignalAggregate(aggregate);
  if (!validation.valid) {
    throw new LiveMarketSignalStoreError(validation.errors.join('; '));
  }
}

function mapNormalizedSignal(row: NormalizedMarketSignalRow): NormalizedMarketSignal {
  return {
    id: row.id,
    sourceId: row.source_id,
    ingestionRunId: row.ingestion_run_id,
    rawDocumentId: row.raw_document_id,
    sourceDocumentId: row.source_document_id,
    sourceRef: row.source_ref,
    signalType: row.signal_type,
    canonicalRoleId: row.canonical_role_id,
    observedRoleTitle: row.observed_role_title,
    canonicalSkillId: row.canonical_skill_id,
    normalizedLabel: row.normalized_label,
    requirementCategory: row.requirement_category,
    requirementPriority: row.requirement_priority,
    seniorityBand: row.seniority_band,
    region: row.region,
    value: row.signal_value,
    keywords: row.keywords,
    evidenceText: row.evidence_text,
    direction: row.direction,
    observedAt: row.observed_at,
    confidence: confidenceFromSmallInt(row.confidence),
    meta: row.contract_meta,
  };
}

export async function upsertNormalizedMarketSignal(
  signal: NormalizedMarketSignal,
  metadata: JsonObject = {},
): Promise<NormalizedMarketSignal> {
  assertValidNormalizedSignal(signal);

  const { rows } = await pool.query<NormalizedMarketSignalRow>(
    `INSERT INTO role_market_normalized_signals
       (id,
        source_id,
        ingestion_run_id,
        raw_document_id,
        source_document_id,
        source_ref,
        signal_type,
        canonical_role_id,
        observed_role_title,
        canonical_skill_id,
        normalized_label,
        requirement_category,
        requirement_priority,
        seniority_band,
        region,
        signal_value,
        keywords,
        evidence_text,
        direction,
        observed_at,
        confidence,
        contract_meta,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, $21, $22::jsonb, $23::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       source_ref = EXCLUDED.source_ref,
       signal_type = EXCLUDED.signal_type,
       canonical_role_id = EXCLUDED.canonical_role_id,
       observed_role_title = EXCLUDED.observed_role_title,
       canonical_skill_id = EXCLUDED.canonical_skill_id,
       normalized_label = EXCLUDED.normalized_label,
       requirement_category = EXCLUDED.requirement_category,
       requirement_priority = EXCLUDED.requirement_priority,
       seniority_band = EXCLUDED.seniority_band,
       region = EXCLUDED.region,
       signal_value = EXCLUDED.signal_value,
       keywords = EXCLUDED.keywords,
       evidence_text = EXCLUDED.evidence_text,
       direction = EXCLUDED.direction,
       observed_at = EXCLUDED.observed_at,
       confidence = EXCLUDED.confidence,
       contract_meta = EXCLUDED.contract_meta,
       metadata = role_market_normalized_signals.metadata || EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id,
               source_id,
               ingestion_run_id,
               raw_document_id,
               source_document_id,
               source_ref,
               signal_type,
               canonical_role_id,
               observed_role_title,
               canonical_skill_id,
               normalized_label,
               requirement_category,
               requirement_priority,
               seniority_band,
               region,
               signal_value,
               keywords,
               evidence_text,
               direction,
               observed_at::text,
               confidence,
               contract_meta`,
    [
      signal.id,
      signal.sourceId,
      signal.ingestionRunId,
      signal.rawDocumentId,
      signal.sourceDocumentId,
      JSON.stringify(signal.sourceRef),
      signal.signalType,
      signal.canonicalRoleId,
      signal.observedRoleTitle,
      signal.canonicalSkillId,
      signal.normalizedLabel,
      signal.requirementCategory,
      signal.requirementPriority,
      signal.seniorityBand,
      signal.region,
      signal.value,
      JSON.stringify(signal.keywords),
      signal.evidenceText,
      signal.direction,
      signal.observedAt,
      confidenceToSmallInt(signal.confidence),
      JSON.stringify(signal.meta),
      JSON.stringify(metadata),
    ],
  );

  if (!rows[0]) throw new Error('Normalized market signal could not be saved.');
  const saved = mapNormalizedSignal(rows[0]);
  assertValidNormalizedSignal(saved);
  return saved;
}

export async function listNormalizedSignalsForRawDocument(
  rawDocumentId: string,
): Promise<NormalizedMarketSignal[]> {
  const { rows } = await pool.query<NormalizedMarketSignalRow>(
    `SELECT id,
            source_id,
            ingestion_run_id,
            raw_document_id,
            source_document_id,
            source_ref,
            signal_type,
            canonical_role_id,
            observed_role_title,
            canonical_skill_id,
            normalized_label,
            requirement_category,
            requirement_priority,
            seniority_band,
            region,
            signal_value,
            keywords,
            evidence_text,
            direction,
            observed_at::text,
            confidence,
            contract_meta
       FROM role_market_normalized_signals
      WHERE raw_document_id = $1
      ORDER BY observed_at DESC, id ASC`,
    [rawDocumentId],
  );

  return rows.map(mapNormalizedSignal);
}

export interface ListNormalizedSignalsForRoleOptions {
  roleProfileId: string;
  region?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  limit?: number;
}

export async function listNormalizedMarketSignalsForRole(
  options: ListNormalizedSignalsForRoleOptions,
): Promise<NormalizedMarketSignal[]> {
  const limit = Math.max(1, Math.min(10_000, Math.round(options.limit ?? 5_000)));
  const { rows } = await pool.query<NormalizedMarketSignalRow>(
    `SELECT id,
            source_id,
            ingestion_run_id,
            raw_document_id,
            source_document_id,
            source_ref,
            signal_type,
            canonical_role_id,
            observed_role_title,
            canonical_skill_id,
            normalized_label,
            requirement_category,
            requirement_priority,
            seniority_band,
            region,
            signal_value,
            keywords,
            evidence_text,
            direction,
            observed_at::text,
            confidence,
            contract_meta
       FROM role_market_normalized_signals
      WHERE canonical_role_id = $1
        AND ($2::text IS NULL OR region = $2)
        AND ($3::timestamptz IS NULL OR observed_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR observed_at <= $4::timestamptz)
      ORDER BY observed_at DESC, id ASC
      LIMIT $5`,
    [
      options.roleProfileId,
      options.region ?? null,
      options.windowStart ?? null,
      options.windowEnd ?? null,
      limit,
    ],
  );

  return rows.map(mapNormalizedSignal);
}

export async function upsertRoleMarketSignalAggregate(
  aggregate: RoleMarketSignalAggregate,
  metadata: JsonObject = {},
): Promise<RoleMarketSignalAggregate> {
  assertValidAggregate(aggregate);

  const { rows } = await pool.query<RoleMarketSignalAggregateRow>(
    `INSERT INTO role_market_signal_aggregates
       (id,
        role_profile_id,
        role_title,
        category,
        region,
        source_mode,
        window_start,
        window_end,
        window_days,
        sample_size,
        source_count,
        demand_score,
        freshness_score,
        confidence,
        aggregate_json,
        source_refs,
        generated_at,
        contract_meta,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18::jsonb, $19::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       role_profile_id = EXCLUDED.role_profile_id,
       role_title = EXCLUDED.role_title,
       category = EXCLUDED.category,
       region = EXCLUDED.region,
       source_mode = EXCLUDED.source_mode,
       window_start = EXCLUDED.window_start,
       window_end = EXCLUDED.window_end,
       window_days = EXCLUDED.window_days,
       sample_size = EXCLUDED.sample_size,
       source_count = EXCLUDED.source_count,
       demand_score = EXCLUDED.demand_score,
       freshness_score = EXCLUDED.freshness_score,
       confidence = EXCLUDED.confidence,
       aggregate_json = EXCLUDED.aggregate_json,
       source_refs = EXCLUDED.source_refs,
       generated_at = EXCLUDED.generated_at,
       contract_meta = EXCLUDED.contract_meta,
       metadata = role_market_signal_aggregates.metadata || EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING aggregate_json`,
    [
      aggregate.id,
      aggregate.roleProfileId,
      aggregate.roleTitle,
      aggregate.category,
      aggregate.region,
      aggregate.sourceMode,
      aggregate.windowStart,
      aggregate.windowEnd,
      calculateWindowDays(aggregate),
      aggregate.sampleSize,
      aggregate.sourceCount,
      scoreToSmallInt(aggregate.demand.score),
      calculateFreshnessScore(aggregate),
      confidenceToSmallInt(aggregate.confidence),
      JSON.stringify(aggregate),
      JSON.stringify(aggregate.sourceRefs),
      aggregate.generatedAt,
      JSON.stringify(aggregate.meta),
      JSON.stringify(metadata),
    ],
  );

  if (!rows[0]) throw new Error('Role market signal aggregate could not be saved.');
  assertValidAggregate(rows[0].aggregate_json);
  return rows[0].aggregate_json;
}

export async function getLatestRoleMarketSignalAggregate(
  roleProfileId: string,
  region: string | null = null,
): Promise<RoleMarketSignalAggregate | null> {
  const { rows } = await pool.query<RoleMarketSignalAggregateRow>(
    `SELECT aggregate_json
       FROM role_market_signal_aggregates
      WHERE role_profile_id = $1
        AND ($2::text IS NULL OR region = $2)
      ORDER BY generated_at DESC
      LIMIT 1`,
    [roleProfileId, region],
  );

  if (!rows[0]) return null;
  assertValidAggregate(rows[0].aggregate_json);
  return rows[0].aggregate_json;
}

export interface ListLatestRoleMarketSignalAggregatesOptions {
  roleProfileIds?: string[];
  region?: string | null;
  limit?: number;
}

export async function listLatestRoleMarketSignalAggregates(
  options: ListLatestRoleMarketSignalAggregatesOptions = {},
): Promise<RoleMarketSignalAggregate[]> {
  const roleProfileIds = (options.roleProfileIds ?? [])
    .map((roleProfileId) => roleProfileId.trim())
    .filter(Boolean);
  const limit = Math.max(1, Math.min(200, Math.round(options.limit ?? 50)));
  const { rows } = await pool.query<RoleMarketSignalAggregateRow>(
    `SELECT aggregate_json
       FROM (
         SELECT DISTINCT ON (role_profile_id)
                role_profile_id,
                generated_at,
                aggregate_json
           FROM role_market_signal_aggregates
          WHERE ($1::text[] IS NULL OR role_profile_id = ANY($1::text[]))
            AND ($2::text IS NULL OR region = $2)
          ORDER BY role_profile_id, generated_at DESC
       ) latest
      ORDER BY generated_at DESC
      LIMIT $3`,
    [
      roleProfileIds.length > 0 ? roleProfileIds : null,
      options.region ?? null,
      limit,
    ],
  );

  return rows.map((row) => {
    assertValidAggregate(row.aggregate_json);
    return row.aggregate_json;
  });
}

export async function getRoleMarketSignalAggregate(
  aggregateId: string,
): Promise<RoleMarketSignalAggregate | null> {
  const { rows } = await pool.query<RoleMarketSignalAggregateRow>(
    `SELECT aggregate_json
       FROM role_market_signal_aggregates
      WHERE id = $1
      LIMIT 1`,
    [aggregateId],
  );

  if (!rows[0]) return null;
  assertValidAggregate(rows[0].aggregate_json);
  return rows[0].aggregate_json;
}
