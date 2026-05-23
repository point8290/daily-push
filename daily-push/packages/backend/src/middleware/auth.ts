import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db/postgres';

export interface AuthRequest extends Request {
  userId: string;
  userEmail?: string;
  isOperator?: boolean;
}

export interface OptionalAuthRequest extends Request {
  userId?: string;
}

interface UserAccessRow {
  email: string;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isOperatorEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && config.operators.emails.includes(normalized));
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as { sub: string };
    (req as AuthRequest).userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwt.secret) as { sub: string };
    (req as OptionalAuthRequest).userId = payload.sub;
  } catch {
    // Public routes should keep working even when a stale token is present.
  }
  next();
}

export async function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { rows } = await pool.query<UserAccessRow>(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    const email = rows[0]?.email ?? null;
    const isOperator = isOperatorEmail(email);
    (req as AuthRequest).userEmail = email ?? undefined;
    (req as AuthRequest).isOperator = isOperator;

    if (!isOperator) {
      res.status(403).json({ error: 'Operator access required.' });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
