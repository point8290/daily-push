import {
  collectRoleMarketProfileCopyBlocks,
  evaluateRoleMarketCopySafety,
  assertValidRoleMarketProfile,
  roleMarketProfileFixtures,
} from '@daily-push/shared';
import { config } from '../config';
import { pool } from '../db/postgres';
import { KNOWN_ENTITLEMENT_KEYS } from './billingPlans';

const ALLOWED_SOURCE_MODES = new Set(['curated', 'hybrid', 'live']);
const MAX_MARKET_DATA_AGE_DAYS = 180;
const MAX_MARKET_DATA_FUTURE_SKEW_DAYS = 7;

interface StartupCheckFailure {
  code: string;
  message: string;
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
): Promise<void> {
  for (const tableName of tableNames) {
    if (!(await tableExists(tableName))) {
      failures.push({
        code: 'missing_role_market_table',
        message: `Role Market feature is enabled but required table '${tableName}' is missing.`,
      });
    }
  }
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

export async function validateRoleMarketStartupConfig(): Promise<void> {
  const failures: StartupCheckFailure[] = [];

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
