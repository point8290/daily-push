import { randomUUID } from 'crypto';
import { config } from '../config';
import type { BillingIntervalKey, BillingPlanKey } from './billingPlans';

interface StripeCustomerResponse {
  id: string;
  email?: string | null;
}

interface StripeCheckoutSessionResponse {
  id: string;
  url: string | null;
}

interface StripePortalSessionResponse {
  id: string;
  url: string | null;
}

function getStripeSecretKey(): string {
  const secretKey = config.billing.stripeSecretKey.trim();
  if (!secretKey) {
    const error = new Error('Stripe is enabled but STRIPE_SECRET_KEY is missing.');
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return secretKey;
}

function stripeUrl(pathname: string): string {
  const baseUrl = config.billing.stripeApiBaseUrl.replace(/\/+$/, '');
  return `${baseUrl}${pathname}`;
}

function encodeForm(
  payload: Record<string, string | number | boolean | null | undefined>,
): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === '') continue;
    form.set(key, String(value));
  }
  return form;
}

async function postStripeForm<T>(
  pathname: string,
  payload: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const response = await fetch(stripeUrl(pathname), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(payload),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const stripeErrorMessage =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      parsed.error &&
      typeof parsed.error === 'object' &&
      'message' in parsed.error
        ? String((parsed.error as { message?: unknown }).message ?? '')
        : null;
    const error = new Error(
      stripeErrorMessage || `Stripe request failed with status ${response.status}.`,
    );
    (error as Error & { statusCode: number }).statusCode =
      response.status >= 400 && response.status < 600 ? response.status : 502;
    throw error;
  }

  return (parsed as T) ?? ({} as T);
}

export function getStripePriceId(
  planKey: BillingPlanKey,
  intervalKey: BillingIntervalKey,
): string {
  if (planKey === 'free' || intervalKey === 'lifetime') {
    const error = new Error('Stripe checkout only supports paid recurring plans.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const priceId = config.billing.stripePrices[planKey]?.[intervalKey];
  if (!priceId) {
    const error = new Error(
      `Stripe price ID is missing for ${planKey} ${intervalKey}.`,
    );
    (error as Error & { statusCode: number }).statusCode = 500;
    throw error;
  }
  return priceId;
}

export async function createStripeCustomer(params: {
  email?: string | null;
  userId: string;
}): Promise<StripeCustomerResponse> {
  return postStripeForm<StripeCustomerResponse>('/v1/customers', {
    email: params.email ?? null,
    'metadata[userId]': params.userId,
    'metadata[source]': 'daily-push',
  });
}

export async function updateStripeCustomer(params: {
  customerId: string;
  email?: string | null;
  userId: string;
}): Promise<StripeCustomerResponse> {
  return postStripeForm<StripeCustomerResponse>(
    `/v1/customers/${params.customerId}`,
    {
      email: params.email ?? null,
      'metadata[userId]': params.userId,
      'metadata[source]': 'daily-push',
    },
  );
}

export async function createStripeCheckoutSession(params: {
  customerId: string;
  userId: string;
  planKey: BillingPlanKey;
  intervalKey: BillingIntervalKey;
  successUrl: string;
  cancelUrl: string;
  source?: string | null;
}): Promise<StripeCheckoutSessionResponse> {
  const priceId = getStripePriceId(params.planKey, params.intervalKey);
  return postStripeForm<StripeCheckoutSessionResponse>(
    '/v1/checkout/sessions',
    {
      mode: 'subscription',
      customer: params.customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': 1,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      'metadata[userId]': params.userId,
      'metadata[planKey]': params.planKey,
      'metadata[intervalKey]': params.intervalKey,
      'metadata[source]': params.source ?? null,
      'subscription_data[metadata][userId]': params.userId,
      'subscription_data[metadata][planKey]': params.planKey,
      'subscription_data[metadata][intervalKey]': params.intervalKey,
      'subscription_data[metadata][source]': params.source ?? null,
      'subscription_data[metadata][checkoutTraceId]': randomUUID(),
      allow_promotion_codes: true,
    },
  );
}

export async function createStripePortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSessionResponse> {
  const payload: Record<string, string | number | boolean | null | undefined> = {
    customer: params.customerId,
    return_url: params.returnUrl,
  };

  if (config.billing.stripePortalConfigurationId) {
    payload.configuration = config.billing.stripePortalConfigurationId;
  }

  return postStripeForm<StripePortalSessionResponse>(
    '/v1/billing_portal/sessions',
    payload,
  );
}
