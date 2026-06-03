import {
  collectRoleMarketProfileCopyBlocks,
  evaluateRoleMarketCopySafety,
  assertValidRoleMarketProfile,
  roleMarketProfileFixtures,
  type MarketProfileValidationResult,
  type MarketSource,
  type MarketSourceHealth,
  type SourceMode,
} from '@daily-push/shared';
import { config } from '../config';
import { pool } from '../db/postgres';
import { KNOWN_ENTITLEMENT_KEYS } from './billingPlans';
import { getConfiguredLiveMarketSources } from './liveMarketSourceConfig';
import { getOperatorMarketSourcesResponse } from './liveMarketSourceHealth';

const ALLOWED_SOURCE_MODES = new Set(['curated', 'hybrid', 'live']);
const MAX_MARKET_DATA_AGE_DAYS = 180;
const MAX_MARKET_DATA_FUTURE_SKEW_DAYS = 7;
const LIVE_MARKET_TABLES = [
  'role_market_sources',
  'role_market_ingestion_runs',
  'role_market_raw_documents',
  'role_market_normalized_signals',
  'role_market_signal_aggregates',
  'role_market_profile_versions',
  'role_market_publish_audit',
  'role_taxonomy_roles',
  'role_taxonomy_aliases',
  'skill_taxonomy_items',
  'skill_taxonomy_aliases',
];
const LIVE_MARKET_REVIEW_TABLES = [
  'role_market_profile_versions',
  'role_market_publish_audit',
];
const LIVE_MARKET_PROFILE_VERSION_ROLLBACK_COLUMNS = [
  'id',
  'role_profile_id',
  'status',
  'source_mode',
  'aggregate_id',
  'validation_result',
  'published_at',
  'rollback_of_version_id',
];
const LIVE_MARKET_PUBLISH_AUDIT_ROLLBACK_COLUMNS = [
  'id',
  'profile_version_id',
  'action',
  'actor_user_id',
  'reason',
  'before_status',
  'after_status',
  'created_at',
];

export interface StartupCheckFailure {
  code: string;
  message: string;
}

interface StartupCheckWarning {
  code: string;
  message: string;
}

interface PublishedProfileAvailability {
  profileTableExists: boolean;
  aggregateTableExists: boolean;
  publishedCount: number;
  freshCount: number;
  latestPublishedAt: string | null;
  queryError: string | null;
}

export interface LiveModeStartupGatePolicy {
  profileFreshnessMaxHours: number;
  sourceStaleAfterHours: number;
  minimumSampleSize: number;
  minimumSourceCount: number;
  requiredSourceMode: SourceMode;
}

export interface LiveModePublishedProfileStartupSnapshot {
  roleProfileId: string;
  profileVersionId: string;
  sourceMode: SourceMode;
  publishedAt: string | null;
  aggregateId: string | null;
  sampleSize: number | null;
  sourceCount: number | null;
  aggregateFreshnessHours: number | null;
  validationResult: MarketProfileValidationResult | null;
}

export interface LiveModeSourceHealthStartupSnapshot {
  sourceId: string;
  sourceName: string;
  sourceStatus: MarketSource['status'];
  healthStatus: MarketSourceHealth['status'];
  latestRunStatus: MarketSourceHealth['latestRunStatus'];
  lastSuccessfulRunAt: string | null;
  freshnessAgeHours: number | null;
  signalsLastRun: number;
}

export interface LiveModeRollbackAuditPathSnapshot {
  profileVersionTableReady: boolean;
  publishAuditTableReady: boolean;
  profileVersionColumnsReady: boolean;
  publishAuditColumnsReady: boolean;
}

export interface EvaluateLiveModeStartupGateInput {
  activeRoleIds: string[];
  configuredSourceIds: string[];
  publishedProfiles: LiveModePublishedProfileStartupSnapshot[];
  sourceHealth: LiveModeSourceHealthStartupSnapshot[];
  rollbackAuditPath: LiveModeRollbackAuditPathSnapshot;
  policy: LiveModeStartupGatePolicy;
  nowMs?: number;
}

interface LiveModeProfileRow {
  id: string;
  role_profile_id: string;
  source_mode: SourceMode;
  published_at: string | null;
  aggregate_id: string | null;
  validation_result: MarketProfileValidationResult | null;
  sample_size: number | null;
  source_count: number | null;
  aggregate_freshness_hours: number | null;
}

