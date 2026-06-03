import cron, { type ScheduledTask } from 'node-cron';
import type {
  MarketSource,
} from '@daily-push/shared';
import { config } from '../config';
import { upsertConfiguredLiveMarketSources } from './liveMarketSourceConfig';
import {
  runMarketSourceIngestion,
  type MarketIngestionRunnerResult,
} from './liveMarketIngestionRunner';
import { getConfiguredMarketSourceAdapter } from './marketSourceAdapterRegistry';
import type { MarketSourceAdapter } from './marketSourceAdapters';

export interface ScheduledLiveMarketIngestionQuery {
  query: string;
  roleProfileId: string | null;
  region: string | null;
  country: string | null;
  limit: number | null;
}

export interface ScheduledLiveMarketIngestionCycleResult {
  skippedDisabled: boolean;
  sourceCount: number;
  queryCount: number;
  startedRuns: number;
  completedRuns: number;
  failedRuns: number;
  skippedDuplicateRuns: number;
  errors: string[];
}

interface LiveMarketIngestionSchedulerOptions {
  schedulerEnabled?: boolean;
  featureLiveIngestion?: boolean;
  schedule?: string;
  queries?: ScheduledLiveMarketIngestionQuery[];
  limit?: number;
  pageLimit?: number;
}

interface LiveMarketIngestionSchedulerDependencies {
  getSources?: () => Promise<MarketSource[]>;
  adapterFactory?: (source: MarketSource) => MarketSourceAdapter;
  runIngestion?: typeof runMarketSourceIngestion;
  activeRunKeys?: Set<string>;
}

export interface LiveMarketIngestionSchedulerHandle {
  enabled: boolean;
  reason: string | null;
  stop(): void;
}

const activeScheduledRunKeys = new Set<string>();

function clampPositiveInteger(value: number | null | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value ?? fallback), max));
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown scheduled ingestion error.');
}

function parseOptionalLimit(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? clampPositiveInteger(parsed, 10, 100) : null;
}

function scheduledRunKey(source: MarketSource, query: ScheduledLiveMarketIngestionQuery): string {
  return [
    source.id,
    query.roleProfileId ?? '',
    query.query,
    query.region ?? '',
    query.country ?? '',
  ]
    .join('|')
    .trim()
    .toLowerCase();
}

export function parseScheduledLiveMarketIngestionQueries(
  raw = config.roleMarket.liveIngestionScheduledQueries,
): ScheduledLiveMarketIngestionQuery[] {
  return raw
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split('|').map((part) => part.trim());
      if (parts.length === 1) {
        return {
          query: parts[0],
          roleProfileId: null,
          region: null,
          country: null,
          limit: null,
        };
      }

      const [roleProfileId, query, region, country, limit] = parts;
      return {
        query,
        roleProfileId: normalizeNullableText(roleProfileId),
        region: normalizeNullableText(region),
        country: normalizeNullableText(country),
        limit: parseOptionalLimit(limit),
      };
    })
    .filter((entry) => entry.query.length > 0);
}

export async function runScheduledLiveMarketIngestionCycle(
  options: LiveMarketIngestionSchedulerOptions = {},
  dependencies: LiveMarketIngestionSchedulerDependencies = {},
): Promise<ScheduledLiveMarketIngestionCycleResult> {
  const featureLiveIngestion = options.featureLiveIngestion ?? config.roleMarket.featureLiveIngestion;
  const queries = options.queries ?? parseScheduledLiveMarketIngestionQueries();
  const result: ScheduledLiveMarketIngestionCycleResult = {
    skippedDisabled: !featureLiveIngestion,
    sourceCount: 0,
    queryCount: queries.length,
    startedRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    skippedDuplicateRuns: 0,
    errors: [],
  };

  if (!featureLiveIngestion) return result;
  if (queries.length === 0) return result;

  const getSources = dependencies.getSources ?? upsertConfiguredLiveMarketSources;
  const adapterFactory = dependencies.adapterFactory ?? getConfiguredMarketSourceAdapter;
  const runIngestion = dependencies.runIngestion ?? runMarketSourceIngestion;
  const activeRunKeys = dependencies.activeRunKeys ?? activeScheduledRunKeys;
  const sources = (await getSources()).filter((source) => source.status === 'enabled');
  result.sourceCount = sources.length;

  for (const source of sources) {
    for (const scheduledQuery of queries) {
      const runKey = scheduledRunKey(source, scheduledQuery);
      if (activeRunKeys.has(runKey)) {
        result.skippedDuplicateRuns += 1;
        continue;
      }

      activeRunKeys.add(runKey);
      result.startedRuns += 1;
      try {
        const ingestionResult: MarketIngestionRunnerResult = await runIngestion({
          source,
          adapter: adapterFactory(source),
          requestedBy: 'scheduler',
          query: scheduledQuery.query,
          roleProfileId: scheduledQuery.roleProfileId,
          region: scheduledQuery.region ?? source.region,
          country: scheduledQuery.country,
          limit: scheduledQuery.limit ?? clampPositiveInteger(
            options.limit ?? config.roleMarket.liveIngestionScheduledLimit,
            10,
            100,
          ),
          page: 1,
          pageLimit: clampPositiveInteger(
            options.pageLimit ?? config.roleMarket.liveIngestionScheduledPageLimit,
            1,
            10,
          ),
          dryRun: false,
        });

        if (ingestionResult.run.status === 'failed') {
          result.failedRuns += 1;
        } else {
          result.completedRuns += 1;
        }
      } catch (error) {
        result.failedRuns += 1;
        result.errors.push(safeErrorMessage(error));
      } finally {
        activeRunKeys.delete(runKey);
      }
    }
  }

  return result;
}

function startScheduledCycle(
  options: LiveMarketIngestionSchedulerOptions,
  dependencies: LiveMarketIngestionSchedulerDependencies,
): void {
  void runScheduledLiveMarketIngestionCycle(options, dependencies)
    .then((result) => {
      if (result.startedRuns > 0 || result.failedRuns > 0) {
        console.log(
          `[live-market-scheduler] Cycle complete: started=${result.startedRuns} completed=${result.completedRuns} failed=${result.failedRuns} duplicates=${result.skippedDuplicateRuns}`,
        );
      }
    })
    .catch((error) => {
      console.error('[live-market-scheduler] Cycle failed:', error);
    });
}

export function startLiveMarketIngestionScheduler(
  options: LiveMarketIngestionSchedulerOptions = {},
  dependencies: LiveMarketIngestionSchedulerDependencies = {},
): LiveMarketIngestionSchedulerHandle {
  const schedulerEnabled =
    options.schedulerEnabled ?? config.roleMarket.liveIngestionSchedulerEnabled;
  const featureLiveIngestion = options.featureLiveIngestion ?? config.roleMarket.featureLiveIngestion;
  const schedule = options.schedule ?? config.roleMarket.liveIngestionSchedule;

  if (!schedulerEnabled) {
    return { enabled: false, reason: 'scheduler_disabled', stop() {} };
  }

  if (!featureLiveIngestion) {
    return { enabled: false, reason: 'live_ingestion_disabled', stop() {} };
  }

  if (!cron.validate(schedule)) {
    console.error(`[live-market-scheduler] Invalid cron schedule: ${schedule}`);
    return { enabled: false, reason: 'invalid_schedule', stop() {} };
  }

  const task: ScheduledTask = cron.schedule(
    schedule,
    () => startScheduledCycle(options, dependencies),
    { scheduled: false },
  );
  task.start();

  return {
    enabled: true,
    reason: null,
    stop() {
      task.stop();
    },
  };
}
