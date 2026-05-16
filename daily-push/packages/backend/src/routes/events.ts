import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
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
const eventRateLimit = createRateLimit({
  keyPrefix: 'events',
  windowMs: config.security.eventRateLimitWindowMs,
  maxRequests: config.security.eventRateLimitMax,
  message: 'Too many analytics events in a short window. Please slow down.',
  keyBuilder: (req) => {
    const userId = (req as AuthRequest).userId;
    return userId || req.ip || 'unknown';
  },
});

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
    const properties =
      body.properties === undefined || body.properties === null
        ? {}
        : readPlainObject(body.properties, 'properties', {
            maxKeys: 60,
            maxSerializedLength: 16000,
          });

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

export default router;