function hasLlmProviderConfig(): boolean {
  if (config.llm.provider === 'anthropic') {
    return Boolean(config.anthropic.apiKey.trim());
  }
  if (config.llm.provider === 'openai') {
    return Boolean(config.openai.apiKey.trim());
  }
  if (config.llm.provider === 'ollama') {
    return Boolean(config.llm.baseUrl.trim());
  }
  return false;
}

function requireKnownEntitlement(
  featureKey: string,
  failures: StartupCheckFailure[],
): void {
  if (!KNOWN_ENTITLEMENT_KEYS.includes(featureKey)) {
    failures.push({
      code: 'missing_entitlement_key',
      message: `Role Market feature references entitlement key '${featureKey}', but billing plans do not define it.`,
    });
  }
}

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
          FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );
  return Boolean(rows[0]?.exists);
}

async function requireTables(
  tableNames: string[],
  failures: StartupCheckFailure[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const tableName of tableNames) {
    if (!(await tableExists(tableName))) {
      missing.push(tableName);
      failures.push({
        code: 'missing_role_market_table',
        message: `Role Market feature is enabled but required table '${tableName}' is missing.`,
      });
    }
  }
  return missing;
}

async function tableColumnsExist(
  tableName: string,
  columnNames: string[],
): Promise<Set<string>> {
  const { rows } = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = ANY($2::text[])
    `,
    [tableName, columnNames],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function requireTableColumns(
  tableName: string,
  columnNames: string[],
  failures: StartupCheckFailure[],
): Promise<string[]> {
  const existing = await tableColumnsExist(tableName, columnNames);
  const missing: string[] = [];
  for (const columnName of columnNames) {
    if (existing.has(columnName)) continue;
    missing.push(columnName);
    failures.push({
      code: 'missing_role_market_column',
      message:
        `Role Market feature is enabled but required column '${tableName}.${columnName}' is missing. Run the latest migrations.`,
    });
  }
  return missing;
}

function validatePositiveIntConfig(
  value: number,
  envName: string,
  failures: StartupCheckFailure[],
): void {
  if (!Number.isInteger(value) || value <= 0) {
    failures.push({
      code: 'invalid_live_market_config',
      message: `${envName} must be a positive integer.`,
    });
  }
}

function validateConfidenceConfig(
  value: number,
  envName: string,
  failures: StartupCheckFailure[],
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    failures.push({
      code: 'invalid_live_market_config',
      message: `${envName} must be a number between 0 and 1.`,
    });
  }
}

async function getPublishedProfileAvailability(): Promise<PublishedProfileAvailability> {
  const profileTableExists = await tableExists('role_market_profile_versions');
  const aggregateTableExists = await tableExists('role_market_signal_aggregates');

  if (!profileTableExists) {
    return {
      profileTableExists,
      aggregateTableExists,
      publishedCount: 0,
      freshCount: 0,
      latestPublishedAt: null,
      queryError: null,
    };
  }

  try {
    const query = aggregateTableExists
      ? `
        SELECT
          COUNT(*) FILTER (WHERE p.status = 'published')::int AS published_count,
          COUNT(*) FILTER (
            WHERE p.status = 'published'
              AND p.published_at IS NOT NULL
              AND p.published_at >= NOW() - ($1::int * INTERVAL '1 hour')
              AND COALESCE(a.sample_size, 0) >= $2
          )::int AS fresh_count,
          MAX(p.published_at) FILTER (WHERE p.status = 'published') AS latest_published_at
          FROM role_market_profile_versions p
          LEFT JOIN role_market_signal_aggregates a ON a.id = p.aggregate_id
      `
      : `
        SELECT
          COUNT(*) FILTER (WHERE status = 'published')::int AS published_count,
          0::int AS fresh_count,
          MAX(published_at) FILTER (WHERE status = 'published') AS latest_published_at
          FROM role_market_profile_versions
      `;

    const queryParams = aggregateTableExists
      ? [
          config.roleMarket.liveProfileFreshnessMaxHours,
          config.roleMarket.liveMinimumSampleSize,
        ]
      : [];

    const { rows } = await pool.query<{
      published_count: number;
      fresh_count: number;
      latest_published_at: Date | string | null;
    }>(query, queryParams);

    const latestPublishedAt = rows[0]?.latest_published_at;
    return {
      profileTableExists,
      aggregateTableExists,
      publishedCount: Number(rows[0]?.published_count ?? 0),
      freshCount: Number(rows[0]?.fresh_count ?? 0),
      latestPublishedAt:
        latestPublishedAt instanceof Date
          ? latestPublishedAt.toISOString()
          : latestPublishedAt,
      queryError: null,
    };
  } catch (error) {
    return {
      profileTableExists,
      aggregateTableExists,
      publishedCount: 0,
      freshCount: 0,
      latestPublishedAt: null,
      queryError: error instanceof Error ? error.message : 'Unknown published profile query error.',
    };
  }
}

function hoursSince(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (nowMs - timestamp) / (60 * 60 * 1000));
}

function validationBlocksPublish(
  validationResult: MarketProfileValidationResult | null,
): string[] {
  if (!validationResult) return ['missing_validation_result'];
  const blockerCodes = new Set<string>(
    validationResult.findings
      .filter((finding) => finding.severity === 'blocker')
      .map((finding) => finding.code),
  );
  if (!validationResult.canPublish) blockerCodes.add('can_publish_false');
  if (validationResult.status === 'blocked') blockerCodes.add('validation_status_blocked');
  return [...blockerCodes];
}

export function evaluateLiveModeStartupGate(
  input: EvaluateLiveModeStartupGateInput,
): StartupCheckFailure[] {
  const failures: StartupCheckFailure[] = [];
  const nowMs = input.nowMs ?? Date.now();
  const activeRoleIds = [...new Set(input.activeRoleIds.map((roleId) => roleId.trim()).filter(Boolean))];
  const configuredSourceIds = [
    ...new Set(input.configuredSourceIds.map((sourceId) => sourceId.trim()).filter(Boolean)),
  ];
  const profilesByRoleId = new Map(
    input.publishedProfiles.map((profile) => [profile.roleProfileId, profile]),
  );
  const sourceHealthById = new Map(
    input.sourceHealth.map((sourceHealth) => [sourceHealth.sourceId, sourceHealth]),
  );

  if (activeRoleIds.length === 0) {
    failures.push({
      code: 'live_market_no_active_roles_configured',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires at least one configured active role profile. Restore curated role profiles or configure the active role list before launch.',
    });
  }

  for (const roleProfileId of activeRoleIds) {
    const profile = profilesByRoleId.get(roleProfileId);
    if (!profile) {
      failures.push({
        code: 'live_market_missing_role_profile',
        message:
          `ROLE_MARKET_SOURCE_MODE=live requires a reviewed published profile for active role '${roleProfileId}'. Generate, validate, and publish a live profile before switching to live mode.`,
      });
      continue;
    }

    if (profile.sourceMode !== input.policy.requiredSourceMode) {
      failures.push({
        code: 'live_market_profile_wrong_source_mode',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' has source_mode='${profile.sourceMode}'. Live mode requires source_mode='${input.policy.requiredSourceMode}'. Regenerate and publish the profile in live mode.`,
      });
    }

    const publishedAgeHours = hoursSince(profile.publishedAt, nowMs);
    if (publishedAgeHours === null) {
      failures.push({
        code: 'live_market_profile_missing_published_at',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' has no valid published_at timestamp. Republish the profile through the operator review flow.`,
      });
    } else if (publishedAgeHours > input.policy.profileFreshnessMaxHours) {
      failures.push({
        code: 'live_market_profile_stale',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' is ${Math.round(publishedAgeHours)} hour(s) old. Live mode requires profiles newer than ${input.policy.profileFreshnessMaxHours} hour(s). Refresh sources, synthesize a new draft, and publish it.`,
      });
    }

    const blockerCodes = validationBlocksPublish(profile.validationResult);
    if (blockerCodes.length > 0) {
      failures.push({
        code: 'live_market_profile_validation_blocked',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' has publish-blocking validation state (${blockerCodes.join(', ')}). Re-run draft validation and republish only after blockers are cleared.`,
      });
    }

    if (!profile.aggregateId) {
      failures.push({
        code: 'live_market_profile_missing_aggregate',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' is not linked to a source aggregate. Rebuild the profile from a validated aggregate before live launch.`,
      });
    }

    if ((profile.sampleSize ?? 0) < input.policy.minimumSampleSize) {
      failures.push({
        code: 'live_market_profile_low_sample',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' has sample size ${profile.sampleSize ?? 0}. Live mode requires at least ${input.policy.minimumSampleSize} source-backed samples.`,
      });
    }

    if ((profile.sourceCount ?? 0) < input.policy.minimumSourceCount) {
      failures.push({
        code: 'live_market_profile_low_source_count',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' has ${profile.sourceCount ?? 0} source(s). Live mode requires at least ${input.policy.minimumSourceCount} independent source(s).`,
      });
    }

    if (profile.aggregateFreshnessHours === null) {
      failures.push({
        code: 'live_market_profile_missing_source_freshness',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' has no aggregate freshness metadata. Re-run aggregation and publish a profile with freshness data.`,
      });
    } else if (profile.aggregateFreshnessHours > input.policy.sourceStaleAfterHours) {
      failures.push({
        code: 'live_market_profile_source_stale',
        message:
          `Published profile '${profile.profileVersionId}' for role '${roleProfileId}' uses source data ${Math.round(profile.aggregateFreshnessHours)} hour(s) old. Live mode blocks data older than ${input.policy.sourceStaleAfterHours} hour(s). Refresh ingestion and republish.`,
      });
    }
  }

  if (configuredSourceIds.length === 0) {
    failures.push({
      code: 'live_market_no_configured_sources',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires at least one enabled configured live source. Enable live ingestion and provide source credentials before launch.',
    });
  }

  for (const sourceId of configuredSourceIds) {
    const health = sourceHealthById.get(sourceId);
    if (!health) {
      failures.push({
        code: 'live_market_source_health_missing',
        message:
          `Configured live source '${sourceId}' has no persisted health record. Run a successful ingestion and source bootstrap before switching to live mode.`,
      });
      continue;
    }

    if (health.sourceStatus !== 'enabled') {
      failures.push({
        code: 'live_market_source_not_enabled',
        message:
          `Configured live source '${sourceId}' is '${health.sourceStatus}'. Enable the source before switching ROLE_MARKET_SOURCE_MODE to live.`,
      });
    }

    if (health.healthStatus !== 'healthy') {
      failures.push({
        code: 'live_market_source_unhealthy',
        message:
          `Configured live source '${sourceId}' health is '${health.healthStatus}' with latest run '${health.latestRunStatus ?? 'none'}'. Resolve source failures and run ingestion successfully before live launch.`,
      });
    }

    if (!health.lastSuccessfulRunAt || health.freshnessAgeHours === null) {
      failures.push({
        code: 'live_market_source_never_succeeded',
        message:
          `Configured live source '${sourceId}' has no successful ingestion timestamp. Run ingestion successfully before enabling live mode.`,
      });
    } else if (health.freshnessAgeHours > input.policy.sourceStaleAfterHours) {
      failures.push({
        code: 'live_market_source_stale',
        message:
          `Configured live source '${sourceId}' last succeeded ${Math.round(health.freshnessAgeHours)} hour(s) ago. Live mode requires source health fresher than ${input.policy.sourceStaleAfterHours} hour(s).`,
      });
    }

    if (health.signalsLastRun <= 0) {
      failures.push({
        code: 'live_market_source_no_signals',
        message:
          `Configured live source '${sourceId}' produced 0 normalized signals in its latest run. Fix normalization or source queries before live launch.`,
      });
    }
  }

  if (!input.rollbackAuditPath.profileVersionTableReady) {
    failures.push({
      code: 'live_market_rollback_profile_table_missing',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires role_market_profile_versions so published profiles can be rolled back safely. Run live profile migrations before launch.',
    });
  }

  if (!input.rollbackAuditPath.publishAuditTableReady) {
    failures.push({
      code: 'live_market_rollback_audit_table_missing',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires role_market_publish_audit so publish/reject/rollback actions are auditable. Run live profile migrations before launch.',
    });
  }

  if (!input.rollbackAuditPath.profileVersionColumnsReady) {
    failures.push({
      code: 'live_market_rollback_profile_columns_missing',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires rollback/version columns on role_market_profile_versions. Run the latest live profile migrations before launch.',
    });
  }

  if (!input.rollbackAuditPath.publishAuditColumnsReady) {
    failures.push({
      code: 'live_market_rollback_audit_columns_missing',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires action/status/reason columns on role_market_publish_audit. Run the latest live profile migrations before launch.',
    });
  }

  return failures;
}

