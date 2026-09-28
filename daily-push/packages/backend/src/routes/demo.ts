import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { resetDemoAccount } from '../services/demoAccount';

const router = Router();

// POST /api/demo/reset — rebuild the demo account now. Needs the
// DEMO_RESET_TOKEN secret in the x-demo-reset-token header (used by the
// nightly GitHub Action).
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expected = process.env.DEMO_RESET_TOKEN ?? '';
    const given = String(req.header('x-demo-reset-token') ?? '');
    const ok =
      expected.length >= 16 &&
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) {
      res.status(401).json({ error: 'Not allowed' });
      return;
    }
    await resetDemoAccount();
    res.json({ ok: true, resetAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
