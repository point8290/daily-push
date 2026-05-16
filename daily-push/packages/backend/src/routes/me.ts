import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getCurrentPlanState } from '../services/billingState';
import { getEntitlementSummaries } from '../services/entitlements';

const router = Router();

router.get('/entitlements', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const [currentPlan, entitlements] = await Promise.all([
      getCurrentPlanState(userId),
      getEntitlementSummaries(userId),
    ]);

    res.json({
      currentPlan,
      entitlements,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
