import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireOperator, AuthRequest } from '../middleware/auth';
import { requireEntitlement } from '../middleware/requireEntitlement';
import { getLlmUsageSummary } from '../services/llmUsage';
import { getProductMetricsSummary } from '../services/productMetrics';
import { getWeeklyReport } from '../services/weeklyCheckins';
import { trackProductEvent } from '../services/productEvents';

const router = Router();

router.get(
  '/weekly',
  requireAuth,
  requireEntitlement('weekly_reports.enabled'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const goalId = typeof req.query.goalId === 'string' ? req.query.goalId.trim() : undefined;
      const report = await getWeeklyReport(userId, goalId || undefined);

      if (!report) {
        res.status(404).json({ error: 'No active goal found for weekly reporting.' });
        return;
      }

      void trackProductEvent({
        userId,
        goalId: report.goalId,
        eventKey: 'weekly_report_viewed',
        properties: {
          checkinDue: report.checkinDue,
          sessionsThisWeek: report.stats.sessionsThisWeek,
          riskScore: report.planHealth.riskScore,
          weeklyTargetProgressPct: report.stats.weeklyTargetProgressPct,
        },
      });

      res.json(report);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/product-metrics',
  requireAuth,
  requireOperator,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const rawWindowDays =
        typeof req.query.windowDays === 'string'
          ? Number.parseInt(req.query.windowDays, 10)
          : 30;
      const windowDays = Number.isFinite(rawWindowDays)
        ? Math.max(7, Math.min(rawWindowDays, 90))
        : 30;
      const summary = await getProductMetricsSummary(windowDays);

      void trackProductEvent({
        userId,
        eventKey: 'product_metrics_viewed',
        properties: {
          windowDays,
          payingUsers: summary.users.payingUsers,
          activeUsers30d: summary.users.activeUsers30d,
        },
      });

      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/ai-usage',
  requireAuth,
  requireOperator,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const rawWindowDays =
        typeof req.query.windowDays === 'string'
          ? Number.parseInt(req.query.windowDays, 10)
          : 30;
      const windowDays = Number.isFinite(rawWindowDays)
        ? Math.max(7, Math.min(rawWindowDays, 90))
        : 30;
      const summary = await getLlmUsageSummary(windowDays);

      void trackProductEvent({
        userId,
        eventKey: 'ai_usage_viewed',
        properties: {
          windowDays,
          totalCalls: summary.totals.totalCalls,
          totalTokens: summary.totals.totalTokens,
          estimatedCostUsd: summary.totals.estimatedCostUsd,
        },
      });

      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
