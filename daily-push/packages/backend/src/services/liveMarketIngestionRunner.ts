import { createHash, randomUUID } from 'crypto';
import {
  assertValidMarketIngestionRun,
  assertValidMarketRawDocument,
  assertValidMarketSourceFetchRequest,
  assertValidMarketSourceFetchResult,
  type ContractMeta,
  type MarketIngestionRun,
  type MarketRawDocument,
  type MarketSource,
  type MarketSourceFetchResult,
  type NormalizedMarketSignal,
} from '@daily-push/shared';
import { config } from '../config';
import {
  createMarketIngestionRun,
  createMarketRawDocument,
  updateMarketIngestionRunStatus,
  type CreateMarketRawDocumentResult,
  type UpdateMarketIngestionRunInput,
} from './liveMarketIngestionStore';
import { normalizeAndPersistMarketRawDocument } from './jobSignalNormalizer';
import {
  type MarketSourceAdapter,
  UnsupportedMarketSourceError,
} from './marketSourceAdapters';

type RequestedBy = MarketIngestionRun['requestedBy'];

interface Clock {
  now(): string;
}

export interface MarketIngestionStorePort {
  createRun(run: MarketIngestionRun, configSnapshot?: Record<string, unknown>): Promise<MarketIngestionRun>;
  updateRun(runId: string, input: UpdateMarketIngestionRunInput): Promise<MarketIngestionRun>;
  createRawDocument(document: MarketRawDocument): Promise<CreateMarketRawDocumentResult>;
}

export interface RunMarketSourceIngestionInput {
  source: MarketSource;
  adapter: MarketSourceAdapter;
  store?: MarketIngestionStorePort;
  requestedBy?: RequestedBy;
  since?: string | null;
  limit?: number;
  query?: string | null;
  roleProfileId?: string | null;
  region?: string | null;
  country?: string | null;
  page?: number;
  pageLimit?: number;
  dryRun?: boolean;
  normalizeCreatedDocuments?: boolean;
  normalizeDocument?: (document: MarketRawDocument) => Promise<NormalizedMarketSignal[]>;
  idFactory?: () => string;
  clock?: Clock;
}

export interface MarketIngestionRunnerResult {
  run: MarketIngestionRun;
  fetchResult: MarketSourceFetchResult | null;
  documentsDiscovered: number;
  documentsCreated: number;
  documentsDeduped: number;
  documentsFailed: number;
  signalsCreated: number;
  warnings: string[];
}

export const dbMarketIngestionStore: MarketIngestionStorePort = {
  createRun: createMarketIngestionRun,
  updateRun: updateMarketIngestionRunStatus,
  createRawDocument: createMarketRawDocument,
};

function buildMeta(now: string): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: now,
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(Math.trunc(limit ?? 25), 100));
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value ?? fallback), max));
}

function safeErrorSummary(error: unknown): string {
  const raw = error instanceof Error
    ? `${error.name}: ${error.message || 'Adapter failed without details.'}`
    : String(error || 'Adapter failed without details.');
  const redacted = raw
    .replace(/(api[_-]?key|token|secret|password|credential)(=|:)\s*[^,\s;]+/gi, '$1$2 [redacted]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]');
  return redacted.slice(0, 1000) || 'Adapter failed without details.';
}

function stableDocumentPayload(document: MarketRawDocument): string {
  return JSON.stringify({
    sourceDocumentId: document.sourceDocumentId,
    url: document.url,
    title: document.title,
    publisher: document.publisher,
    region: document.region,
    publishedAt: document.publishedAt,
    extractedText: document.extractedText,
  });
}

export function calculateMarketRawDocumentChecksum(document: MarketRawDocument): string {
  return `sha256:${createHash('sha256').update(stableDocumentPayload(document)).digest('hex')}`;
}

export function buildMarketRawDocumentDedupeKey(document: MarketRawDocument): string {
  return [
    document.sourceId,
    document.sourceDocumentId || document.url || document.title,
    document.region ?? 'global',
  ]
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-')
    .slice(0, 500);
}

function normalizeRawDocument(
  document: MarketRawDocument,
  source: MarketSource,
  runId: string,
  now: string,
): MarketRawDocument {
  const sourceDocumentId = document.sourceDocumentId.trim();
  const normalized: MarketRawDocument = {
    ...document,
    id: document.id || `market_raw_${randomUUID()}`,
    sourceId: source.id,
    ingestionRunId: runId,
    sourceDocumentId,
    region: document.region ?? source.region,
    capturedAt: document.capturedAt || now,
    sourceRef: {
      ...document.sourceRef,
      id: document.sourceRef.id || sourceDocumentId,
      sourceType: source.sourceRefType,
      region: document.sourceRef.region ?? document.region ?? source.region,
      capturedAt: document.sourceRef.capturedAt || now,
    },
    meta: document.meta ?? buildMeta(now),
  };
  return {
    ...normalized,
    dedupeKey: document.dedupeKey || buildMarketRawDocumentDedupeKey(normalized),
    checksum: calculateMarketRawDocumentChecksum(normalized),
  };
}

