import { Router, Request, Response, NextFunction } from 'express';
import type { CandidateRoleInput, RoleRecommendation } from '@daily-push/shared';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireRoleMarketFeature } from '../middleware/roleMarketFeature';
import {
  getTargetRole,
  listTargetRoles,
  saveTargetRole,
} from '../services/targetRoles';
import { getCandidateEvidenceProfile } from '../services/candidateEvidence';
import {
  buildRoleReadinessReport,
  getLatestRoleReadinessReport,
  persistRoleReadinessReport,
} from '../services/roleReadiness';
import { buildGapToProofRecommendations } from '../services/gapToProof';
import { createUpgradePlanForTargetRole } from '../services/upgradePlans';
import {
  createGoalFromTargetRoleUpgradePlan,
  startSprintFromTargetRoleUpgradePlan,
} from '../services/targetRoleExecutionAdapter';
import {
  assertEntitlementEnabled,
  assertQuotaAvailable,
  consumeQuota,
} from '../services/entitlements';
import { trackProductEvent } from '../services/productEvents';
import {
  assertBodyObject,
  readOptionalString,
  readPlainObject,
  readRequiredString,
} from '../utils/requestValidation';

const router = Router();

function assertUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const error = new Error('Invalid target role id');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 400;
    (error as Error & { statusCode?: number; code?: string }).code = 'validation_error';
    throw error;
  }
  return value;
}

function readOptionalPayloadObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  return readPlainObject(value, fieldName, {
    maxKeys: 80,
    maxSerializedLength: 16000,
  });
}

