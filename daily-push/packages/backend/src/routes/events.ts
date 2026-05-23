import { Router, Request, Response, NextFunction } from 'express';
import {
  requireAuth,
  optionalAuth,
  AuthRequest,
  OptionalAuthRequest,
} from '../middleware/auth';
import { config } from '../config';
import { createRateLimit } from '../middleware/rateLimit';
import { trackProductEvent } from '../services/productEvents';
import {
  assertBodyObject,
  readOptionalString,
  readPlainObject,
  readRequiredString,
} from '../utils/requestValidation';

const router = Router();
const PUBLIC_EVENT_KEYS = new Set([
  'career_market_landing_viewed',
  'role_profile_viewed',
  'role_recommendation_generated',
  'target_role_save_clicked',
  'market_upgrade_clicked',
  'role_market_feedback_submitted',
]);
const ROLE_MARKET_EVENT_KEYS = new Set([
  ...PUBLIC_EVENT_KEYS,
  'target_role_saved',
  'role_readiness_generated',
  'upgrade_plan_created',
  'upgrade_sprint_started',
  'checkout_started_from_market',
]);
const PRIVATE_PROPERTY_KEYS = new Set([
  'resume',
  'resumetext',
  'jd',
  'jdtext',
  'jobdescription',
  'jobdescriptiontext',
  'rawtext',
  'profiletext',
  'freetextcontext',
  'sourcesnippet',
  'snippet',
  'content',
  'input',
  'candidateinput',
  'recommendationsnapshot',
  'email',
  'phone',
  'contact',
]);
const eventRateLimit = createRateLimit({
  keyPrefix: 'events',
  windowMs: config.security.eventRateLimitWindowMs,
  maxRequests: config.security.eventRateLimitMax,
  message: 'Too many analytics events in a short window. Please slow down.',
  keyBuilder: (req) => {
    const userId = (req as OptionalAuthRequest).userId;
    const anonymousId =
      req.body &&
      typeof req.body === 'object' &&
      !Array.isArray(req.body) &&
      typeof (req.body as Record<string, unknown>).anonymousId === 'string'
        ? String((req.body as Record<string, unknown>).anonymousId)
        : null;
    return userId || anonymousId || req.ip || 'unknown';
  },
});

function assertSafeEventProperties(
  eventKey: string,
  value: Record<string, unknown>,
): void {
  if (!ROLE_MARKET_EVENT_KEYS.has(eventKey)) return;

  const visit = (record: Record<string, unknown>, path: string) => {
    for (const [key, nestedValue] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (PRIVATE_PROPERTY_KEYS.has(normalizedKey)) {
        const error = new Error(`Analytics property '${path}${key}' is not allowed for Role Market events.`);
        (error as Error & { statusCode?: number; code?: string }).statusCode = 400;
        (error as Error & { statusCode?: number; code?: string }).code = 'validation_error';
        throw error;
      }
      if (typeof nestedValue === 'string' && nestedValue.length > 800) {
        const error = new Error(`Analytics property '${path}${key}' is too long for Role Market events.`);
        (error as Error & { statusCode?: number; code?: string }).statusCode = 400;
        (error as Error & { statusCode?: number; code?: string }).code = 'validation_error';
        throw error;
      }
      if (
        typeof nestedValue === 'string' &&
        (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(nestedValue) || /\+?\d[\d\s().-]{7,}\d/.test(nestedValue))
      ) {
        const error = new Error(`Analytics property '${path}${key}' must not include contact details.`);
        (error as Error & { statusCode?: number; code?: string }).statusCode = 400;
        (error as Error & { statusCode?: number; code?: string }).code = 'validation_error';
        throw error;
      }
      if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
        visit(nestedValue as Record<string, unknown>, `${path}${key}.`);
      }
    }
  };

  visit(value, '');
}

function readEventProperties(body: Record<string, unknown>, eventKey: string): Record<string, unknown> {
  const properties =
    body.properties === undefined || body.properties === null
      ? {}
      : readPlainObject(body.properties, 'properties', {
          maxKeys: 60,
          maxSerializedLength: 16000,
        });
  assertSafeEventProperties(eventKey, properties);
  return properties;
}

router.post('/', requireAuth, eventRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const body = assertBodyObject(req.body);
    const eventKey = readRequiredString(body.eventKey, 'eventKey', {
      maxLength: 80,
      pattern: /^[a-z0-9_.:-]+$/i,
    });
    const goalId = readOptionalString(body.goalId, 'goalId', { maxLength: 64 });
    const sessionId = readOptionalString(body.sessionId, 'sessionId', {
      maxLength: 64,
    });
    const properties = readEventProperties(body, eventKey);

    await trackProductEvent({
      userId,
      goalId,
      sessionId,
      eventKey,
      properties,
    });

    res.status(202).json({ tracked: true });
  } catch (err) {
    next(err);
  }
});

router.post('/public', optionalAuth, eventRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as OptionalAuthRequest;
    const body = assertBodyObject(req.body);
    const eventKey = readRequiredString(body.eventKey, 'eventKey', {
      maxLength: 80,
      pattern: /^[a-z0-9_.:-]+$/i,
    });
    if (!PUBLIC_EVENT_KEYS.has(eventKey)) {
      res.status(400).json({
        error: 'This public analytics event is not supported.',
        code: 'validation_error',
      });
      return;
    }

    const anonymousId = readRequiredString(body.anonymousId, 'anonymousId', {
      maxLength: 120,
      pattern: /^[a-z0-9_.:-]+$/i,
    });
    const properties = readEventProperties(body, eventKey);

    await trackProductEvent({
      userId,
      anonymousId,
      eventKey,
      properties,
    });

    res.status(202).json({ tracked: true });
  } catch (err) {
    next(err);
  }
});

export default router;
