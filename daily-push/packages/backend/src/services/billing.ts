import { randomUUID } from 'crypto';
import { createHmac, timingSafeEqual } from 'crypto';
import { pool } from '../db/postgres';
import { config } from '../config';
import {
  type BillingIntervalKey,
  type BillingPlanKey,
  getBillingPlanDefinition,
  isBillingPlanKey,
  listBillingPlans,
} from './billingPlans';
import {
  getCurrentPlanState,
  isSubscriptionActiveStatus,
  type CurrentPlanState,
  type SubscriptionStatus,
} from './billingState';
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  updateStripeCustomer,
} from './stripeGateway';
import { syncEntitlementsForUser } from './entitlements';

interface BillingCustomerRow {
  id: string;
  provider: 'manual' | 'stripe';
  provider_customer_id: string | null;
  email: string | null;
}

interface StripeEventEnvelope {
  id: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
}

export interface CheckoutSessionResult {
  checkoutSessionId: string;
  provider: 'manual' | 'stripe';
  url: string;
  mode: 'manual' | 'external';
  planKey: BillingPlanKey;
  intervalKey: BillingIntervalKey;
  autoActivated: boolean;
  currentPlan: CurrentPlanState;
}

function addInterval(start: Date, intervalKey: BillingIntervalKey): Date | null {
  if (intervalKey === 'lifetime') {
    return null;
  }

  const result = new Date(start);
  if (intervalKey === 'year') {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    result.setUTCMonth(result.getUTCMonth() + 1);
  }
  return result;
}

function parseWebhookPayload(payload: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(payload)) {
    return JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
  }
  if (typeof payload === 'string') {
    return JSON.parse(payload) as Record<string, unknown>;
  }
  if (payload && typeof payload === 'object') {
    return payload as Record<string, unknown>;
  }
  throw new Error('Invalid webhook payload.');
}

function readStripeString(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseStripeTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return new Date(parsed * 1000).toISOString();
    }
  }
  return null;
}

function resolveSubscriptionStatus(value: unknown): SubscriptionStatus {
  return value === 'trialing' ||
    value === 'active' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'incomplete' ||
    value === 'incomplete_expired' ||
    value === 'unpaid'
    ? value
    : 'active';
}

function resolveIntervalKey(value: unknown): BillingIntervalKey {
  return value === 'year' || value === 'month'
    ? value
    : 'month';
}

function getStripePriceLookup(): Record<string, BillingPlanKey> {
  const lookup: Record<string, BillingPlanKey> = {};
  (['pro', 'sprint'] as const).forEach((planKey) => {
    (['month', 'year'] as const).forEach((intervalKey) => {
      const priceId = config.billing.stripePrices[planKey][intervalKey];
      if (priceId) {
        lookup[priceId] = planKey;
      }
    });
  });
  return lookup;
}

function resolvePlanKeyFromStripeObject(
  object: Record<string, unknown>,
): BillingPlanKey {
  const metadata =
    object.metadata && typeof object.metadata === 'object'
      ? (object.metadata as Record<string, unknown>)
      : {};
  const metadataPlanKey = readStripeString(metadata.planKey);
  if (metadataPlanKey && isBillingPlanKey(metadataPlanKey)) {
    return metadataPlanKey;
  }

  const items = object.items as
    | { data?: Array<Record<string, unknown>> }
    | undefined;
  const firstItem = items?.data?.[0];
  const price = firstItem?.price as Record<string, unknown> | undefined;
  const priceId = readStripeString(price?.id);
  const lookup = getStripePriceLookup();
  if (priceId && lookup[priceId]) {
    return lookup[priceId];
  }

  return 'free';
}

