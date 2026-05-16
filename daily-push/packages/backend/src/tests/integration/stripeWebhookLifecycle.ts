import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createHmac, randomUUID } from 'node:crypto';

async function run(): Promise<void> {
  process.env.BILLING_PROVIDER = 'stripe';
  process.env.STRIPE_SECRET_KEY = 'sk_test_local';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_test';
  process.env.STRIPE_PRICE_PRO_MONTH = 'price_pro_month_test';
  process.env.STRIPE_PRICE_PRO_YEAR = 'price_pro_year_test';
  process.env.STRIPE_PRICE_SPRINT_MONTH = 'price_sprint_month_test';
  process.env.STRIPE_PRICE_SPRINT_YEAR = 'price_sprint_year_test';

  const observedRequests: Array<{ path: string; body: string }> = [];
  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  let customerCounter = 0;
  let checkoutCounter = 0;
  let portalCounter = 0;

  const stubServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      observedRequests.push({
        path: req.url ?? '',
        body,
      });

      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'POST' && req.url === '/v1/customers') {
        customerCounter += 1;
        res.end(
          JSON.stringify({
            id: `cus_gap08_${runId}_${customerCounter}`,
            email: null,
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url?.startsWith('/v1/customers/')) {
        const customerId =
          req.url.split('/').pop() ?? `cus_gap08_${runId}_${customerCounter}`;
        res.end(
          JSON.stringify({
            id: customerId,
            email: null,
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
        checkoutCounter += 1;
        res.end(
          JSON.stringify({
            id: `cs_gap08_${runId}_${checkoutCounter}`,
            url: `https://checkout.stripe.test/session/${runId}/${checkoutCounter}`,
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/billing_portal/sessions') {
        portalCounter += 1;
        res.end(
          JSON.stringify({
            id: `bps_gap08_${runId}_${portalCounter}`,
            url: `https://billing.stripe.test/session/${runId}/${portalCounter}`,
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: 'Not found' } }));
    });
  });

  await new Promise<void>((resolve) =>
    stubServer.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = stubServer.address() as AddressInfo;
  process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${address.port}`;

  const { pool, testPostgresConnection } = await import('../../db/postgres');
  const {
    createCheckoutSession,
    createPortalSession,
    handleBillingWebhook,
  } = await import('../../services/billing');
  const { getCurrentPlanState } = await import('../../services/billingState');

  const userId = randomUUID();
  const email = `stripe-lifecycle-${runId}@example.com`;

  const signPayload = (payload: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac(
      'sha256',
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    )
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  };

  try {
    await testPostgresConnection();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, 'stripe-webhook-test-hash', 'Stripe Webhook Test User'],
    );

    const checkout = await createCheckoutSession(userId, {
      planKey: 'sprint',
      intervalKey: 'month',
      email,
    });
    assert.equal(checkout.provider, 'stripe');
    assert.equal(checkout.mode, 'external');

    const { rows: customerRows } = await pool.query<{
      id: string;
      provider: string;
      provider_customer_id: string | null;
    }>(
      `SELECT id, provider, provider_customer_id
         FROM billing_customers
        WHERE user_id = $1`,
      [userId],
    );
    const customer = customerRows[0];
    assert.ok(customer, 'Expected billing customer row after Stripe checkout creation');
    assert.equal(customer.provider, 'stripe');
    assert.ok(
      customer.provider_customer_id,
      'Expected Stripe provider customer id after checkout creation',
    );

    const { rows: checkoutRows } = await pool.query<{
      id: string;
      provider_session_id: string | null;
      status: string;
    }>(
      `SELECT id, provider_session_id, status
         FROM billing_checkout_sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    const checkoutRow = checkoutRows[0];
    assert.ok(checkoutRow, 'Expected billing checkout session row');
    assert.equal(checkoutRow.status, 'created');
    assert.ok(
      checkoutRow.provider_session_id,
      'Expected provider checkout session id to be saved',
    );

    const portal = await createPortalSession(userId);
    assert.equal(portal.provider, 'stripe');
    assert.equal(portal.mode, 'external');
    assert.match(
      portal.url,
      /^https:\/\/billing\.stripe\.test\/session\//,
      'Expected Stripe portal session URL',
    );

    const checkoutCompletedEvent = {
      id: `evt_checkout_${runId}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkoutRow.provider_session_id,
          object: 'checkout.session',
          customer: customer.provider_customer_id,
          subscription: `sub_gap08_${runId}`,
          client_reference_id: userId,
          metadata: {
            userId,
            planKey: 'sprint',
            intervalKey: 'month',
          },
        },
      },
    };

    const subscriptionUpdatedEvent = {
      id: `evt_subscription_update_${runId}`,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: `sub_gap08_${runId}`,
          object: 'subscription',
          customer: customer.provider_customer_id,
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end:
            Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          metadata: {
            userId,
            planKey: 'sprint',
            intervalKey: 'month',
          },
          items: {
            data: [
              {
                price: {
                  id: process.env.STRIPE_PRICE_SPRINT_MONTH,
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        },
      },
    };

    const subscriptionDeletedEvent = {
      id: `evt_subscription_delete_${runId}`,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: `sub_gap08_${runId}`,
          object: 'subscription',
          customer: customer.provider_customer_id,
          status: 'canceled',
          canceled_at: Math.floor(Date.now() / 1000),
          metadata: {
            userId,
            planKey: 'sprint',
            intervalKey: 'month',
          },
        },
      },
    };

    const checkoutPayload = JSON.stringify(checkoutCompletedEvent);
    await handleBillingWebhook(
      Buffer.from(checkoutPayload, 'utf8'),
      signPayload(checkoutPayload),
    );

    const planAfterCheckout = await getCurrentPlanState(userId);
    assert.equal(
      planAfterCheckout.planKey,
      'free',
      'Checkout completion should not activate paid access before subscription sync',
    );

    const { rows: completedCheckoutRows } = await pool.query<{
      status: string;
      completed: boolean;
    }>(
      `SELECT status, completed_at IS NOT NULL AS completed
         FROM billing_checkout_sessions
        WHERE id = $1`,
      [checkoutRow.id],
    );
    assert.equal(completedCheckoutRows[0]?.status, 'completed');
    assert.equal(completedCheckoutRows[0]?.completed, true);

    const subscriptionUpdatedPayload = JSON.stringify(subscriptionUpdatedEvent);
    await handleBillingWebhook(
      Buffer.from(subscriptionUpdatedPayload, 'utf8'),
      signPayload(subscriptionUpdatedPayload),
    );

    const activePlan = await getCurrentPlanState(userId);
    assert.equal(activePlan.planKey, 'sprint');

    const { rows: activeSubscriptionRows } = await pool.query<{
      plan_key: string;
      status: string;
      provider_subscription_id: string | null;
      interval_key: string;
    }>(
      `SELECT plan_key, status, provider_subscription_id, interval_key
         FROM subscriptions
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 1`,
      [userId],
    );
    const activeSubscription = activeSubscriptionRows[0];
    assert.ok(activeSubscription, 'Expected Stripe subscription row after update');
    assert.equal(activeSubscription.plan_key, 'sprint');
    assert.equal(activeSubscription.status, 'active');
    assert.equal(activeSubscription.interval_key, 'month');
    assert.equal(
      activeSubscription.provider_subscription_id,
      `sub_gap08_${runId}`,
    );

    const subscriptionDeletedPayload = JSON.stringify(subscriptionDeletedEvent);
    await handleBillingWebhook(
      Buffer.from(subscriptionDeletedPayload, 'utf8'),
      signPayload(subscriptionDeletedPayload),
    );

    const planAfterDeletion = await getCurrentPlanState(userId);
    assert.equal(planAfterDeletion.planKey, 'free');

    const { rows: canceledSubscriptionRows } = await pool.query<{
      status: string;
      canceled: boolean;
    }>(
      `SELECT status, canceled_at IS NOT NULL AS canceled
         FROM subscriptions
        WHERE user_id = $1
          AND provider_subscription_id = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [userId, `sub_gap08_${runId}`],
    );
    assert.equal(canceledSubscriptionRows[0]?.status, 'canceled');
    assert.equal(canceledSubscriptionRows[0]?.canceled, true);

    const requestPaths = observedRequests.map((entry) => entry.path);
    assert.deepEqual(requestPaths, [
      '/v1/customers',
      '/v1/checkout/sessions',
      '/v1/billing_portal/sessions',
    ]);

    console.log(`PASS stripe checkout created external session (${checkoutRow.provider_session_id})`);
    console.log('PASS checkout completion stayed free until subscription sync');
    console.log(`PASS subscription update activated sprint plan for ${userId}`);
    console.log('PASS subscription deletion returned the user to free');
  } finally {
    await pool.end();
    await new Promise<void>((resolve, reject) =>
      stubServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
