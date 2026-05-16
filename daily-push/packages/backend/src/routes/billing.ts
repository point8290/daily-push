import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  createCheckoutSession,
  createPortalSession,
  getBillingPlanState,
  handleBillingWebhook,
} from '../services/billing';
import { isBillingPlanKey, type BillingIntervalKey } from '../services/billingPlans';
import { getEntitlementSummaries } from '../services/entitlements';
import { trackProductEvent } from '../services/productEvents';
import {
  assertBodyObject,
  readEmail,
  readEnumValue,
  readOptionalString,
} from '../utils/requestValidation';

const router = Router();
const billingIntervals = ['month', 'year', 'lifetime'] as const;

router.get('/plan', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const state = await getBillingPlanState(userId);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

router.post('/checkout-session', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const body = assertBodyObject(req.body);
    const planKey = readEnumValue(
      body.planKey,
      'planKey',
      ['free', 'pro', 'sprint'] as const,
    );
    if (!isBillingPlanKey(planKey)) {
      res.status(400).json({ error: 'Invalid planKey' });
      return;
    }
    const intervalKey = readEnumValue(
      body.intervalKey ?? 'month',
      'intervalKey',
      billingIntervals,
    ) as BillingIntervalKey;
    const rawEmail = readOptionalString(body.email, 'email', { maxLength: 255 });
    const email = rawEmail ? readEmail(rawEmail) : null;

    const result = await createCheckoutSession(userId, {
      planKey,
      intervalKey,
      email,
    });

    void trackProductEvent({
      userId,
      eventKey: 'billing_checkout_started',
      properties: {
        planKey,
        intervalKey: intervalKey ?? 'month',
        provider: result.provider,
        autoActivated: result.autoActivated,
      },
    });

    const entitlements = await getEntitlementSummaries(userId);
    res.status(201).json({ ...result, entitlements });
  } catch (error) {
    next(error);
  }
});

router.post('/portal-session', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const result = await createPortalSession(userId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await handleBillingWebhook(
      req.body,
      req.headers['stripe-signature'],
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
