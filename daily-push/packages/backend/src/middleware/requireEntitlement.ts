import { Request, Response, NextFunction } from 'express';
import { type AuthRequest } from './auth';
import { assertEntitlementEnabled, EntitlementError } from '../services/entitlements';

export function requireEntitlement(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      await assertEntitlementEnabled(userId, featureKey);
      next();
    } catch (error) {
      if (error instanceof EntitlementError) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          featureKey: error.featureKey,
          upgradePlan: error.upgradePlan,
        });
        return;
      }
      next(error);
    }
  };
}
