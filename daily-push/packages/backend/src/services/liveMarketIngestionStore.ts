import {
  validateMarketIngestionRun,
  validateMarketRawDocument,
  validateMarketSource,
  type ContractMeta,
  type MarketIngestionRun,
  type MarketIngestionRunStatus,
  type MarketRawDocument,
  type MarketSource,
  type SourceReference,
} from '@daily-push/shared';
import { pool } from '../db/postgres';

type JsonObject = Record<string, unknown>;

interface MarketSourceRow {
  id: string;
  name: string;
  source_type: MarketSource['type'];
  status: MarketSource['status'];
  source_ref_type: SourceReference['sourceType'];
  base_url: string | null;
  region: string | null;
  auth_mode: MarketSource['authMode'];
  pii_risk_level: MarketSource['piiRiskLevel'];
  freshness_sla_hours: number;
  owner: string | null;
  notes: string | null;
  contract_meta: ContractMeta;
  created_at: string;
  updated_at: string;
}

interface MarketIngestionRunRow {
  id: string;
  source_id: string;
  adapter_name: string;
  status: MarketIngestionRunStatus;
  requested_by: MarketIngestionRun['requestedBy'];
  started_at: string;
  completed_at: string | null;
  documents_discovered: number;
  documents_created: number;
  documents_deduped: number;
  documents_failed: number;
  error_summary: string | null;
  contract_meta: ContractMeta;
}

interface MarketRawDocumentRow {
  id: string;
  source_id: string;
  ingestion_run_id: string;
  source_document_id: string;
  document_type: MarketRawDocument['documentType'];
  title: string;
  url: string | null;
  publisher: string | null;
  region: string | null;
  published_at: string | null;
  captured_at: string;
  dedupe_key: string;
  checksum: string;
  extracted_text: string;
  raw_payload: JsonObject | null;
  source_ref: SourceReference;
  contract_meta: ContractMeta;
}

export interface CreateMarketRawDocumentResult {
  document: MarketRawDocument;
  created: boolean;
}

export interface UpdateMarketIngestionRunInput {
  status: MarketIngestionRunStatus;
  completedAt?: string | null;
  documentsDiscovered?: number;
  documentsCreated?: number;
  documentsDeduped?: number;
  documentsFailed?: number;
  errorSummary?: string | null;
  metadata?: JsonObject;
}

export interface ListMarketIngestionRunsOptions {
  sourceId?: string | null;
  status?: MarketIngestionRunStatus | null;
  limit?: number;
}

export class LiveMarketIngestionStoreError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

function assertValidSource(source: MarketSource): void {
  const validation = validateMarketSource(source);
  if (!validation.valid) {
    throw new LiveMarketIngestionStoreError(validation.errors.join('; '));
  }
}

function assertValidRun(run: MarketIngestionRun): void {
  const validation = validateMarketIngestionRun(run);
  if (!validation.valid) {
    throw new LiveMarketIngestionStoreError(validation.errors.join('; '));
  }
}

function assertValidRawDocument(document: MarketRawDocument): void {
  const validation = validateMarketRawDocument(document);
  if (!validation.valid) {
    throw new LiveMarketIngestionStoreError(validation.errors.join('; '));
  }
}

function mapMarketSource(row: MarketSourceRow): MarketSource {
  return {
    id: row.id,
    name: row.name,
    type: row.source_type,
    status: row.status,
    sourceRefType: row.source_ref_type,
    baseUrl: row.base_url,
    region: row.region,
    authMode: row.auth_mode,
    piiRiskLevel: row.pii_risk_level,
    freshnessSlaHours: row.freshness_sla_hours,
    owner: row.owner,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: row.contract_meta,
  };
}

function mapMarketIngestionRun(row: MarketIngestionRunRow): MarketIngestionRun {
  return {
    id: row.id,
    sourceId: row.source_id,
    adapterName: row.adapter_name,
    status: row.status,
    requestedBy: row.requested_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    documentsDiscovered: row.documents_discovered,
    documentsCreated: row.documents_created,
    documentsDeduped: row.documents_deduped,
    documentsFailed: row.documents_failed,
    errorSummary: row.error_summary,
    meta: row.contract_meta,
  };
}

function mapMarketRawDocument(row: MarketRawDocumentRow): MarketRawDocument {
  return {
    id: row.id,
    sourceId: row.source_id,
    ingestionRunId: row.ingestion_run_id,
    sourceDocumentId: row.source_document_id,
    documentType: row.document_type,
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    region: row.region,
    publishedAt: row.published_at,
    capturedAt: row.captured_at,
    dedupeKey: row.dedupe_key,
    checksum: row.checksum,
    extractedText: row.extracted_text,
    rawPayload: row.raw_payload,
    sourceRef: row.source_ref,
    meta: row.contract_meta,
  };
}

