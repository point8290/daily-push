import { pool } from '../db/postgres';
import {
  type BillingPlanKey,
  type EntitlementResetPeriod,
  KNOWN_ENTITLEMENT_KEYS,
  getBillingPlanDefinition,
  getUpgradePlanForFeature,
} from './billingPlans';
import { getActiveSubscription, resolveCurrentPlanKey } from './billingState';

export interface EntitlementRow {
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  reset_period: EntitlementResetPeriod | null;
  source_plan_key: BillingPlanKey;
  expires_at: string | null;
}

export interface EntitlementSummary {
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  resetPeriod: EntitlementResetPeriod | null;
  sourcePlanKey: BillingPlanKey;
  expiresAt: string | null;
  usage: number;
  remaining: number | null;
}

export class EntitlementError extends Error {
  statusCode: number;
  code: string;
  featureKey: string;
  upgradePlan: BillingPlanKey | null;
  limitValue: number | null;
  usage: number;

  constructor({
    message,
    code,
    featureKey,
    statusCode = 402,
    upgradePlan,
    limitValue,
    usage,
  }: {
    message: string;
    code: string;
    featureKey: string;
    statusCode?: number;
    upgradePlan: BillingPlanKey | null;
    limitValue: number | null;
    usage: number;
  }) {
    super(message);
    this.name = 'EntitlementError';
    this.statusCode = statusCode;
    this.code = code;
    this.featureKey = featureKey;
    this.upgradePlan = upgradePlan;
    this.limitValue = limitValue;
    this.usage = usage;
  }
}

