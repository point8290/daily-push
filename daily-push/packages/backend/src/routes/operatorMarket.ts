import { Router, Request, Response, NextFunction } from 'express';
import { MARKET_INGESTION_RUN_STATUSES, type MarketIngestionRunStatus } from '@daily-push/shared';
import { requireAuth, requireOperator, type AuthRequest } from '../middleware/auth';
import { requireRoleMarketFeature } from '../middleware/roleMarketFeature';
import { trackProductEvent } from '../services/productEvents';
import {
  getOperatorMarketIngestionRunsResponse,
  getOperatorMarketSourcesResponse,
} from '../services/liveMarketSourceHealth';
import { getOperatorMarketAggregatesResponse } from '../services/operatorMarketAggregates';
import { getOperatorOutcomeCalibrationResponse } from '../services/operatorOutcomeCalibration';
import {
  publishOperatorMarketProfileDraft,
  rejectOperatorMarketProfileDraft,
  rollbackOperatorMarketProfileVersion,
} from '../services/operatorMarketProfileActions';
import { getOperatorMarketProfileDraftsResponse } from '../services/operatorMarketProfileDrafts';
import { getOperatorMarketProfileVersionsResponse } from '../services/operatorMarketProfileVersions';
import { triggerOperatorMarketSourceIngestion } from '../services/operatorMarketIngestion';
import {
  assertBodyObject,
  readOptionalString,
  readRequiredString,
  ValidationError,
} from '../utils/requestValidation';

const router = Router();

function readSingleQueryValue(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const firstValue = value[0];
    if (typeof firstValue !== 'string') {
      throw new ValidationError(`${fieldName} must be a string.`);
    }
    return firstValue.trim();
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string.`);
  }
  return value.trim();
}

function readOptionalLimit(value: unknown): number {
  const raw = readSingleQueryValue(value, 'limit');
  if (!raw) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 200) {
    throw new ValidationError('limit must be a number between 1 and 200.');
  }
  return parsed;
}

function readOptionalStatus(value: unknown): MarketIngestionRunStatus | undefined {
  const raw = readSingleQueryValue(value, 'status');
  if (!raw) return undefined;
  if (!MARKET_INGESTION_RUN_STATUSES.includes(raw as MarketIngestionRunStatus)) {
    throw new ValidationError(
      `status must be one of: ${MARKET_INGESTION_RUN_STATUSES.join(', ')}.`,
    );
  }
  return raw as MarketIngestionRunStatus;
}

function readOptionalInteger(
  value: unknown,
  fieldName: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${fieldName} must be a number between ${min} and ${max}.`);
  }
  return parsed;
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  throw new ValidationError(`${fieldName} must be boolean.`);
}