async function getLiveModePublishedProfileSnapshots(
  activeRoleIds: string[],
): Promise<LiveModePublishedProfileStartupSnapshot[]> {
  if (activeRoleIds.length === 0) return [];

  const { rows } = await pool.query<LiveModeProfileRow>(
    `
      SELECT DISTINCT ON (p.role_profile_id)
             p.id,
             p.role_profile_id,
             p.source_mode,
             p.published_at::text,
             p.aggregate_id,
             p.validation_result,
             a.sample_size,
             a.source_count,
             NULLIF(a.aggregate_json->>'freshnessHours', '')::double precision AS aggregate_freshness_hours
        FROM role_market_profile_versions p
        LEFT JOIN role_market_signal_aggregates a ON a.id = p.aggregate_id
       WHERE p.role_profile_id = ANY($1::text[])
         AND p.status = 'published'
       ORDER BY p.role_profile_id,
                p.published_at DESC NULLS LAST,
                p.version DESC
    `,
    [activeRoleIds],
  );

  return rows.map((row) => ({
    roleProfileId: row.role_profile_id,
    profileVersionId: row.id,
    sourceMode: row.source_mode,
    publishedAt: row.published_at,
    aggregateId: row.aggregate_id,
    sampleSize: row.sample_size === null ? null : Number(row.sample_size),
    sourceCount: row.source_count === null ? null : Number(row.source_count),
    aggregateFreshnessHours:
      row.aggregate_freshness_hours === null ? null : Number(row.aggregate_freshness_hours),
    validationResult: row.validation_result,
  }));
}

