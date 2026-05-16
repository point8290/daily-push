import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createSession, completeSession, getStreak, getCalendarData } from '../services/sessions';
import { scoreUnderstandingAnswer } from '../services/understandingCheck';
import { trackProductEvent } from '../services/productEvents';
import { consumeQuota } from '../services/entitlements';
import { evaluateSessionArtifact } from '../services/artifactEvaluator';
import { getSessionTask, saveSessionArtifact } from '../services/sessionTasks';

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
    void trackProductEvent({
      userId,
      sessionId,
      eventKey: 'session_started',
      properties: {
        nodeId,
        sessionType,
        timebox,
      },
    });
    res.status(201).json({ sessionId });
  } catch (err) { next(err); }
});

// GET /api/sessions/:id/task - get or create the concrete task for this session
router.get('/:id/task', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const sessionId = String(req.params.id);
    const task = await getSessionTask(sessionId, userId);
    void trackProductEvent({
      userId,
      sessionId,
      goalId: task.goalId,
      eventKey: 'session_task_viewed',
      properties: {
        taskType: task.taskType,
        artifactType: task.artifactType,
        hasExistingArtifact: !!task.artifact?.content,
      },
    });
    res.json(task);
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/artifact - save session artifact content
router.post('/:id/artifact', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const sessionId = String(req.params.id);
    const { content } = req.body;

    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const task = await saveSessionArtifact(sessionId, userId, content.trim());
    void trackProductEvent({
      userId,
      sessionId,
      goalId: task.goalId,
      eventKey: 'session_artifact_saved',
      properties: {
        taskType: task.taskType,
        contentLength: content.trim().length,
      },
    });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/evaluate-artifact - rubric-based AI review
router.post('/:id/evaluate-artifact', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const sessionId = String(req.params.id);
    const { content } = req.body ?? {};

    if (content != null && typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string when provided' });
      return;
    }

    const entitlement = await consumeQuota(userId, 'ai_checks.monthly', {
      source: 'artifact_evaluation',
      properties: {
        sessionId,
        contentLength: content?.trim().length ?? null,
      },
    });

    const task = await getSessionTask(sessionId, userId);
    const evaluation = await evaluateSessionArtifact(sessionId, userId, content);

    void trackProductEvent({
      userId,
      sessionId,
      goalId: task.goalId,
      eventKey: 'session_artifact_evaluated',
      properties: {
        taskType: task.taskType,
        score: evaluation.score,
        correct: evaluation.correct,
        remainingChecks: entitlement.remaining,
      },
    });

    res.json({
      ...evaluation,
      quota: {
        featureKey: 'ai_checks.monthly',
        remaining: entitlement.remaining,
        limitValue: entitlement.limitValue,
      },
    });
  } catch (err: any) {
    if (
      err?.message === 'Artifact content is required before evaluation' ||
      err?.message === 'Write a bit more before requesting AI review'
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
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

    void trackProductEvent({
      userId,
      sessionId,
      goalId: null,
      eventKey: 'session_completed',
      properties: {
        confidenceAfter: parseInt(String(confidenceAfter), 10),
        durationMins: parseInt(String(durationMins ?? '30'), 10),
        unlockedNodeCount: result.unlockedNodeTitles.length,
        milestoneCount: result.newMilestones.length,
        completedNextNodeAvailable: !!result.nextNode,
      },
    });

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
    const entitlement = await consumeQuota(userId, 'ai_checks.monthly', {
      source: 'understanding_check',
      properties: {
        sessionId,
        answerLength: answer.trim().length,
      },
    });
    const result = await scoreUnderstandingAnswer(sessionId, answer.trim(), userId);
    void trackProductEvent({
      userId,
      sessionId,
      eventKey: 'understanding_check_submitted',
      properties: {
        answerLength: answer.trim().length,
        score: result.score,
        correct: result.correct,
        remainingChecks: entitlement.remaining,
      },
    });
    res.json({
      ...result,
      quota: {
        featureKey: 'ai_checks.monthly',
        remaining: entitlement.remaining,
        limitValue: entitlement.limitValue,
      },
    });
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
