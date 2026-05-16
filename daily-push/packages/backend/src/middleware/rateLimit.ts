import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  message: string;
  keyBuilder?: (req: Request) => string;
}

function getDefaultKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function createRateLimit(options: RateLimitOptions) {
  const entries = new Map<string, RateLimitEntry>();
  let cleanupCounter = 0;

  function cleanup(now: number) {
    for (const [key, entry] of entries.entries()) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    cleanupCounter += 1;
    if (cleanupCounter % 200 === 0) {
      cleanup(now);
    }

    const rawKey = options.keyBuilder?.(req) ?? getDefaultKey(req);
    const key = `${options.keyPrefix}:${rawKey}`;
    const existing = entries.get(key);

    let entry: RateLimitEntry;
    if (!existing || existing.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + options.windowMs,
      };
      entries.set(key, entry);
    } else {
      entry = existing;
    }

    entry.count += 1;

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    );
    const remaining = Math.max(0, options.maxRequests - entry.count);

    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > options.maxRequests) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: options.message,
        code: 'rate_limited',
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
