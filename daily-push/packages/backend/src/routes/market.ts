import { Router, Request, Response, NextFunction } from 'express';
import {
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
  getPublicRoleMarketProfile,
  listPublicRoleMarketProfiles,
} from '../services/roleMarketPublicCatalog';
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

function readOptionalRegion(value: unknown): string | undefined {
  const region = readSingleQueryValue(value, 'region');
  if (!region) return undefined;
  if (region.length > 80) {
    throw new ValidationError('region must be at most 80 characters.');
  }
  if (!/^[a-z0-9 ,._:-]+$/i.test(region)) {
    throw new ValidationError('region can include letters, numbers, spaces, commas, periods, underscores, colons, and hyphens.');
  }
  return region;
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
    region: readOptionalRegion(query.region),
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
  const mode =
    body.mode === undefined || body.mode === null
      ? undefined
      : body.mode === 'discovery' || body.mode === 'target_fit'
        ? body.mode
        : (() => {
            throw new ValidationError('mode must be discovery or target_fit.');
          })();
  const targetRoleProfileId =
    body.targetRoleProfileId === undefined || body.targetRoleProfileId === null
      ? null
      : typeof body.targetRoleProfileId === 'string' && body.targetRoleProfileId.trim()
        ? body.targetRoleProfileId.trim()
        : (() => {
            throw new ValidationError('targetRoleProfileId must be a non-empty string or null.');
          })();
  return {
    input: readCandidateInput(inputPayload),
    limit: readRecommendationLimit(body.limit),
    mode,
    targetRoleProfileId,
  };
}

router.get(
  '/roles',
  requireRoleMarketFeature('role_market_public'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = readListRolesQuery(req.query as Record<string, unknown>);
      res.json(await listPublicRoleMarketProfiles(query));
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

      const response = await generateRoleRecommendations(request.input, request.limit, undefined, {
        mode: request.mode,
        targetRoleProfileId: request.targetRoleProfileId,
      });
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await getPublicRoleMarketProfile(
          readPathParam(req.params.roleId, 'roleId'),
          { region: readOptionalRegion(req.query.region) ?? null },
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

export default router;
