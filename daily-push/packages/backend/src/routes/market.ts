import { Router, Request, Response, NextFunction } from 'express';
import type {
  AiImpact,
  CandidateRoleInput,
  ListRolesQuery,
  RoleCategory,
  RoleRecommendationRequest,
  RoleType,
} from '@daily-push/shared';
import { config } from '../config';
import { optionalAuth, OptionalAuthRequest } from '../middleware/auth';
import { requireRoleMarketFeature } from '../middleware/roleMarketFeature';
import { createRateLimit } from '../middleware/rateLimit';
import {
  getRoleMarketProfile,
  listRoleMarketProfiles,
} from '../services/roleMarketCatalog';
import { generateRoleRecommendations } from '../services/roleMarketRecommendation';
import {
  assertQuotaAvailable,
  consumeQuota,
} from '../services/entitlements';
import { trackProductEvent } from '../services/productEvents';
import { assertBodyObject, ValidationError } from '../utils/requestValidation';

const router = Router();

const ROLE_CATEGORIES: readonly RoleCategory[] = [
  'software_engineering',
  'data',
  'ai',
  'cloud',
  'security',
  'product',
  'qa',
  'platform',
];

const ROLE_TYPES: readonly RoleType[] = ['existing', 'emerging', 'evolving'];

const AI_IMPACTS: readonly AiImpact[] = [
  'replaced',
  'changed',
  'amplified',
  'created_by_ai',
];

const recommendRoleRateLimit = createRateLimit({
  keyPrefix: 'role-market-recommend',
  windowMs: config.roleMarket.recommendRateLimitWindowMs,
  maxRequests: config.roleMarket.recommendRateLimitMax,
  message: 'Too many role recommendation requests. Please try again shortly.',
});

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

function readOptionalEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | undefined {
  const raw = readSingleQueryValue(value, fieldName);
  if (!raw) return undefined;
  if (!allowed.includes(raw as T)) {
    throw new ValidationError(`${fieldName} must be one of: ${allowed.join(', ')}.`);
  }
  return raw as T;
}

function readOptionalLimit(value: unknown): number | undefined {
  const raw = readSingleQueryValue(value, 'limit');
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
    throw new ValidationError('limit must be a number between 1 and 100.');
  }
  return parsed;
}

function readPathParam(value: string | string[] | undefined, fieldName: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.trim()) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  return raw.trim();
}

function readListRolesQuery(query: Record<string, unknown>): ListRolesQuery {
  const q = readSingleQueryValue(query.q, 'q');
  if (q && q.length > 120) {
    throw new ValidationError('q must be at most 120 characters.');
  }

  return {
    ...(q ? { q } : {}),
    category: readOptionalEnum(query.category, 'category', ROLE_CATEGORIES),
    roleType: readOptionalEnum(query.roleType, 'roleType', ROLE_TYPES),
    aiImpact: readOptionalEnum(query.aiImpact, 'aiImpact', AI_IMPACTS),
    limit: readOptionalLimit(query.limit),
  };
}

function readCandidateInput(value: unknown): CandidateRoleInput {
  const input = assertBodyObject(value);
  return {
    currentRole: input.currentRole as CandidateRoleInput['currentRole'],
    yearsExperience: input.yearsExperience as CandidateRoleInput['yearsExperience'],
    region: input.region as CandidateRoleInput['region'],
    skills: input.skills as CandidateRoleInput['skills'],
    strongestAreas: input.strongestAreas as CandidateRoleInput['strongestAreas'],
    preferredDirections: input.preferredDirections as CandidateRoleInput['preferredDirections'],
    avoidedDirections: input.avoidedDirections as CandidateRoleInput['avoidedDirections'],
    workStyle: input.workStyle as CandidateRoleInput['workStyle'],
    targetSeniority: input.targetSeniority as CandidateRoleInput['targetSeniority'],
    freeTextContext: input.freeTextContext as CandidateRoleInput['freeTextContext'],
  };
}

function readRecommendationLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 6) {
    throw new ValidationError('limit must be a number between 1 and 6.');
  }
  return Math.trunc(parsed);
}

function readRecommendationRequest(value: unknown): RoleRecommendationRequest {
  const body = assertBodyObject(value);
  const inputPayload = body.input === undefined ? body : body.input;
  return {
    input: readCandidateInput(inputPayload),
    limit: readRecommendationLimit(body.limit),
  };
}

router.get(
  '/roles',
  requireRoleMarketFeature('role_market_public'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = readListRolesQuery(req.query as Record<string, unknown>);
      res.json(listRoleMarketProfiles(query));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/recommend-roles',
  requireRoleMarketFeature('role_market_public'),
  optionalAuth,
  recommendRoleRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as OptionalAuthRequest).userId;
      const request = readRecommendationRequest(req.body);
      if (userId) {
        await assertQuotaAvailable(userId, 'market_recommendations.daily');
      }

      const response = generateRoleRecommendations(request.input, request.limit);
      const quota = userId
        ? await consumeQuota(userId, 'market_recommendations.daily', {
            source: 'career_market_recommendation',
            properties: {
              targetSeniority: request.input.targetSeniority,
              skillCount: request.input.skills.length,
              preferredDirections: request.input.preferredDirections,
              recommendationCount: response.recommendations.length,
              topRoleProfileId: response.recommendations[0]?.roleProfileId ?? null,
            },
          })
        : null;

      if (userId) {
        void trackProductEvent({
          userId,
          eventKey: 'role_recommendation_generated',
          properties: {
            source: 'career_market',
            recommendationCount: response.recommendations.length,
            topRoleProfileId: response.recommendations[0]?.roleProfileId ?? null,
            remainingRecommendations: quota?.remaining ?? null,
          },
        });
      }

      res.json({
        ...response,
        ...(quota
          ? {
              quota: {
                featureKey: 'market_recommendations.daily',
                remaining: quota.remaining,
                limitValue: quota.limitValue,
              },
            }
          : {}),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/roles/:roleId',
  requireRoleMarketFeature('role_market_public'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(getRoleMarketProfile(readPathParam(req.params.roleId, 'roleId')));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
