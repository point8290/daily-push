import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createSession, completeSession, getStreak, getCalendarData } from '../services/sessions';
import { scoreUnderstandingAnswer } from '../services/understandingCheck';

const router = Router();

// POST /api/sessions — start a session
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const { nodeId, sessionType = 'new', timebox = 30 } = req.body;

    if (!nodeId) {
      res.status(400).json({ error: 'nodeId is required' });
      return;
    }
    if (!['new', 'review'].includes(sessionType)) {
      res.status(400).json({ error: 'sessionType must be new or review' });
      return;
    }

    const sessionId = await createSession(userId, nodeId, sessionType, timebox);
    res.status(201).json({ sessionId });
  } catch (err) { next(err); }
});

// PATCH /api/sessions/:id/complete — mark session done with confidence
router.patch('/:id/complete', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const sessionId = String(req.params.id);
    const { confidenceAfter, durationMins, notes } = req.body;

    if (!confidenceAfter || confidenceAfter < 1 || confidenceAfter > 5) {
      res.status(400).json({ error: 'confidenceAfter must be 1–5' });
      return;
    }

    const result = await completeSession(
      sessionId,
      userId,
      parseInt(String(confidenceAfter), 10),
      parseInt(String(durationMins ?? '30'), 10),
      notes ?? null
    );

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/sessions/streak
router.get('/streak', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const streak = await getStreak(userId);
    res.json(streak);
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/check — score free-text understanding answer
router.post('/:id/check', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const sessionId = String(req.params.id);
    const { answer } = req.body;
    if (!answer?.trim()) {
      res.status(400).json({ error: 'answer is required' });
      return;
    }
    const result = await scoreUnderstandingAnswer(sessionId, answer.trim(), userId);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/sessions/calendar?days=90
router.get('/calendar', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const days = Math.min(parseInt(String(req.query.days ?? '90'), 10), 365);
    const data = await getCalendarData(userId, days);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