async function closeFailedRun(
  store: MarketIngestionStorePort,
  run: MarketIngestionRun,
  error: unknown,
  now: string,
): Promise<MarketIngestionRunnerResult> {
  const failedRun = await store.updateRun(run.id, {
    status: 'failed',
    completedAt: now,
    documentsDiscovered: 0,
    documentsCreated: 0,
    documentsDeduped: 0,
    documentsFailed: 0,
    errorSummary: safeErrorSummary(error),
  });

  return {
    run: failedRun,
    fetchResult: null,
    documentsDiscovered: 0,
    documentsCreated: 0,
    documentsDeduped: 0,
    documentsFailed: 0,
    signalsCreated: 0,
    warnings: [],
  };
}

export async function runMarketSourceIngestion({
  source,
  adapter,
  store = dbMarketIngestionStore,
  requestedBy = 'operator',
  since = null,
  limit,
  query = null,
  roleProfileId = null,
  region = null,
  country = null,
  page,
  pageLimit,
  dryRun = false,
  normalizeCreatedDocuments,
  normalizeDocument = normalizeAndPersistMarketRawDocument,
  idFactory = randomUUID,
  clock = { now: () => new Date().toISOString() },
}: RunMarketSourceIngestionInput): Promise<MarketIngestionRunnerResult> {
  const startedAt = clock.now();
  if (!adapter.supports(source)) {
    throw new UnsupportedMarketSourceError(adapter.name, source);
  }

  const run: MarketIngestionRun = {
    id: `market_run_${idFactory()}`,
    sourceId: source.id,
    adapterName: adapter.name,
    status: 'running',
    requestedBy,
    startedAt,
    completedAt: null,
    documentsDiscovered: 0,
    documentsCreated: 0,
    documentsDeduped: 0,
    documentsFailed: 0,
    errorSummary: null,
    meta: buildMeta(startedAt),
  };
  assertValidMarketIngestionRun(run);

  const savedRun = await store.createRun(run, {
    since,
    limit: clampLimit(limit),
    query,
    roleProfileId,
    region,
    country,
    page: clampPositiveInteger(page, 1, 1_000),
    pageLimit: clampPositiveInteger(pageLimit, 1, 50),
    dryRun,
    adapterName: adapter.name,
  });

  try {
    const request = {
      source,
      runId: savedRun.id,
      since,
      limit: clampLimit(limit),
      query,
      roleProfileId,
      region,
      country,
      page: clampPositiveInteger(page, 1, 1_000),
      pageLimit: clampPositiveInteger(pageLimit, 1, 50),
      dryRun,
    };
    assertValidMarketSourceFetchRequest(request);

    const fetchResult = await adapter.fetch(request);
    assertValidMarketSourceFetchResult(fetchResult);

    const completedAt = clock.now();
    const documents = fetchResult.documents
      .slice(0, request.limit)
      .map((document) => normalizeRawDocument(document, source, savedRun.id, completedAt));
    let documentsCreated = 0;
    let documentsDeduped = 0;
    let documentsFailed = 0;
    let signalsCreated = 0;
    const shouldNormalizeCreatedDocuments =
      normalizeCreatedDocuments ?? store === dbMarketIngestionStore;

    if (!dryRun) {
      for (const document of documents) {
        try {
          assertValidMarketRawDocument(document);
          const result = await store.createRawDocument(document);
          if (result.created) {
            documentsCreated += 1;
            if (shouldNormalizeCreatedDocuments) {
              const signals = await normalizeDocument(result.document);
              signalsCreated += signals.length;
            }
          } else {
            documentsDeduped += 1;
          }
        } catch {
          documentsFailed += 1;
        }
      }
    }

    const update: UpdateMarketIngestionRunInput = {
      status: documentsFailed > 0 ? 'partial' : 'succeeded',
      completedAt,
      documentsDiscovered: documents.length,
      documentsCreated,
      documentsDeduped,
      documentsFailed,
      errorSummary:
        documentsFailed > 0
          ? `${documentsFailed} documents failed validation, persistence, or normalization.`
          : null,
      metadata: {
        warningCount: fetchResult.warnings.length,
        dryRun,
        signalsCreated,
      },
    };
    const closedRun = await store.updateRun(savedRun.id, update);

    return {
      run: closedRun,
      fetchResult,
      documentsDiscovered: documents.length,
      documentsCreated,
      documentsDeduped,
      documentsFailed,
      signalsCreated,
      warnings: fetchResult.warnings,
    };
  } catch (error) {
    return closeFailedRun(store, savedRun, error, clock.now());
  }
}