async function getLiveModeSourceHealthSnapshots(): Promise<LiveModeSourceHealthStartupSnapshot[]> {
  const response = await getOperatorMarketSourcesResponse();
  return response.sources.map((item) => ({
    sourceId: item.source.id,
    sourceName: item.source.name,
    sourceStatus: item.source.status,
    healthStatus: item.health.status,
    latestRunStatus: item.health.latestRunStatus,
    lastSuccessfulRunAt: item.health.lastSuccessfulRunAt,
    freshnessAgeHours: item.health.freshnessAgeHours,
    signalsLastRun: item.health.signalsLastRun,
  }));
}

async function validateLiveModeLaunchGate(input: {
  failures: StartupCheckFailure[];
  missingRoleMarketTables: string[];
  missingProfileVersionColumns: string[];
  missingPublishAuditColumns: string[];
}): Promise<void> {
  const { failures } = input;

  if (config.roleMarket.sourceMode !== 'live') return;

  if (!config.roleMarket.featurePublic) {
    failures.push({
      code: 'live_market_public_feature_disabled',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires FEATURE_ROLE_MARKET_PUBLIC=true so public role-market APIs can serve reviewed live profiles.',
    });
  }

  if (!config.roleMarket.featureLiveIngestion) {
    failures.push({
      code: 'live_market_ingestion_disabled',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires FEATURE_ROLE_MARKET_LIVE_INGESTION=true so source registration and source health checks are active.',
    });
  }

  if (!config.roleMarket.featureOperatorReview) {
    failures.push({
      code: 'live_market_operator_review_disabled',
      message:
        'ROLE_MARKET_SOURCE_MODE=live requires FEATURE_ROLE_MARKET_OPERATOR_REVIEW=true so every live profile is reviewed, published, and rollbackable.',
    });
  }

  const roleMarketTablesReady = input.missingRoleMarketTables.length === 0;
  const rollbackAuditPath: LiveModeRollbackAuditPathSnapshot = {
    profileVersionTableReady: !input.missingRoleMarketTables.includes('role_market_profile_versions'),
    publishAuditTableReady: !input.missingRoleMarketTables.includes('role_market_publish_audit'),
    profileVersionColumnsReady: input.missingProfileVersionColumns.length === 0,
    publishAuditColumnsReady: input.missingPublishAuditColumns.length === 0,
  };

  if (!roleMarketTablesReady) {
    failures.push(
      ...evaluateLiveModeStartupGate({
        activeRoleIds: roleMarketProfileFixtures.map((profile) => profile.id),
        configuredSourceIds: getConfiguredLiveMarketSources().map((source) => source.id),
        publishedProfiles: [],
        sourceHealth: [],
        rollbackAuditPath,
        policy: {
          profileFreshnessMaxHours: config.roleMarket.liveProfileFreshnessMaxHours,
          sourceStaleAfterHours: config.roleMarket.liveSourceStaleAfterHours,
          minimumSampleSize: config.roleMarket.liveMinimumSampleSize,
          minimumSourceCount: config.roleMarket.liveMinimumSourceCount,
          requiredSourceMode: 'live',
        },
      }).filter((failure) => failure.code.startsWith('live_market_rollback_')),
    );
    return;
  }

  let publishedProfiles: LiveModePublishedProfileStartupSnapshot[] = [];
  try {
    publishedProfiles = await getLiveModePublishedProfileSnapshots(
      roleMarketProfileFixtures.map((profile) => profile.id),
    );
  } catch (error) {
    failures.push({
      code: 'live_market_profile_query_failed',
      message:
        `ROLE_MARKET_SOURCE_MODE=live could not verify per-role published profiles: ${error instanceof Error ? error.message : 'Unknown profile query error.'}`,
    });
    return;
  }

  let sourceHealth: LiveModeSourceHealthStartupSnapshot[] = [];
  try {
    sourceHealth = await getLiveModeSourceHealthSnapshots();
  } catch (error) {
    failures.push({
      code: 'live_market_source_health_query_failed',
      message:
        `ROLE_MARKET_SOURCE_MODE=live could not verify source health: ${error instanceof Error ? error.message : 'Unknown source health query error.'}`,
    });
    return;
  }

  failures.push(
    ...evaluateLiveModeStartupGate({
      activeRoleIds: roleMarketProfileFixtures.map((profile) => profile.id),
      configuredSourceIds: getConfiguredLiveMarketSources().map((source) => source.id),
      publishedProfiles,
      sourceHealth,
      rollbackAuditPath,
      policy: {
        profileFreshnessMaxHours: config.roleMarket.liveProfileFreshnessMaxHours,
        sourceStaleAfterHours: config.roleMarket.liveSourceStaleAfterHours,
        minimumSampleSize: config.roleMarket.liveMinimumSampleSize,
        minimumSourceCount: config.roleMarket.liveMinimumSourceCount,
        requiredSourceMode: 'live',
      },
    }),
  );
}

