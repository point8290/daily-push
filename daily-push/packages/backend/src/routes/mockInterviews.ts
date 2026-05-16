import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getDb } from '../db/mongo';
import { consumeQuota } from '../services/entitlements';
import { trackProductEvent } from '../services/productEvents';
import {
  type MockInterviewMode,
  evaluateMockInterviewRun,
  getMockInterviewHistory,
  getMockInterviewRun,
  startMockInterviewRun,
  submitMockInterviewAnswer,
} from '../services/mockInterviews';
import {
  assertBodyObject,
  readOptionalString,
  readRequiredString,
} from '../utils/requestValidation';

const router = Router();

function isMode(value: unknown): value is MockInterviewMode {
  return (
    value === 'system_design' ||
    value === 'behavioral' ||
    value === 'project_deep_dive'
  );
}

router.post('/start', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const body = assertBodyObject(req.body);
    const goalId = readRequiredString(body.goalId, 'goalId', { maxLength: 24 });
    const mode = body.mode;
    if (!isMode(mode)) {
      res.status(400).json({ error: 'mode must be system_design, behavioral, or project_deep_dive' });
      return;
    }

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(goalId);
    } catch {
      res.status(400).json({ error: 'Invalid goal id' });
      return;
    }

    const db = getDb();
    const goal = await db.collection('goals').findOne({ _id: objectId, userId });
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const entitlement = await consumeQuota(userId, 'mock_interviews.monthly', {
      source: 'mock_interview_start',
      properties: {
        goalId,
        mode,
      },
    });

    const run = await startMockInterviewRun(userId, {
      goalId,
      mode,
      targetRole:
        readOptionalString(body.targetRole, 'targetRole', { maxLength: 160 }) ??
        goal?.sprint?.targetRole ??
        null,
      focusArea: readOptionalString(body.focusArea, 'focusArea', {
        maxLength: 200,
      }),
      promptContext: readOptionalString(body.promptContext, 'promptContext', {
        maxLength: 2000,
      }),
      quota: {
        featureKey: 'mock_interviews.monthly',
        remaining: entitlement.remaining,
        limitValue: entitlement.limitValue,
      },
    });

    void trackProductEvent({
      userId,
      goalId,
      eventKey: 'mock_interview_started',
      properties: {
        runId: run.id,
        mode: run.mode,
        targetRole: run.targetRole,
        focusArea: run.focusArea,
        remainingInterviews: entitlement.remaining,
      },
    });

    res.status(201).json({
      ...run,
      quota: {
        featureKey: 'mock_interviews.monthly',
        remaining: entitlement.remaining,
        limitValue: entitlement.limitValue,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const goalId =
      typeof req.query.goalId === 'string'
        ? req.query.goalId.trim()
        : undefined;
    const history = await getMockInterviewHistory(userId, goalId || undefined);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const run = await getMockInterviewRun(userId, String(req.params.id));
    res.json(run);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/answer', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const body = assertBodyObject(req.body);
    const answer = readRequiredString(body.answer, 'answer', {
      maxLength: 12000,
    });

    const run = await submitMockInterviewAnswer(userId, String(req.params.id), answer);

    void trackProductEvent({
      userId,
      goalId: run.goalId,
      eventKey: 'mock_interview_answer_submitted',
      properties: {
        runId: run.id,
        mode: run.mode,
        answerLength: answer.length,
        turnCount: run.turnCount,
      },
    });

    res.json(run);
  } catch (error: any) {
    if (
      error?.message === 'Mock interview run not found' ||
      error?.message === 'This mock interview is already complete.' ||
      error?.message === 'Write a bit more so the interviewer has something real to evaluate.'
    ) {
      res.status(error.message === 'Mock interview run not found' ? 404 : 400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post('/:id/evaluate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const run = await evaluateMockInterviewRun(userId, String(req.params.id));

    void trackProductEvent({
      userId,
      goalId: run.goalId,
      eventKey: 'mock_interview_evaluated',
      properties: {
        runId: run.id,
        mode: run.mode,
        overallScore: run.evaluation?.overallScore ?? null,
        verdict: run.evaluation?.verdict ?? null,
      },
    });

    res.json(run);
  } catch (error: any) {
    if (
      error?.message === 'Mock interview run not found' ||
      error?.message === 'Answer at least one interview question before scoring the run.'
    ) {
      res.status(error.message === 'Mock interview run not found' ? 404 : 400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;