router.get(
  '/sources',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const response = await getOperatorMarketSourcesResponse();

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_source_health_viewed',
        properties: {
          sourceCount: response.sources.length,
          degradedCount: response.sources.filter((item) => item.health.status === 'degraded').length,
          downCount: response.sources.filter((item) => item.health.status === 'down').length,
          disabledCount: response.sources.filter((item) => item.health.status === 'disabled').length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/sources/:sourceId/ingest',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  requireRoleMarketFeature('role_market_live_ingestion'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const sourceId = readRequiredString(req.params.sourceId, 'sourceId', {
        maxLength: 160,
        pattern: /^[a-z0-9_.:-]+$/i,
      });
      const body = assertBodyObject(req.body);
      const query = readRequiredString(body.query, 'query', {
        minLength: 2,
        maxLength: 240,
      });
      const roleProfileId = readOptionalString(body.roleProfileId, 'roleProfileId', {
        maxLength: 160,
        pattern: /^[a-z0-9_.:-]+$/i,
      });
      const region = readOptionalString(body.region, 'region', { maxLength: 120 });
      const country = readOptionalString(body.country, 'country', {
        maxLength: 24,
        pattern: /^[a-z]{2,3}$/i,
      });
      const limit = readOptionalInteger(body.limit, 'limit', 5, 1, 25);
      const page = readOptionalInteger(body.page, 'page', 1, 1, 1_000);
      const pageLimit = readOptionalInteger(body.pageLimit, 'pageLimit', 1, 1, 3);
      const dryRun = readOptionalBoolean(body.dryRun, 'dryRun');

      const response = await triggerOperatorMarketSourceIngestion(sourceId, {
        query,
        roleProfileId,
        region,
        country,
        limit,
        page,
        pageLimit,
        dryRun,
      });

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_ingestion_triggered',
        properties: {
          sourceId,
          triggerStatus: response.status,
          runStatus: response.run.status,
          limit,
          pageLimit,
          dryRun,
          queryLength: query.length,
        },
      });

      res.status(response.status === 'already_running' ? 202 : 200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/ingestion-runs',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const sourceId = readSingleQueryValue(req.query.sourceId, 'sourceId');
      const status = readOptionalStatus(req.query.status);
      const limit = readOptionalLimit(req.query.limit);
      const response = await getOperatorMarketIngestionRunsResponse({
        sourceId,
        status,
        limit,
      });

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_ingestion_runs_viewed',
        properties: {
          sourceId: sourceId ?? null,
          status: status ?? null,
          limit,
          runCount: response.runs.length,
          failureCount: response.runs.filter((run) => run.status === 'failed').length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/aggregates',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const region = readSingleQueryValue(req.query.region, 'region');
      const limit = readOptionalLimit(req.query.limit);
      const response = await getOperatorMarketAggregatesResponse({
        region: region || null,
        limit,
      });
      const withAggregates = response.aggregates.filter((item) => item.latestAggregate).length;
      const lowConfidenceCount = response.aggregates.filter(
        (item) => (item.latestAggregate?.confidence ?? 1) < 0.7,
      ).length;

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_aggregates_viewed',
        properties: {
          region: region || null,
          limit,
          roleCount: response.aggregates.length,
          aggregateCount: withAggregates,
          lowConfidenceCount,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/outcome-calibration',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const windowDays = readOptionalInteger(req.query.windowDays, 'windowDays', 90, 7, 365);
      const limit = readOptionalLimit(req.query.limit);
      const response = await getOperatorOutcomeCalibrationResponse({
        windowDays,
        limit,
      });

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_outcome_calibration_viewed',
        properties: {
          windowDays,
          limit,
          roleCount: response.summary.roleCount,
          rolesWithOutcomeData: response.summary.rolesWithOutcomeData,
          rolesMeetingInternalThreshold: response.summary.rolesMeetingInternalThreshold,
          rolesEligibleForOperatorReview: response.summary.rolesEligibleForOperatorReview,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/profile-drafts',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const limit = readOptionalLimit(req.query.limit);
      const response = await getOperatorMarketProfileDraftsResponse({ limit });

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_profile_drafts_viewed',
        properties: {
          limit,
          draftCount: response.drafts.length,
          blockerCount: response.drafts.reduce((sum, item) => sum + item.blockerCount, 0),
          publishableCount: response.drafts.filter((item) => item.canPublish).length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/profile-versions',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const rawRoleProfileId = readSingleQueryValue(req.query.roleProfileId, 'roleProfileId');
      const roleProfileId = rawRoleProfileId
        ? readRequiredString(rawRoleProfileId, 'roleProfileId', {
          maxLength: 160,
          pattern: /^[a-z0-9_.:-]+$/i,
        })
        : undefined;
      const limit = readOptionalLimit(req.query.limit);
      const response = await getOperatorMarketProfileVersionsResponse({
        roleProfileId: roleProfileId || null,
        limit,
      });

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_profile_versions_viewed',
        properties: {
          roleProfileId: roleProfileId || null,
          limit,
          versionCount: response.versions.length,
          rollbackCandidateCount: response.versions.filter((item) => item.canRollback).length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/profile-drafts/:profileVersionId/publish',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const profileVersionId = readRequiredString(req.params.profileVersionId, 'profileVersionId', {
        maxLength: 160,
        pattern: /^[a-z0-9_.:-]+$/i,
      });
      const body = assertBodyObject(req.body);
      const reason = readRequiredString(body.reason, 'reason', {
        minLength: 4,
        maxLength: 2_000,
      });
      const response = await publishOperatorMarketProfileDraft(profileVersionId, userId, reason);

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_profile_published',
        properties: {
          profileVersionId,
          roleProfileId: response.profileVersion.roleProfileId,
          version: response.profileVersion.version,
          reasonLength: reason.length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/profile-drafts/:profileVersionId/reject',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const profileVersionId = readRequiredString(req.params.profileVersionId, 'profileVersionId', {
        maxLength: 160,
        pattern: /^[a-z0-9_.:-]+$/i,
      });
      const body = assertBodyObject(req.body);
      const reason = readRequiredString(body.reason, 'reason', {
        minLength: 4,
        maxLength: 2_000,
      });
      const response = await rejectOperatorMarketProfileDraft(profileVersionId, userId, reason);

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_profile_rejected',
        properties: {
          profileVersionId,
          roleProfileId: response.profileVersion.roleProfileId,
          version: response.profileVersion.version,
          reasonLength: reason.length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/profile-versions/:profileVersionId/rollback',
  requireAuth,
  requireOperator,
  requireRoleMarketFeature('role_market_operator_review'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const profileVersionId = readRequiredString(req.params.profileVersionId, 'profileVersionId', {
        maxLength: 160,
        pattern: /^[a-z0-9_.:-]+$/i,
      });
      const body = assertBodyObject(req.body);
      const reason = readRequiredString(body.reason, 'reason', {
        minLength: 4,
        maxLength: 2_000,
      });
      const response = await rollbackOperatorMarketProfileVersion(profileVersionId, userId, reason);

      void trackProductEvent({
        userId,
        eventKey: 'operator_market_profile_rolled_back',
        properties: {
          profileVersionId,
          roleProfileId: response.profileVersion.roleProfileId,
          version: response.profileVersion.version,
          rollbackOfVersionId: response.profileVersion.rollbackOfVersionId,
          reasonLength: reason.length,
        },
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
