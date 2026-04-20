import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { fetchNewsForUser, getNewsFeed, markRead } from '../services/newsService';

const router = Router();

// GET /api/news/feed — news feed for the logged-in user
router.get('/feed', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const items = await getNewsFeed(userId);
    res.json(items);
  } catch (err) { next(err); }
});

// POST /api/news/fetch — trigger a background fetch for the user's concept nodes
router.post('/fetch', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    fetchNewsForUser(userId).catch((err) =>
      console.error('[news/fetch] background error:', err),
    );
    res.json({ ok: true, message: 'Fetching news in background' });
  } catch (err) { next(err); }
});

// POST /api/news/:id/read — mark item read + bump SR interval if applicable
router.post('/:id/read', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    await markRead(userId, req.params['id'] as string);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
