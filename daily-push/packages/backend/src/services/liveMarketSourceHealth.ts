import {
  assertValidMarketSourceHealth,
  assertValidOperatorMarketIngestionRunsResponse,
  assertValidOperatorMarketSourcesResponse,
  type ContractMeta,
  type MarketIngestionRun,
  type MarketIngestionRunStatus,
  type MarketSource,
  type MarketSourceHealth,
  type OperatorMarketIngestionRunsResponse,
  type OperatorMarketSourcesResponse,
} from '@daily-push/shared';
import { config } from '../config';
import { pool } from '../db/postgres';
import {
  getLatestMarketIngestionRun,
  listMarketIngestionRuns,
  listMarketSources,
  type ListMarketIngestionRunsOptions,
} from './liveMarketIngestionStore';

const SUCCESS_STATUSES: MarketIngestionRunStatus[] = ['succeeded', 'partial'];
const FAILURE_STATUSES: MarketIngestionRunStatus[] = ['failed', 'cancelled'];

interface SignalCountRow {
  count: string;
}

function buildMeta(): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function calculateAgeHours(value: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / (60 * 60 * 1000));
}

function completedOrStartedAt(run: MarketIngestionRun | null): string | null {
  if (!run) return null;
  return run.completedAt ?? run.startedAt;
}

function deriveHealthStatus({
  source,
  latestRun,
  lastSuccessfulRun,
  consecutiveFailures,
  freshnessAgeHours,
}: {
  source: MarketSource;
  latestRun: MarketIngestionRun | null;
  lastSuccessfulRun: MarketIngestionRun | null;
  consecutiveFailures: number;
  freshnessAgeHours: number | null;
}): MarketSourceHealth['status'] {
  if (source.status === 'disabled') return 'disabled';
  if (!latestRun) return source.status === 'degraded' ? 'degraded' : 'unknown';
  if (FAILURE_STATUSES.includes(latestRun.status)) {
    return consecutiveFailures >= 3 ? 'down' : 'degraded';
  }
  if (latestRun.status === 'partial') return 'degraded';
  if (!lastSuccessfulRun) return latestRun.status === 'running' ? 'unknown' : 'degraded';
  if (freshnessAgeHours !== null && freshnessAgeHours > source.freshnessSlaHours) {
    return 'degraded';
  }
  if (source.status === 'degraded') return 'degraded';
  return 'healthy';
}

async function getLastSuccessfulRun(sourceId: string): Promise<MarketIngestionRun | null> {
  const runs = await listMarketIngestionRuns({ sourceId, limit: 20 });
  return runs.find((run) => SUCCESS_STATUSES.includes(run.status)) ?? null;
}

async function countConsecutiveFailures(sourceId: string): Promise<number> {
  const runs = await listMarketIngestionRuns({ sourceId, limit: 20 });
  let count = 0;
  for (const run of runs) {
    if (SUCCESS_STATUSES.includes(run.status)) break;
    if (FAILURE_STATUSES.includes(run.status)) count += 1;
  }
  return count;
}

async function countSignalsForRun(runId: string | null): Promise<number> {
  if (!runId) return 0;
  const { rows } = await pool.query<SignalCountRow>(
    `SELECT COUNT(*)::text AS count
       FROM role_market_normalized_signals
      WHERE ingestion_run_id = $1`,
    [runId],
  );
  return Number.parseInt(rows[0]?.count ?? '0', 10) || 0;
}

async function buildHealthForSource(source: MarketSource): Promise<{
  health: MarketSourceHealth;
  latestRun: MarketIngestionRun | null;
}> {
  const latestRun = await getLatestMarketIngestionRun(source.id);
  const lastSuccessfulRun = await getLastSuccessfulRun(source.id);
  const consecutiveFailures = await countConsecutiveFailures(source.id);
  const freshnessAgeHours = calculateAgeHours(completedOrStartedAt(lastSuccessfulRun));
  const signalsLastRun = await countSignalsForRun(latestRun?.id ?? null);
  const health: MarketSourceHealth = {
    sourceId: source.id,
    status: deriveHealthStatus({
      source,
      latestRun,
      lastSuccessfulRun,
      consecutiveFailures,
      freshnessAgeHours,
    }),
    checkedAt: new Date().toISOString(),
    latestRunId: latestRun?.id ?? null,
    latestRunStatus: latestRun?.status ?? null,
    lastSuccessfulRunAt: completedOrStartedAt(lastSuccessfulRun),
    consecutiveFailures,
    freshnessAgeHours,
    documentsLastRun: latestRun?.documentsDiscovered ?? 0,
    signalsLastRun,
    errorSummary: latestRun?.errorSummary ?? null,
    meta: buildMeta(),
  };

  assertValidMarketSourceHealth(health);
  return { health, latestRun };
}

export async function getOperatorMarketSourcesResponse(): Promise<OperatorMarketSourcesResponse> {
  const sources = await listMarketSources();
  const items = await Promise.all(
    sources.map(async (source) => {
      const { health, latestRun } = await buildHealthForSource(source);
      return { source, health, latestRun };
    }),
  );

  const response: OperatorMarketSourcesResponse = {
    sources: items,
    meta: buildMeta(),
  };
  assertValidOperatorMarketSourcesResponse(response);
  return response;
}

export async function getOperatorMarketIngestionRunsResponse(
  options: ListMarketIngestionRunsOptions = {},
): Promise<OperatorMarketIngestionRunsResponse> {
  const response: OperatorMarketIngestionRunsResponse = {
    runs: await listMarketIngestionRuns(options),
    meta: buildMeta(),
  };
  assertValidOperatorMarketIngestionRunsResponse(response);
  return response;
}