router.get(
  '/',
  requireAuth,
  requireRoleMarketFeature('target_role_save'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      res.json(await listTargetRoles(userId));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/evidence',
  requireAuth,
  requireRoleMarketFeature('target_role_save'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRole = await getTargetRole(userId, assertUuid(String(req.params.id)));
      if (!targetRole) {
        res.status(404).json({ error: 'Target Role not found', code: 'not_found' });
        return;
      }

      res.json(await getCandidateEvidenceProfile(userId));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/readiness',
  requireAuth,
  requireRoleMarketFeature('role_readiness_report'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRoleId = assertUuid(String(req.params.id));
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? assertBodyObject(req.body)
        : {};
      const includeAiSummary = body.includeAiSummary === true;

      await assertQuotaAvailable(userId, 'role_readiness_reports.monthly');
      const generated = await buildRoleReadinessReport(userId, targetRoleId, {
        includeAiSummary,
      });
      const report = await persistRoleReadinessReport(userId, targetRoleId, generated);
      const quota = await consumeQuota(userId, 'role_readiness_reports.monthly', {
        source: 'target_role_readiness',
        properties: {
          targetRoleId,
          roleProfileId: report.roleProfileId,
          score: report.score.overall,
          label: report.label,
        },
      });

      void trackProductEvent({
        userId,
        eventKey: 'role_readiness_generated',
        properties: {
          targetRoleId,
          roleProfileId: report.roleProfileId,
          score: report.score.overall,
          label: report.label,
          verdict: report.verdict,
          remainingReports: quota.remaining,
        },
      });

      res.status(201).json({
        report,
        quota: {
          featureKey: 'role_readiness_reports.monthly',
          remaining: quota.remaining,
          limitValue: quota.limitValue,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/readiness',
  requireAuth,
  requireRoleMarketFeature('role_readiness_report'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const report = await getLatestRoleReadinessReport(
        userId,
        assertUuid(String(req.params.id)),
      );
      if (!report) {
        res.status(404).json({ error: 'Readiness report not found', code: 'not_found' });
        return;
      }
      res.json({ report });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/create-upgrade-plan',
  requireAuth,
  requireRoleMarketFeature('role_readiness_report'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRoleId = assertUuid(String(req.params.id));
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? assertBodyObject(req.body)
        : {};
      const readinessReportId =
        typeof body.readinessReportId === 'string'
          ? assertUuid(body.readinessReportId)
          : undefined;
      const durationWeeks =
        typeof body.durationWeeks === 'number' && Number.isFinite(body.durationWeeks)
          ? body.durationWeeks
          : undefined;
      const weeklyCommitmentHours =
        typeof body.weeklyCommitmentHours === 'number' && Number.isFinite(body.weeklyCommitmentHours)
          ? body.weeklyCommitmentHours
          : undefined;

      const result = await createUpgradePlanForTargetRole({
        userId,
        targetRoleId,
        readinessReportId,
        durationWeeks,
        weeklyCommitmentHours,
      });

      void trackProductEvent({
        userId,
        eventKey: 'role_upgrade_plan_created',
        properties: {
          targetRoleId,
          upgradePlanId: result.upgradePlan.id,
          readinessReportId: result.upgradePlan.readinessReportId,
          durationWeeks: result.upgradePlan.durationWeeks,
          weeklyCommitmentHours: result.upgradePlan.weeklyCommitmentHours,
          topicCount: result.upgradePlan.topics.length,
          proofTaskCount: result.upgradePlan.proofTasks.length,
          nextAction: result.nextAction,
        },
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/create-goal',
  requireAuth,
  requireRoleMarketFeature('role_readiness_report'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRoleId = assertUuid(String(req.params.id));
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? assertBodyObject(req.body)
        : {};
      const upgradePlanId =
        typeof body.upgradePlanId === 'string'
          ? assertUuid(body.upgradePlanId)
          : undefined;

      const result = await createGoalFromTargetRoleUpgradePlan({
        userId,
        targetRoleId,
        upgradePlanId,
      });

      void trackProductEvent({
        userId,
        goalId: result.goalId,
        eventKey: 'role_goal_created',
        properties: {
          targetRoleId,
          upgradePlanId: result.upgradePlanId,
          reusedGoal: result.reusedGoal,
        },
      });

      res.status(result.reusedGoal ? 200 : 201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/upgrade-plans/:planId/start-sprint',
  requireAuth,
  requireRoleMarketFeature('role_readiness_report'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRoleId = assertUuid(String(req.params.id));
      const upgradePlanId = assertUuid(String(req.params.planId));
      await assertEntitlementEnabled(userId, 'premium_sprints.enabled');

      const result = await startSprintFromTargetRoleUpgradePlan({
        userId,
        targetRoleId,
        upgradePlanId,
      });

      void trackProductEvent({
        userId,
        goalId: result.goalId,
        eventKey: 'role_sprint_created',
        properties: {
          targetRoleId,
          upgradePlanId,
          sprintId: result.sprintId,
          reusedGoal: result.reusedGoal,
          reusedSprint: result.reusedSprint,
        },
      });

      res.status(result.reusedSprint ? 200 : 201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/proof-recommendations',
  requireAuth,
  requireRoleMarketFeature('role_readiness_report'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRoleId = assertUuid(String(req.params.id));
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? assertBodyObject(req.body)
        : {};
      const readinessReportId =
        typeof body.readinessReportId === 'string'
          ? assertUuid(body.readinessReportId)
          : undefined;
      const maxItems =
        typeof body.maxItems === 'number' && Number.isFinite(body.maxItems)
          ? Math.max(1, Math.min(Math.round(body.maxItems), 8))
          : undefined;

      const response = await buildGapToProofRecommendations({
        userId,
        targetRoleId,
        readinessReportId,
        maxItems,
      });

      void trackProductEvent({
        userId,
        eventKey: 'role_proof_recommendations_generated',
        properties: {
          targetRoleId,
          readinessReportId: response.readinessReportId,
          proofCount: response.proofRecommendations.length,
          proofTypes: response.proofRecommendations.map((item) => item.type),
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  requireAuth,
  requireRoleMarketFeature('target_role_save'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetRole = await getTargetRole(userId, assertUuid(String(req.params.id)));
      if (!targetRole) {
        res.status(404).json({ error: 'Target Role not found', code: 'not_found' });
        return;
      }
      res.json(targetRole);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  requireAuth,
  requireRoleMarketFeature('target_role_save'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const body = assertBodyObject(req.body);
      const roleProfileId = readRequiredString(body.roleProfileId, 'roleProfileId', {
        maxLength: 120,
        pattern: /^[a-z0-9_-]+$/i,
      });
      const clientDraftId = readOptionalString(body.clientDraftId, 'clientDraftId', {
        maxLength: 120,
        pattern: /^[a-z0-9_.:-]+$/i,
      });
      const candidateInput = readOptionalPayloadObject(
        body.candidateInput,
        'candidateInput',
      ) as CandidateRoleInput | undefined;
      const recommendationSnapshot = readOptionalPayloadObject(
        body.recommendationSnapshot,
        'recommendationSnapshot',
      ) as RoleRecommendation | undefined;

      const result = await saveTargetRole(userId, {
        roleProfileId,
        candidateInput,
        recommendationSnapshot,
        clientDraftId: clientDraftId ?? undefined,
      });

      void trackProductEvent({
        userId,
        eventKey: 'target_role_saved',
        properties: {
          targetRoleId: result.targetRole.id,
          roleProfileId: result.targetRole.roleProfileId,
          created: result.created,
          nextAction: result.nextAction,
        },
      });

      res.status(result.created ? 201 : 200).json({
        targetRole: result.targetRole,
        nextAction: result.nextAction,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
