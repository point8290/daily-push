import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getSettings, updateSettings } from '../services/settings';

const router = Router();

// GET /api/settings
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const settings = await getSettings(userId);
    res.json(settings);
  } catch (err) { next(err); }
});

// PATCH /api/settings
router.patch('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const { availableMinsDay, availableDaysWeek, timezone, digestTime, emailWeeklySummary } = req.body;
    const updated = await updateSettings(userId, {
      availableMinsDay,
      availableDaysWeek,
      timezone,
      digestTime,
      emailWeeklySummary,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