function verifyStripeWebhookSignature(
  payload: Buffer | string,
  signatureHeader: string | string[] | undefined,
): void {
  const endpointSecret = config.billing.stripeWebhookSecret.trim();
  if (!endpointSecret) {
    const error = new Error(
      'Stripe webhook secret is missing. Set STRIPE_WEBHOOK_SECRET before enabling Stripe webhooks.',
    );
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }

  const headerValue = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  if (!headerValue) {
    const error = new Error('Missing Stripe-Signature header.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const parts = headerValue.split(',').map((part) => part.trim());
  const timestamp = parts
    .find((part) => part.startsWith('t='))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    const error = new Error('Invalid Stripe-Signature header.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const expected = createHmac('sha256', endpointSecret)
    .update(`${timestamp}.${Buffer.isBuffer(payload) ? payload.toString('utf8') : payload}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const isMatch = signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature, 'utf8');
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  });

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number.parseInt(timestamp, 10));
  if (!isMatch || !Number.isFinite(ageSeconds) || ageSeconds > 300) {
    const error = new Error('Stripe webhook signature verification failed.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
}

async function markCheckoutSessionCompleted(params: {
  userId: string;
  providerSessionId: string;
  customerId: string | null;
  subscriptionId: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { rows } = await pool.query<{ billing_customer_id: string | null }>(
    `UPDATE billing_checkout_sessions
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE user_id = $1
        AND provider = 'stripe'
        AND provider_session_id = $2
      RETURNING billing_customer_id`,
    [
      params.userId,
      params.providerSessionId,
      JSON.stringify({
        stripeCustomerId: params.customerId,
        stripeSubscriptionId: params.subscriptionId,
        eventPayloadId: readStripeString(params.payload.id),
      }),
    ],
  );

  if (!rows[0]?.billing_customer_id || !params.customerId) {
    return;
  }

  await pool.query(
    `UPDATE billing_customers
        SET provider = 'stripe',
            provider_customer_id = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [rows[0].billing_customer_id, params.customerId],
  );
}

async function upsertStripeSubscription(params: {
  userId: string;
  customerId: string | null;
  subscription: Record<string, unknown>;
}): Promise<void> {
  const planKey = resolvePlanKeyFromStripeObject(params.subscription);
  if (planKey === 'free') {
    return;
  }

  const metadata =
    params.subscription.metadata && typeof params.subscription.metadata === 'object'
      ? (params.subscription.metadata as Record<string, unknown>)
      : {};
  const recurringInterval = (
    ((params.subscription.items as { data?: Array<Record<string, unknown>> } | undefined)
      ?.data?.[0]?.price as { recurring?: { interval?: unknown } } | undefined)
      ?.recurring?.interval
  );
  const intervalKey =
    resolveIntervalKey(readStripeString(metadata.intervalKey) ?? recurringInterval);
  const status = resolveSubscriptionStatus(params.subscription.status);
  const providerSubscriptionId = readStripeString(params.subscription.id);
  if (!providerSubscriptionId) {
    return;
  }

  const providerCustomerId =
    params.customerId ?? readStripeString(params.subscription.customer);

  let billingCustomerId: string | null = null;
  if (providerCustomerId) {
    const ensuredCustomer = await ensureBillingCustomer(params.userId);
    billingCustomerId = ensuredCustomer.id;
    await pool.query(
      `UPDATE billing_customers
          SET provider = 'stripe',
              provider_customer_id = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [ensuredCustomer.id, providerCustomerId],
    );
  }

  await pool.query(
    `INSERT INTO subscriptions
       (
         user_id,
         billing_customer_id,
         provider,
         provider_subscription_id,
         plan_key,
         status,
         interval_key,
         current_period_start,
         current_period_end,
         cancel_at_period_end,
         canceled_at,
         trial_ends_at,
         metadata,
         updated_at
       )
     VALUES
       ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
     ON CONFLICT (provider, provider_subscription_id)
       WHERE provider_subscription_id IS NOT NULL
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       billing_customer_id = EXCLUDED.billing_customer_id,
       plan_key = EXCLUDED.plan_key,
       status = EXCLUDED.status,
       interval_key = EXCLUDED.interval_key,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       canceled_at = EXCLUDED.canceled_at,
       trial_ends_at = EXCLUDED.trial_ends_at,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      params.userId,
      billingCustomerId,
      providerSubscriptionId,
      planKey,
      status,
      intervalKey,
      parseStripeTimestamp(params.subscription.current_period_start),
      parseStripeTimestamp(params.subscription.current_period_end),
      Boolean(params.subscription.cancel_at_period_end),
      parseStripeTimestamp(params.subscription.canceled_at),
      parseStripeTimestamp(params.subscription.trial_end),
      JSON.stringify(params.subscription),
    ],
  );

  await syncEntitlementsForUser(
    params.userId,
    isSubscriptionActiveStatus(status) ? planKey : 'free',
    parseStripeTimestamp(params.subscription.current_period_end),
  );
}

export function getPlanCatalog() {
  return listBillingPlans().map((plan) => ({
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    yearlyPriceCents: plan.yearlyPriceCents,
    highlight: plan.highlight,
    ctaLabel: plan.ctaLabel,
    features: plan.features,
  }));
}

export async function ensureBillingCustomer(
  userId: string,
  email?: string | null,
): Promise<BillingCustomerRow> {
  const { rows: existingRows } = await pool.query<BillingCustomerRow>(
    `SELECT id, provider, provider_customer_id, email
       FROM billing_customers
      WHERE user_id = $1`,
    [userId],
  );

  if (existingRows[0]) {
    if (config.billing.provider === 'stripe') {
      let providerCustomerId = existingRows[0].provider_customer_id;
      if (!providerCustomerId) {
        const created = await createStripeCustomer({ userId, email });
        providerCustomerId = created.id;
      } else if (email && existingRows[0].email !== email) {
        await updateStripeCustomer({
          customerId: providerCustomerId,
          userId,
          email,
        });
      }

      await pool.query(
        `UPDATE billing_customers
            SET provider = 'stripe',
                provider_customer_id = $2,
                email = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [existingRows[0].id, providerCustomerId, email ?? existingRows[0].email],
      );
      existingRows[0].provider = 'stripe';
      existingRows[0].provider_customer_id = providerCustomerId;
      existingRows[0].email = email ?? existingRows[0].email;
      return existingRows[0];
    }

    if (email && existingRows[0].email !== email) {
      await pool.query(
        `UPDATE billing_customers
            SET email = $2, updated_at = NOW()
          WHERE id = $1`,
        [existingRows[0].id, email],
      );
      existingRows[0].email = email;
    }
    return existingRows[0];
  }

  const providerCustomerId =
    config.billing.provider === 'stripe'
      ? (await createStripeCustomer({ userId, email })).id
      : `manual_cus_${randomUUID()}`;

  const { rows } = await pool.query<BillingCustomerRow>(
    `INSERT INTO billing_customers
       (user_id, provider, provider_customer_id, email, metadata)
     VALUES ($1, $2, $3, $4, '{}'::jsonb)
     RETURNING id, provider, provider_customer_id, email`,
    [userId, config.billing.provider, providerCustomerId, email ?? null],
  );

  return rows[0];
}

async function activateManualSubscription(
  userId: string,
  customerId: string,
  planKey: BillingPlanKey,
  intervalKey: BillingIntervalKey,
): Promise<void> {
  const now = new Date();
  const periodEnd = addInterval(now, intervalKey);
  const providerSubscriptionId = `manual_sub_${randomUUID()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              canceled_at = NOW(),
              updated_at = NOW(),
              cancel_at_period_end = FALSE
        WHERE user_id = $1
          AND status IN ('trialing', 'active', 'past_due', 'incomplete')`,
      [userId],
    );

    await client.query(
      `INSERT INTO subscriptions
         (user_id, billing_customer_id, provider, provider_subscription_id,
          plan_key, status, interval_key,
          current_period_start, current_period_end,
          cancel_at_period_end, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, FALSE, '{}'::jsonb, NOW())`,
      [
        userId,
        customerId,
        config.billing.provider,
        providerSubscriptionId,
        planKey,
        intervalKey,
        now.toISOString(),
        periodEnd?.toISOString() ?? null,
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await syncEntitlementsForUser(userId, planKey, periodEnd?.toISOString() ?? null);
}

export async function createCheckoutSession(
  userId: string,
  input: {
    planKey: string;
    intervalKey?: string;
    email?: string | null;
  },
): Promise<CheckoutSessionResult> {
  if (!isBillingPlanKey(input.planKey) || input.planKey === 'free') {
    const error = new Error('A paid plan key is required.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const intervalKey = (input.intervalKey ?? 'month') as BillingIntervalKey;
  if (!['month', 'year', 'lifetime'].includes(intervalKey)) {
    const error = new Error('Unsupported billing interval.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const customer = await ensureBillingCustomer(userId, input.email ?? null);
  const checkoutUrl =
    config.billing.provider === 'manual'
      ? `${config.app.frontendUrl}/settings?checkout=success&plan=${input.planKey}`
      : `${config.app.frontendUrl}/pricing?checkout=pending&plan=${input.planKey}`;
  let providerSessionId: string | null =
    config.billing.provider === 'stripe' ? null : `manual_checkout_${randomUUID()}`;
  let responseUrl = checkoutUrl;

  if (config.billing.provider === 'stripe') {
    if (!customer.provider_customer_id) {
      const error = new Error('Stripe customer could not be created.');
      (error as Error & { statusCode: number }).statusCode = 500;
      throw error;
    }

    const session = await createStripeCheckoutSession({
      customerId: customer.provider_customer_id,
      userId,
      planKey: input.planKey,
      intervalKey,
      successUrl: `${config.app.frontendUrl}/settings?checkout=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${config.app.frontendUrl}/pricing?checkout=cancelled`,
    });

    providerSessionId = session.id;
    responseUrl = session.url ?? checkoutUrl;
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO billing_checkout_sessions
       (user_id, billing_customer_id, provider, provider_session_id, plan_key, interval_key, status, checkout_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8::jsonb)
     RETURNING id`,
    [
      userId,
      customer.id,
      config.billing.provider,
      providerSessionId,
      input.planKey,
      intervalKey,
      responseUrl,
      JSON.stringify({
        requestedPlanKey: input.planKey,
        requestedIntervalKey: intervalKey,
      }),
    ],
  );

  const checkoutSessionId = rows[0].id;

  if (config.billing.provider === 'manual') {
    await activateManualSubscription(userId, customer.id, input.planKey, intervalKey);
    await pool.query(
      `UPDATE billing_checkout_sessions
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [checkoutSessionId],
    );
  }

  return {
    checkoutSessionId,
    provider: config.billing.provider,
    url: responseUrl,
    mode: config.billing.provider === 'manual' ? 'manual' : 'external',
    planKey: input.planKey,
    intervalKey,
    autoActivated: config.billing.provider === 'manual',
    currentPlan: await getCurrentPlanState(userId),
  };
}

export async function createPortalSession(userId: string) {
  if (config.billing.provider === 'stripe') {
    const customer = await ensureBillingCustomer(userId);
    if (!customer.provider_customer_id) {
      const error = new Error('No Stripe customer exists for this account yet.');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const session = await createStripePortalSession({
      customerId: customer.provider_customer_id,
      returnUrl: `${config.app.frontendUrl}/settings?billing=return`,
    });

    return {
      provider: config.billing.provider,
      url: session.url ?? `${config.app.frontendUrl}/settings?billing=return`,
      currentPlan: await getCurrentPlanState(userId),
      mode: 'external' as const,
    };
  }

  return {
    provider: config.billing.provider,
    url: `${config.app.frontendUrl}/settings?billing=manage`,
    currentPlan: await getCurrentPlanState(userId),
    mode: config.billing.provider === 'manual' ? 'manual' : 'external',
  };
}

export async function getBillingPlanState(userId: string) {
  return {
    currentPlan: await getCurrentPlanState(userId),
    plans: getPlanCatalog(),
    provider: config.billing.provider,
  };
}

export async function handleBillingWebhook(
  payload: unknown,
  signatureHeader?: string | string[],
) {
  if (config.billing.provider === 'stripe') {
    if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
      const error = new Error('Stripe webhook payload must be raw.');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }
    verifyStripeWebhookSignature(payload, signatureHeader);
    const event = parseWebhookPayload(payload) as unknown as StripeEventEnvelope;
    const object =
      event.data?.object && typeof event.data.object === 'object'
        ? event.data.object
        : null;
    if (!event.type || !object) {
      const error = new Error('Invalid Stripe webhook payload.');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const metadata =
      object.metadata && typeof object.metadata === 'object'
        ? (object.metadata as Record<string, unknown>)
        : {};
    const userId =
      readStripeString(metadata.userId) ??
      readStripeString(object.client_reference_id);

    if (event.type === 'checkout.session.completed') {
      if (!userId) {
        return { received: true, ignored: 'missing_user' };
      }
      await markCheckoutSessionCompleted({
        userId,
        providerSessionId: readStripeString(object.id) ?? '',
        customerId: readStripeString(object.customer),
        subscriptionId: readStripeString(object.subscription),
        payload: { id: event.id },
      });
      return { received: true };
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      if (!userId) {
        return { received: true, ignored: 'missing_user' };
      }
      await upsertStripeSubscription({
        userId,
        customerId: readStripeString(object.customer),
        subscription: object,
      });
      return { received: true };
    }

    if (event.type === 'customer.subscription.deleted') {
      if (!userId) {
        return { received: true, ignored: 'missing_user' };
      }
      const providerSubscriptionId = readStripeString(object.id);
      if (providerSubscriptionId) {
        await pool.query(
          `UPDATE subscriptions
              SET status = 'canceled',
                  canceled_at = COALESCE(canceled_at, NOW()),
                  cancel_at_period_end = FALSE,
                  updated_at = NOW(),
                  metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
            WHERE user_id = $1
              AND provider = 'stripe'
              AND provider_subscription_id = $2`,
          [userId, providerSubscriptionId, JSON.stringify(object)],
        );
      }
      await syncEntitlementsForUser(userId, 'free', null);
      return { received: true };
    }

    return { received: true, ignored: event.type };
  }

  const event = parseWebhookPayload(payload) as {
    type?: string;
    data?: {
      userId?: string;
      planKey?: string;
      intervalKey?: BillingIntervalKey;
      status?: string;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
    };
  };

  if (!event.type || !event.data?.userId || !event.data.planKey || !isBillingPlanKey(event.data.planKey)) {
    const error = new Error('Invalid webhook payload.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  if (event.type === 'subscription.updated') {
    const customer = await ensureBillingCustomer(event.data.userId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE subscriptions
            SET status = $2,
                interval_key = $3,
                current_period_start = $4,
                current_period_end = $5,
                cancel_at_period_end = $6,
                updated_at = NOW()
          WHERE user_id = $1
            AND status IN ('trialing', 'active', 'past_due', 'incomplete')`,
        [
          event.data.userId,
          event.data.status ?? 'active',
          event.data.intervalKey ?? 'month',
          event.data.currentPeriodStart ?? new Date().toISOString(),
          event.data.currentPeriodEnd ?? null,
          event.data.cancelAtPeriodEnd ?? false,
        ],
      );

      await client.query(
        `INSERT INTO subscriptions
           (user_id, billing_customer_id, provider, provider_subscription_id,
            plan_key, status, interval_key, current_period_start, current_period_end,
            cancel_at_period_end, metadata, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::jsonb, NOW())`,
        [
          event.data.userId,
          customer.id,
          config.billing.provider,
          `webhook_sub_${randomUUID()}`,
          event.data.planKey,
          event.data.status ?? 'active',
          event.data.intervalKey ?? 'month',
          event.data.currentPeriodStart ?? new Date().toISOString(),
          event.data.currentPeriodEnd ?? null,
          event.data.cancelAtPeriodEnd ?? false,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await syncEntitlementsForUser(
      event.data.userId,
      event.data.planKey,
      event.data.currentPeriodEnd ?? null,
    );
    return { received: true };
  }

  if (event.type === 'subscription.deleted') {
    await pool.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              canceled_at = NOW(),
              updated_at = NOW(),
              cancel_at_period_end = FALSE
        WHERE user_id = $1
          AND status IN ('trialing', 'active', 'past_due', 'incomplete')`,
      [event.data.userId],
    );
    await syncEntitlementsForUser(event.data.userId, 'free', null);
    return { received: true };
  }

  const error = new Error('Unhandled webhook event type.');
  (error as Error & { statusCode: number }).statusCode = 400;
  throw error;
}

export function getBillingPlanPublic(planKey: BillingPlanKey) {
  const plan = getBillingPlanDefinition(planKey);
  return {
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    yearlyPriceCents: plan.yearlyPriceCents,
    highlight: plan.highlight,
    ctaLabel: plan.ctaLabel,
    features: plan.features,
  };
}
