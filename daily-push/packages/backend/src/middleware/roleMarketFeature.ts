import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

type RoleMarketFeatureKey =
  | 'role_market_public'
  | 'target_role_save'
  | 'role_readiness_report'
  | 'role_market_ai_summary'
  | 'role_market_live_ingestion'
  | 'role_market_operator_review';

const FEATURE_ACCESSORS: Record<RoleMarketFeatureKey, () => boolean> = {
  role_market_public: () => config.roleMarket.featurePublic,
  target_role_save: () => config.roleMarket.featureTargetRoleSave,
  role_readiness_report: () => config.roleMarket.featureReadinessReport,
  role_market_ai_summary: () => config.roleMarket.featureAiSummary,
  role_market_live_ingestion: () => config.roleMarket.featureLiveIngestion,
  role_market_operator_review: () => config.roleMarket.featureOperatorReview,
};

export class FeatureDisabledError extends Error {
  statusCode = 404;

  code = 'feature_disabled';

  constructor(public featureKey: RoleMarketFeatureKey) {
    super('This feature is not available yet.');
  }
}

export class DependencyUnavailableError extends Error {
  statusCode = 503;

  code = 'dependency_unavailable';

  constructor(message: string) {
    super(message);
  }
}

export function assertRoleMarketFeatureEnabled(featureKey: RoleMarketFeatureKey): void {
  const isEnabled = FEATURE_ACCESSORS[featureKey]?.();
  if (!isEnabled) {
    throw new FeatureDisabledError(featureKey);
  }
}

export function requireRoleMarketFeature(featureKey: RoleMarketFeatureKey) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    try {
      assertRoleMarketFeatureEnabled(featureKey);
      next();
    } catch (error) {
      next(error);
    }
  };
}
