import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getDb } from '../db/mongo';
import { trackProductEvent } from '../services/productEvents';
import {
  buildGoalRecoveryPlan,
  getGoalWeeklyCheckinState,
  saveGoalWeeklyCheckin,
} from '../services/weeklyCheckins';

const router = Router();

async function loadGoalForRequest(userId: string, rawGoalId: string) {
  let id: ObjectId;
  try {
    id = new ObjectId(rawGoalId);
  } catch {
    return { error: 'Invalid goal id' as const };
  }

  const db = getDb();
  const goal = await db.collection('goals').findOne({ _id: id, userId });
  if (!goal) {
    return { error: 'Goal not found' as const };
  }

  return { goalId: id.toString(), goal };
}

router.get(
  '/:id/checkin',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const loaded = await loadGoalForRequest(userId, String(req.params.id));
      if ('error' in loaded) {
        res.status(loaded.error === 'Invalid goal id' ? 400 : 404).json({ error: loaded.error });
        return;
      }

      const state = await getGoalWeeklyCheckinState(userId, loaded.goalId);
      res.json(state);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/checkin',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const loaded = await loadGoalForRequest(userId, String(req.params.id));
      if ('error' in loaded) {
        res.status(loaded.error === 'Invalid goal id' ? 400 : 404).json({ error: loaded.error });
        return;
      }

      const confidence = Number(req.body?.confidence);
      const momentum = Number(req.body?.momentum);

      if (!Number.isFinite(confidence) || confidence < 1 || confidence > 5) {
        res.status(400).json({ error: 'confidence must be between 1 and 5' });
        return;
      }
      if (!Number.isFinite(momentum) || momentum < 1 || momentum > 5) {
        res.status(400).json({ error: 'momentum must be between 1 and 5' });
        return;
      }

      const checkin = await saveGoalWeeklyCheckin(userId, loaded.goalId, {
        confidence,
        momentum,
        blockers: req.body?.blockers,
        wins: req.body?.wins,
        notes: req.body?.notes ?? null,
      });

      void trackProductEvent({
        userId,
        goalId: loaded.goalId,
        eventKey: 'weekly_checkin_saved',
        properties: {
          confidence: checkin.confidence,
          momentum: checkin.momentum,
          blockerCount: checkin.blockers.length,
          winCount: checkin.wins.length,
        },
      });

      res.status(201).json({
        due: false,
        weekStart: checkin.weekStart,
        latestCheckin: checkin,
      });
    } catch (error: any) {
      if (error?.message === 'Goal not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  },
);

router.post(
  '/:id/recovery-plan',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const loaded = await loadGoalForRequest(userId, String(req.params.id));
      if ('error' in loaded) {
        res.status(loaded.error === 'Invalid goal id' ? 400 : 404).json({ error: loaded.error });
        return;
      }

      const recoveryPlan = await buildGoalRecoveryPlan(userId, loaded.goalId, {
        blockers: req.body?.blockers,
        wins: req.body?.wins,
        confidence: req.body?.confidence ?? null,
        momentum: req.body?.momentum ?? null,
        notes: req.body?.notes ?? null,
      });

      void trackProductEvent({
        userId,
        goalId: loaded.goalId,
        eventKey: 'recovery_plan_generated',
        properties: {
          status: recoveryPlan.status,
          catchUpMinutes: recoveryPlan.catchUpMinutes,
          focusAreaCount: recoveryPlan.focusAreas.length,
          shouldReduceScope: recoveryPlan.shouldReduceScope,
        },
      });

      res.json(recoveryPlan);
    } catch (error: any) {
      if (error?.message === 'Goal not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  },
);

export default router;
