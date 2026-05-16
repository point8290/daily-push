import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const typedError = err as Error & {
    statusCode?: number;
    code?: string;
    type?: string;
    featureKey?: string;
    upgradePlan?: string | null;
    limitValue?: number | null;
    usage?: number;
  };

  const bodyParserStatus =
    typedError.type === 'entity.parse.failed'
      ? 400
      : typedError.type === 'entity.too.large'
        ? 413
        : null;
  const statusCode =
    bodyParserStatus ??
    (typedError.statusCode && typedError.statusCode >= 400
      ? typedError.statusCode
      : 500);
  const errorMessage =
    typedError.type === 'entity.parse.failed'
      ? 'Malformed JSON body.'
      : typedError.type === 'entity.too.large'
        ? 'Request body too large.'
        : err.message || 'Internal server error';
  const errorCode =
    typedError.type === 'entity.parse.failed'
      ? 'invalid_json'
      : typedError.type === 'entity.too.large'
        ? 'payload_too_large'
        : typedError.code;

  res.status(statusCode).json({
    error: errorMessage,
    ...(errorCode ? { code: errorCode } : {}),
    ...(typedError.featureKey ? { featureKey: typedError.featureKey } : {}),
    ...(typedError.upgradePlan ? { upgradePlan: typedError.upgradePlan } : {}),
    ...(typedError.limitValue !== undefined ? { limitValue: typedError.limitValue } : {}),
    ...(typedError.usage !== undefined ? { usage: typedError.usage } : {}),
  });
}
