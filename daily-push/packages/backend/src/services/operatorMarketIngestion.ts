import {
  assertValidOperatorMarketIngestionTriggerResponse,
  type ContractMeta,
  type MarketIngestionRun,
  type MarketIngestionRunStatus,
  type MarketSource,
  type OperatorMarketIngestionTriggerResponse,
} from '@daily-push/shared';
import { config } from '../config';
import {
  getMarketSource,
  listMarketIngestionRuns,
} from './liveMarketIngestionStore';
import {
  runMarketSourceIngestion,
  type MarketIngestionRunnerResult,
} from './liveMarketIngestionRunner';
import { getConfiguredMarketSourceAdapter } from './marketSourceAdapterRegistry';
import type { MarketSourceAdapter } from './marketSourceAdapters';

const ACTIVE_RUN_STATUSES: MarketIngestionRunStatus[] = ['queued', 'running'];

export interface OperatorMarketIngestionTriggerInput {
  query: string;
  roleProfileId?: string | null;
  region?: string | null;
  country?: string | null;
  limit?: number;
  page?: number;
  pageLimit?: number;
  dryRun?: boolean;
}

interface OperatorMarketIngestionDependencies {
  getSource?: (sourceId: string) => Promise<MarketSource | null>;
  listRuns?: (options: {
    sourceId?: string | null;
    status?: MarketIngestionRunStatus | null;
    limit?: number;
  }) => Promise<MarketIngestionRun[]>;
  adapterFactory?: (source: MarketSource) => MarketSourceAdapter;
  runIngestion?: typeof runMarketSourceIngestion;
  clock?: { now(): string };
}

class OperatorMarketIngestionError extends Error {
  statusCode: number;

  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function buildMeta(now: string): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: now,
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value ?? fallback), max));
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTriggerResponse(
  status: OperatorMarketIngestionTriggerResponse['status'],
  run: MarketIngestionRun,
  result: MarketIngestionRunnerResult | null,
  now: string,
): OperatorMarketIngestionTriggerResponse {
  const response: OperatorMarketIngestionTriggerResponse = {
    status,
    run,
    result: result
      ? {
          documentsDiscovered: result.documentsDiscovered,
          documentsCreated: result.documentsCreated,
          documentsDeduped: result.documentsDeduped,
          documentsFailed: result.documentsFailed,
          warnings: result.warnings,
        }
      : null,
    meta: buildMeta(now),
  };
  assertValidOperatorMarketIngestionTriggerResponse(response);
  return response;
}

async function getActiveRun(
  sourceId: string,
  listRuns: NonNullable<OperatorMarketIngestionDependencies['listRuns']>,
): Promise<MarketIngestionRun | null> {
  for (const status of ACTIVE_RUN_STATUSES) {
    const [run] = await listRuns({ sourceId, status, limit: 1 });
    if (run) return run;
  }
  return null;
}

export async function triggerOperatorMarketSourceIngestion(
  sourceId: string,
  input: OperatorMarketIngestionTriggerInput,
  dependencies: OperatorMarketIngestionDependencies = {},
): Promise<OperatorMarketIngestionTriggerResponse> {
  const clock = dependencies.clock ?? { now: () => new Date().toISOString() };
  const getSourceById = dependencies.getSource ?? getMarketSource;
  const listRuns = dependencies.listRuns ?? listMarketIngestionRuns;
  const adapterFactory = dependencies.adapterFactory ?? getConfiguredMarketSourceAdapter;
  const runIngestion = dependencies.runIngestion ?? runMarketSourceIngestion;

  const source = await getSourceById(sourceId);
  if (!source) {
    throw new OperatorMarketIngestionError('Market source not found.', 404, 'not_found');
  }
  if (source.status !== 'enabled') {
    throw new OperatorMarketIngestionError(
      'Market source must be enabled before ingestion can run.',
      400,
      'validation_error',
    );
  }

  const activeRun = await getActiveRun(source.id, listRuns);
  if (activeRun) {
    return toTriggerResponse('already_running', activeRun, null, clock.now());
  }

  const query = input.query.trim();
  if (!query) {
    throw new OperatorMarketIngestionError('Query is required.', 400, 'validation_error');
  }

  const result = await runIngestion({
    source,
    adapter: adapterFactory(source),
    requestedBy: 'operator',
    query,
    roleProfileId: normalizeNullableText(input.roleProfileId),
    region: normalizeNullableText(input.region) ?? source.region,
    country: normalizeNullableText(input.country),
    limit: clampPositiveInteger(input.limit, 5, 25),
    page: clampPositiveInteger(input.page, 1, 1_000),
    pageLimit: clampPositiveInteger(input.pageLimit, 1, 3),
    dryRun: Boolean(input.dryRun),
    clock,
  });

  return toTriggerResponse('started', result.run, result, clock.now());
}