function validatePublicMarketConfig(failures: StartupCheckFailure[]): void {
  if (!config.roleMarket.featurePublic) return;

  requireKnownEntitlement('market_recommendations.daily', failures);

  if (!config.roleMarket.seedVersion.trim()) {
    failures.push({
      code: 'missing_seed_version',
      message: 'FEATURE_ROLE_MARKET_PUBLIC=true requires ROLE_MARKET_SEED_VERSION.',
    });
  }

  if (!config.roleMarket.lastUpdated.trim()) {
    failures.push({
      code: 'missing_last_updated',
      message: 'FEATURE_ROLE_MARKET_PUBLIC=true requires ROLE_MARKET_LAST_UPDATED.',
    });
  } else {
    const lastUpdated = new Date(config.roleMarket.lastUpdated);
    if (Number.isNaN(lastUpdated.getTime())) {
      failures.push({
        code: 'invalid_last_updated',
        message: 'ROLE_MARKET_LAST_UPDATED must be a valid ISO timestamp.',
      });
    } else {
      const ageDays = (Date.now() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > MAX_MARKET_DATA_AGE_DAYS) {
        failures.push({
          code: 'stale_market_dataset',
          message:
            `ROLE_MARKET_LAST_UPDATED is older than ${MAX_MARKET_DATA_AGE_DAYS} days. Refresh curated market signals before public launch.`,
        });
      }
      if (ageDays < -MAX_MARKET_DATA_FUTURE_SKEW_DAYS) {
        failures.push({
          code: 'future_dated_market_dataset',
          message:
            `ROLE_MARKET_LAST_UPDATED is more than ${MAX_MARKET_DATA_FUTURE_SKEW_DAYS} days in the future. Check the configured timestamp.`,
        });
      }
    }
  }

  if (!ALLOWED_SOURCE_MODES.has(config.roleMarket.sourceMode)) {
    failures.push({
      code: 'invalid_source_mode',
      message:
        'ROLE_MARKET_SOURCE_MODE must be one of: curated, hybrid, live.',
    });
  }

  if (roleMarketProfileFixtures.length === 0) {
    failures.push({
      code: 'missing_seed_data',
      message: 'FEATURE_ROLE_MARKET_PUBLIC=true requires at least one role profile seed.',
    });
    return;
  }

  for (const profile of roleMarketProfileFixtures) {
    try {
      assertValidRoleMarketProfile(profile);
    } catch (error) {
      failures.push({
        code: 'invalid_seed_data',
        message:
          error instanceof Error
            ? error.message
            : 'Role Market seed data failed validation.',
      });
    }
  }

  const copySafety = evaluateRoleMarketCopySafety(
    roleMarketProfileFixtures.flatMap((profile) =>
      collectRoleMarketProfileCopyBlocks(profile),
    ),
  );
  if (!copySafety.valid) {
    failures.push({
      code: 'unsafe_market_copy',
      message:
        `Role Market seed copy failed safety checks: ${copySafety.findings
          .slice(0, 5)
          .map((finding) => `${finding.source}: ${finding.message}`)
          .join('; ')}`,
    });
  }
}