function computeResetWindowStart(period: EntitlementResetPeriod | null): Date | null {
  if (!period || period === 'lifetime') return null;

  const now = new Date();
  if (period === 'daily') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  if (period === 'weekly') {
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function computePeriodKey(period: EntitlementResetPeriod | null): string | null {
  const now = new Date();
  if (!period) return null;
  if (period === 'lifetime') return 'lifetime';
  if (period === 'daily') {
    return now.toISOString().slice(0, 10);
  }
  if (period === 'weekly') {
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
    return monday.toISOString().slice(0, 10);
  }
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getUsageForFeature(
  userId: string,
  featureKey: string,
  resetPeriod: EntitlementResetPeriod | null,
): Promise<number> {
  const resetStart = computeResetWindowStart(resetPeriod);
  const query =
    resetStart === null
      ? `SELECT COALESCE(SUM(quantity), 0)::int AS used
           FROM usage_events
          WHERE user_id = $1 AND feature_key = $2`
      : `SELECT COALESCE(SUM(quantity), 0)::int AS used
           FROM usage_events
          WHERE user_id = $1
            AND feature_key = $2
            AND created_at >= $3`;

  const params = resetStart === null ? [userId, featureKey] : [userId, featureKey, resetStart.toISOString()];
  const { rows } = await pool.query<{ used: number }>(query, params);
  return rows[0]?.used ?? 0;
}

export async function syncEntitlementsForUser(
  userId: string,
  planKey?: BillingPlanKey,
  expiresAt?: string | null,
): Promise<void> {
  const resolvedPlanKey = planKey ?? (await resolveCurrentPlanKey(userId));
  const plan = getBillingPlanDefinition(resolvedPlanKey);
  const activeSubscription = await getActiveSubscription(userId);
  const resolvedExpiry = expiresAt ?? activeSubscription?.current_period_end ?? null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const featureKey of KNOWN_ENTITLEMENT_KEYS) {
      const entitlement = plan.entitlements[featureKey] ?? {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      };

      await client.query(
        `INSERT INTO entitlements
           (user_id, feature_key, enabled, limit_value, reset_period, source_plan_key, expires_at, metadata, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, NOW())
         ON CONFLICT (user_id, feature_key)
         DO UPDATE
           SET enabled = EXCLUDED.enabled,
               limit_value = EXCLUDED.limit_value,
               reset_period = EXCLUDED.reset_period,
               source_plan_key = EXCLUDED.source_plan_key,
               expires_at = EXCLUDED.expires_at,
               updated_at = NOW()`,
        [
          userId,
          featureKey,
          entitlement.enabled,
          entitlement.limitValue,
          entitlement.resetPeriod ?? null,
          resolvedPlanKey,
          resolvedExpiry,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getEntitlementRows(userId: string): Promise<EntitlementRow[]> {
  const { rows } = await pool.query<EntitlementRow>(
    `SELECT feature_key, enabled, limit_value, reset_period, source_plan_key, expires_at::text
       FROM entitlements
      WHERE user_id = $1
      ORDER BY feature_key ASC`,
    [userId],
  );

  if (rows.length > 0) {
    return rows;
  }

  await syncEntitlementsForUser(userId);
  const { rows: syncedRows } = await pool.query<EntitlementRow>(
    `SELECT feature_key, enabled, limit_value, reset_period, source_plan_key, expires_at::text
       FROM entitlements
      WHERE user_id = $1
      ORDER BY feature_key ASC`,
    [userId],
  );
  return syncedRows;
}

export async function getEntitlementSummaries(userId: string): Promise<EntitlementSummary[]> {
  const rows = await getEntitlementRows(userId);
  const summaries = await Promise.all(
    rows.map(async (row) => {
      const usage = row.enabled
        ? await getUsageForFeature(userId, row.feature_key, row.reset_period)
        : 0;
      const remaining =
        row.limit_value === null
          ? null
          : Math.max(row.limit_value - usage, 0);

      return {
        featureKey: row.feature_key,
        enabled: row.enabled,
        limitValue: row.limit_value,
        resetPeriod: row.reset_period,
        sourcePlanKey: row.source_plan_key,
        expiresAt: row.expires_at,
        usage,
        remaining,
      };
    }),
  );

  return summaries;
}

export async function getEntitlementSummary(
  userId: string,
  featureKey: string,
): Promise<EntitlementSummary> {
  const summaries = await getEntitlementSummaries(userId);
  const summary = summaries.find((entry) => entry.featureKey === featureKey);
  if (!summary) {
    return {
      featureKey,
      enabled: false,
      limitValue: null,
      resetPeriod: null,
      sourcePlanKey: 'free',
      expiresAt: null,
      usage: 0,
      remaining: null,
    };
  }
  return summary;
}

export async function assertEntitlementEnabled(
  userId: string,
  featureKey: string,
): Promise<EntitlementSummary> {
  const summary = await getEntitlementSummary(userId, featureKey);
  if (!summary.enabled) {
    throw new EntitlementError({
      message: 'This feature is locked on your current plan.',
      code: 'feature_locked',
      featureKey,
      upgradePlan: getUpgradePlanForFeature(featureKey),
      limitValue: summary.limitValue,
      usage: summary.usage,
    });
  }
  return summary;
}

export async function consumeQuota(
  userId: string,
  featureKey: string,
  options?: {
    quantity?: number;
    source?: string;
    properties?: Record<string, unknown>;
  },
): Promise<EntitlementSummary> {
  const quantity = Math.max(1, options?.quantity ?? 1);
  const summary = await assertEntitlementEnabled(userId, featureKey);

  if (summary.limitValue !== null && summary.usage + quantity > summary.limitValue) {
    throw new EntitlementError({
      message: 'You have reached the quota for this feature on your current plan.',
      code: 'quota_exceeded',
      featureKey,
      upgradePlan: getUpgradePlanForFeature(featureKey),
      limitValue: summary.limitValue,
      usage: summary.usage,
    });
  }

  const activeSubscription = await getActiveSubscription(userId);
  await pool.query(
    `INSERT INTO usage_events
       (user_id, subscription_id, feature_key, quantity, source, period_key, properties)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      userId,
      activeSubscription?.id ?? null,
      featureKey,
      quantity,
      options?.source ?? 'app',
      computePeriodKey(summary.resetPeriod),
      JSON.stringify(options?.properties ?? {}),
    ],
  );

  return {
    ...summary,
    usage: summary.usage + quantity,
    remaining:
      summary.limitValue === null
        ? null
        : Math.max(summary.limitValue - (summary.usage + quantity), 0),
  };
}

export async function assertBelowStateLimit(
  userId: string,
  featureKey: string,
  currentValue: number,
): Promise<EntitlementSummary> {
  const summary = await assertEntitlementEnabled(userId, featureKey);
  if (summary.limitValue !== null && currentValue >= summary.limitValue) {
    throw new EntitlementError({
      message: 'You have reached the limit for this feature on your current plan.',
      code: 'limit_reached',
      featureKey,
      upgradePlan: getUpgradePlanForFeature(featureKey),
      limitValue: summary.limitValue,
      usage: currentValue,
    });
  }
  return summary;
}
