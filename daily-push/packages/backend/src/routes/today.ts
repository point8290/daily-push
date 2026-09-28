import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getTodayData } from '../services/sessions';

const router = Router();

// GET /api/today — next node + review + goal progress + streak
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const nodeId = typeof req.query.nodeId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.nodeId) ? req.query.nodeId : undefined;
    const data = await getTodayData(userId, nodeId);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