async function validateLiveMarketStartupGuards(
  failures: StartupCheckFailure[],
  warnings: StartupCheckWarning[],
): Promise<void> {
  validatePositiveIntConfig(
    config.roleMarket.liveProfileFreshnessMaxHours,
    'ROLE_MARKET_LIVE_PROFILE_MAX_AGE_HOURS',
    failures,
  );
  validatePositiveIntConfig(
    config.roleMarket.liveSourceStaleAfterHours,
    'ROLE_MARKET_SOURCE_STALE_AFTER_HOURS',
    failures,
  );
  validatePositiveIntConfig(
    config.roleMarket.liveMinimumSampleSize,
    'ROLE_MARKET_LIVE_MIN_SAMPLE_SIZE',
    failures,
  );
  validatePositiveIntConfig(
    config.roleMarket.liveMinimumSourceCount,
    'ROLE_MARKET_LIVE_MIN_SOURCE_COUNT',
    failures,
  );
  validateConfidenceConfig(
    config.roleMarket.liveMinimumConfidence,
    'ROLE_MARKET_LIVE_MIN_CONFIDENCE',
    failures,
  );
  validatePositiveIntConfig(
    config.roleMarket.adzunaMaxRetries + 1,
    'ROLE_MARKET_ADZUNA_MAX_RETRIES',
    failures,
  );
  validatePositiveIntConfig(
    config.roleMarket.adzunaRetryBaseDelayMs,
    'ROLE_MARKET_ADZUNA_RETRY_BASE_DELAY_MS',
    failures,
  );
  validatePositiveIntConfig(
    config.roleMarket.adzunaRequestTimeoutMs,
    'ROLE_MARKET_ADZUNA_REQUEST_TIMEOUT_MS',
    failures,
  );

  if (config.roleMarket.featureOperatorReview && config.operators.emails.length === 0) {
    failures.push({
      code: 'missing_operator_emails',
      message:
        'FEATURE_ROLE_MARKET_OPERATOR_REVIEW=true requires OPERATOR_EMAILS so draft review and publish actions are accountable.',
    });
  }

  const roleMarketRequiredTables = new Set<string>();
  if (config.roleMarket.featureLiveIngestion || config.roleMarket.sourceMode === 'live') {
    LIVE_MARKET_TABLES.forEach((tableName) => roleMarketRequiredTables.add(tableName));
    if (
      !config.roleMarket.sourceCredentials.adzunaAppId.trim() ||
      !config.roleMarket.sourceCredentials.adzunaAppKey.trim()
    ) {
      failures.push({
        code: 'missing_adzuna_credentials',
        message:
          'FEATURE_ROLE_MARKET_LIVE_INGESTION=true requires ADZUNA_APP_ID and ADZUNA_APP_KEY before the Adzuna job-post adapter can run.',
      });
    }
  }

  if (config.roleMarket.featureOperatorReview || config.roleMarket.sourceMode === 'live') {
    LIVE_MARKET_REVIEW_TABLES.forEach((tableName) => roleMarketRequiredTables.add(tableName));
  }

  const missingRoleMarketTables = roleMarketRequiredTables.size > 0
    ? await requireTables([...roleMarketRequiredTables], failures)
    : [];
  const missingProfileVersionColumns =
    !missingRoleMarketTables.includes('role_market_profile_versions') &&
    (config.roleMarket.featureOperatorReview || config.roleMarket.sourceMode === 'live')
      ? await requireTableColumns(
          'role_market_profile_versions',
          LIVE_MARKET_PROFILE_VERSION_ROLLBACK_COLUMNS,
          failures,
        )
      : [];
  const missingPublishAuditColumns =
    !missingRoleMarketTables.includes('role_market_publish_audit') &&
    (config.roleMarket.featureOperatorReview || config.roleMarket.sourceMode === 'live')
      ? await requireTableColumns(
          'role_market_publish_audit',
          LIVE_MARKET_PUBLISH_AUDIT_ROLLBACK_COLUMNS,
          failures,
        )
      : [];

  if (config.roleMarket.sourceMode === 'live') {
    await validateLiveModeLaunchGate({
      failures,
      missingRoleMarketTables,
      missingProfileVersionColumns,
      missingPublishAuditColumns,
    });
    return;
  }

  if (
    !config.roleMarket.featurePublic ||
    config.roleMarket.sourceMode === 'curated' ||
    !ALLOWED_SOURCE_MODES.has(config.roleMarket.sourceMode)
  ) {
    return;
  }

  const availability = await getPublishedProfileAvailability();

  if (!availability.profileTableExists || !availability.aggregateTableExists) {
    warnings.push({
      code: 'hybrid_market_missing_live_tables',
      message:
        'ROLE_MARKET_SOURCE_MODE=hybrid will use curated fallback because live profile tables are not available yet.',
    });
    return;
  }

  if (availability.queryError) {
    warnings.push({
      code: 'hybrid_market_profile_query_failed',
      message:
        `ROLE_MARKET_SOURCE_MODE=hybrid will use curated fallback because published profiles could not be checked: ${availability.queryError}`,
    });
    return;
  }

  if (availability.publishedCount === 0) {
    warnings.push({
      code: 'hybrid_market_no_published_profiles',
      message:
        'ROLE_MARKET_SOURCE_MODE=hybrid will use curated fallback because no published live profiles exist yet.',
    });
  } else if (availability.freshCount === 0) {
    warnings.push({
      code: 'hybrid_market_stale_or_low_sample_profiles',
      message:
        `ROLE_MARKET_SOURCE_MODE=hybrid will use curated fallback because published profiles are older than ${config.roleMarket.liveProfileFreshnessMaxHours} hours or below sample size ${config.roleMarket.liveMinimumSampleSize}. Latest published profile: ${availability.latestPublishedAt ?? 'none'}.`,
    });
  }
}

