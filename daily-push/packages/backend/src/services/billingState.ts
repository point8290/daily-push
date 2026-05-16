import { pool } from '../db/postgres';
import type { BillingIntervalKey, BillingPlanKey } from './billingPlans';
import { getBillingPlanDefinition } from './billingPlans';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  billing_customer_id: string | null;
  provider: 'manual' | 'stripe';
  provider_subscription_id: string | null;
  plan_key: BillingPlanKey;
  status: SubscriptionStatus;
  interval_key: BillingIntervalKey;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_ends_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CurrentPlanState {
  planKey: BillingPlanKey;
  plan: ReturnType<typeof getBillingPlanDefinition>;
  source: 'free' | 'subscription';
  subscription: SubscriptionRecord | null;
}

const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
];

export function isSubscriptionActiveStatus(status: SubscriptionStatus): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(status);
}

export function isSubscriptionCurrentlyActive(
  subscription: Pick<SubscriptionRecord, 'status' | 'current_period_end'>,
): boolean {
  if (!isSubscriptionActiveStatus(subscription.status)) {
    return false;
  }

  if (!subscription.current_period_end) {
    return true;
  }

  return new Date(subscription.current_period_end).getTime() >= Date.now();
}

export async function getActiveSubscription(
  userId: string,
): Promise<SubscriptionRecord | null> {
  const { rows } = await pool.query<SubscriptionRecord>(
    `SELECT id, user_id, billing_customer_id, provider, provider_subscription_id,
            plan_key, status, interval_key,
            current_period_start::text, current_period_end::text,
            cancel_at_period_end, canceled_at::text, trial_ends_at::text,
            metadata, created_at::text, updated_at::text
       FROM subscriptions
      WHERE user_id = $1
        AND status = ANY($2::text[])
      ORDER BY current_period_end DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [userId, ACTIVE_SUBSCRIPTION_STATUSES],
  );

  const subscription = rows[0] ?? null;
  if (!subscription) return null;
  return isSubscriptionCurrentlyActive(subscription) ? subscription : null;
}

export async function resolveCurrentPlanKey(userId: string): Promise<BillingPlanKey> {
  const activeSubscription = await getActiveSubscription(userId);
  return activeSubscription?.plan_key ?? 'free';
}

export async function getCurrentPlanState(userId: string): Promise<CurrentPlanState> {
  const subscription = await getActiveSubscription(userId);
  const planKey = subscription?.plan_key ?? 'free';

  return {
    planKey,
    plan: getBillingPlanDefinition(planKey),
    source: subscription ? 'subscription' : 'free',
    subscription,
  };
}