export async function upsertMarketSource(source: MarketSource): Promise<MarketSource> {
  assertValidSource(source);

  const { rows } = await pool.query<MarketSourceRow>(
    `INSERT INTO role_market_sources
       (id,
        name,
        source_type,
        status,
        source_ref_type,
        base_url,
        region,
        auth_mode,
        pii_risk_level,
        freshness_sla_hours,
        owner,
        notes,
        contract_meta,
        metadata,
        created_at,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, '{}'::jsonb, $14, $15)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       source_type = EXCLUDED.source_type,
       status = EXCLUDED.status,
       source_ref_type = EXCLUDED.source_ref_type,
       base_url = EXCLUDED.base_url,
       region = EXCLUDED.region,
       auth_mode = EXCLUDED.auth_mode,
       pii_risk_level = EXCLUDED.pii_risk_level,
       freshness_sla_hours = EXCLUDED.freshness_sla_hours,
       owner = EXCLUDED.owner,
       notes = EXCLUDED.notes,
       contract_meta = EXCLUDED.contract_meta,
       updated_at = NOW()
     RETURNING id,
               name,
               source_type,
               status,
               source_ref_type,
               base_url,
               region,
               auth_mode,
               pii_risk_level,
               freshness_sla_hours,
               owner,
               notes,
               contract_meta,
               created_at::text,
               updated_at::text`,
    [
      source.id,
      source.name,
      source.type,
      source.status,
      source.sourceRefType,
      source.baseUrl,
      source.region,
      source.authMode,
      source.piiRiskLevel,
      source.freshnessSlaHours,
      source.owner,
      source.notes,
      JSON.stringify(source.meta),
      source.createdAt,
      source.updatedAt,
    ],
  );

  if (!rows[0]) throw new Error('Market source could not be saved.');
  return mapMarketSource(rows[0]);
}

export async function listMarketSources(): Promise<MarketSource[]> {
  const { rows } = await pool.query<MarketSourceRow>(
    `SELECT id,
            name,
            source_type,
            status,
            source_ref_type,
            base_url,
            region,
            auth_mode,
            pii_risk_level,
            freshness_sla_hours,
            owner,
            notes,
            contract_meta,
            created_at::text,
            updated_at::text
       FROM role_market_sources
      ORDER BY status ASC, name ASC`,
  );

  return rows.map(mapMarketSource);
}

export async function getMarketSource(sourceId: string): Promise<MarketSource | null> {
  const { rows } = await pool.query<MarketSourceRow>(
    `SELECT id,
            name,
            source_type,
            status,
            source_ref_type,
            base_url,
            region,
            auth_mode,
            pii_risk_level,
            freshness_sla_hours,
            owner,
            notes,
            contract_meta,
            created_at::text,
            updated_at::text
       FROM role_market_sources
      WHERE id = $1
      LIMIT 1`,
    [sourceId],
  );

  return rows[0] ? mapMarketSource(rows[0]) : null;
}

export async function createMarketIngestionRun(
  run: MarketIngestionRun,
  configSnapshot: JsonObject = {},
): Promise<MarketIngestionRun> {
  assertValidRun(run);

  const { rows } = await pool.query<MarketIngestionRunRow>(
    `INSERT INTO role_market_ingestion_runs
       (id,
        source_id,
        adapter_name,
        status,
        requested_by,
        started_at,
        completed_at,
        documents_discovered,
        documents_created,
        documents_deduped,
        documents_failed,
        config_snapshot,
        error_summary,
        contract_meta,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb, '{}'::jsonb)
     RETURNING id,
               source_id,
               adapter_name,
               status,
               requested_by,
               started_at::text,
               completed_at::text,
               documents_discovered,
               documents_created,
               documents_deduped,
               documents_failed,
               error_summary,
               contract_meta`,
    [
      run.id,
      run.sourceId,
      run.adapterName,
      run.status,
      run.requestedBy,
      run.startedAt,
      run.completedAt,
      run.documentsDiscovered,
      run.documentsCreated,
      run.documentsDeduped,
      run.documentsFailed,
      JSON.stringify(configSnapshot),
      run.errorSummary,
      JSON.stringify(run.meta),
    ],
  );

  if (!rows[0]) throw new Error('Market ingestion run could not be created.');
  return mapMarketIngestionRun(rows[0]);
}