export async function validateRoleMarketStartupConfig(): Promise<void> {
  const failures: StartupCheckFailure[] = [];
  const warnings: StartupCheckWarning[] = [];

  if (
    !config.roleMarket.featurePublic &&
    (config.roleMarket.featureTargetRoleSave || config.roleMarket.featureReadinessReport)
  ) {
    failures.push({
      code: 'invalid_role_market_feature_dependency',
      message:
        'FEATURE_TARGET_ROLE_SAVE and FEATURE_ROLE_READINESS_REPORT require FEATURE_ROLE_MARKET_PUBLIC=true because they depend on curated role profiles.',
    });
  }

  if (config.roleMarket.featureReadinessReport && !config.roleMarket.featureTargetRoleSave) {
    failures.push({
      code: 'invalid_role_market_feature_dependency',
      message:
        'FEATURE_ROLE_READINESS_REPORT=true requires FEATURE_TARGET_ROLE_SAVE=true so users can create Target Role workspaces.',
    });
  }

  validatePublicMarketConfig(failures);
  await validateLiveMarketStartupGuards(failures, warnings);

  if (config.roleMarket.featureAiSummary && !hasLlmProviderConfig()) {
    failures.push({
      code: 'missing_ai_provider_config',
      message:
        'FEATURE_ROLE_MARKET_AI_SUMMARY=true requires provider configuration for the selected LLM_PROVIDER.',
    });
  }

  if (config.roleMarket.featureTargetRoleSave) {
    requireKnownEntitlement('target_roles.saved.max', failures);
    await requireTables(['candidate_target_roles'], failures);
  }

  if (config.roleMarket.featureReadinessReport) {
    requireKnownEntitlement('role_readiness_reports.monthly', failures);
    requireKnownEntitlement('role_comparisons.monthly', failures);
    requireKnownEntitlement('readiness_reassessments.monthly', failures);
    await requireTables(
      [
        'candidate_target_roles',
        'candidate_role_assessments',
        'candidate_readiness_history',
        'candidate_evidence_claims',
        'candidate_upgrade_plans',
      ],
      failures,
    );
    await requireTableColumns(
      'candidate_role_assessments',
      [
        'profile_version_id',
        'profile_source_mode',
        'profile_published_at',
        'profile_warnings',
      ],
      failures,
    );
  }

  if (warnings.length > 0) {
    console.warn(
      [
        'Role Market startup warnings:',
        ...warnings.map((warning) => `- ${warning.code}: ${warning.message}`),
      ].join('\n'),
    );
  }

  if (failures.length > 0) {
    const error = new Error(
      [
        'Role Market startup validation failed:',
        ...failures.map((failure) => `- ${failure.code}: ${failure.message}`),
      ].join('\n'),
    );
    (error as Error & { code?: string }).code = 'role_market_startup_invalid';
    throw error;
  }
}
