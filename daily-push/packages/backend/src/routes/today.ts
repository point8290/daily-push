import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getTodayData } from '../services/sessions';

const router = Router();

// GET /api/today — next node + review + goal progress + streak
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const data = await getTodayData(userId);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