export async function updateMarketIngestionRunStatus(
  runId: string,
  input: UpdateMarketIngestionRunInput,
): Promise<MarketIngestionRun> {
  const { rows } = await pool.query<MarketIngestionRunRow>(
    `UPDATE role_market_ingestion_runs
        SET status = $2,
            completed_at = COALESCE($3, completed_at),
            documents_discovered = COALESCE($4, documents_discovered),
            documents_created = COALESCE($5, documents_created),
            documents_deduped = COALESCE($6, documents_deduped),
            documents_failed = COALESCE($7, documents_failed),
            error_summary = $8,
            metadata = metadata || $9::jsonb,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id,
                source_id,
                adapter_name,
                status,
                requested_by,
                started_at::text,
                completed_at::text,
                documents_discovered,
                documents_created,
                documents_deduped,
                documents_failed,
                error_summary,
                contract_meta`,
    [
      runId,
      input.status,
      input.completedAt ?? null,
      input.documentsDiscovered ?? null,
      input.documentsCreated ?? null,
      input.documentsDeduped ?? null,
      input.documentsFailed ?? null,
      input.errorSummary ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  if (!rows[0]) throw new Error('Market ingestion run was not found.');
  const run = mapMarketIngestionRun(rows[0]);
  assertValidRun(run);
  return run;
}

export async function createMarketRawDocument(
  document: MarketRawDocument,
): Promise<CreateMarketRawDocumentResult> {
  assertValidRawDocument(document);

  const { rows } = await pool.query<MarketRawDocumentRow>(
    `INSERT INTO role_market_raw_documents
       (id,
        source_id,
        ingestion_run_id,
        source_document_id,
        document_type,
        title,
        url,
        publisher,
        region,
        published_at,
        captured_at,
        dedupe_key,
        checksum,
        extracted_text,
        raw_payload,
        source_ref,
        contract_meta,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, '{}'::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id,
               source_id,
               ingestion_run_id,
               source_document_id,
               document_type,
               title,
               url,
               publisher,
               region,
               published_at::text,
               captured_at::text,
               dedupe_key,
               checksum,
               extracted_text,
               raw_payload,
               source_ref,
               contract_meta`,
    [
      document.id,
      document.sourceId,
      document.ingestionRunId,
      document.sourceDocumentId,
      document.documentType,
      document.title,
      document.url,
      document.publisher,
      document.region,
      document.publishedAt,
      document.capturedAt,
      document.dedupeKey,
      document.checksum,
      document.extractedText,
      document.rawPayload === null ? null : JSON.stringify(document.rawPayload),
      JSON.stringify(document.sourceRef),
      JSON.stringify(document.meta),
    ],
  );

  if (rows[0]) {
    return { document: mapMarketRawDocument(rows[0]), created: true };
  }

  const existing = await getExistingRawDocumentForDedupe(document);
  if (!existing) {
    throw new Error('Market raw document could not be created or deduped.');
  }

  return { document: existing, created: false };
}

async function getExistingRawDocumentForDedupe(
  document: MarketRawDocument,
): Promise<MarketRawDocument | null> {
  const { rows } = await pool.query<MarketRawDocumentRow>(
    `SELECT id,
            source_id,
            ingestion_run_id,
            source_document_id,
            document_type,
            title,
            url,
            publisher,
            region,
            published_at::text,
            captured_at::text,
            dedupe_key,
            checksum,
            extracted_text,
            raw_payload,
            source_ref,
            contract_meta
       FROM role_market_raw_documents
      WHERE source_id = $1
        AND (
          source_document_id = $2
          OR dedupe_key = $3
          OR checksum = $4
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [
      document.sourceId,
      document.sourceDocumentId,
      document.dedupeKey,
      document.checksum,
    ],
  );

  return rows[0] ? mapMarketRawDocument(rows[0]) : null;
}

export async function getLatestMarketIngestionRun(
  sourceId: string,
): Promise<MarketIngestionRun | null> {
  const { rows } = await pool.query<MarketIngestionRunRow>(
    `SELECT id,
            source_id,
            adapter_name,
            status,
            requested_by,
            started_at::text,
            completed_at::text,
            documents_discovered,
            documents_created,
            documents_deduped,
            documents_failed,
            error_summary,
            contract_meta
       FROM role_market_ingestion_runs
      WHERE source_id = $1
      ORDER BY started_at DESC
      LIMIT 1`,
    [sourceId],
  );

  return rows[0] ? mapMarketIngestionRun(rows[0]) : null;
}

export async function listMarketIngestionRuns(
  options: ListMarketIngestionRunsOptions = {},
): Promise<MarketIngestionRun[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.sourceId) {
    params.push(options.sourceId);
    conditions.push(`source_id = $${params.length}`);
  }

  if (options.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<MarketIngestionRunRow>(
    `SELECT id,
            source_id,
            adapter_name,
            status,
            requested_by,
            started_at::text,
            completed_at::text,
            documents_discovered,
            documents_created,
            documents_deduped,
            documents_failed,
            error_summary,
            contract_meta
       FROM role_market_ingestion_runs
       ${whereClause}
      ORDER BY started_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return rows.map(mapMarketIngestionRun);
}
