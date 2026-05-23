import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/postgres';
import { config } from '../config';
import { requireAuth, AuthRequest, isOperatorEmail } from '../middleware/auth';
import { createRateLimit } from '../middleware/rateLimit';
import { assertBodyObject, readEmail, readRequiredString } from '../utils/requestValidation';

const router = Router();
const authRateLimit = createRateLimit({
  keyPrefix: 'auth',
  windowMs: config.security.authRateLimitWindowMs,
  maxRequests: config.security.authRateLimitMax,
  message: 'Too many authentication attempts. Please try again shortly.',
  keyBuilder: (req) => `${req.path}:${req.ip || req.socket.remoteAddress || 'unknown'}`,
});

// POST /api/auth/register
router.post('/register', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = assertBodyObject(req.body);
    const email = readEmail(body.email);
    const password = readRequiredString(body.password, 'password', {
      minLength: 8,
      maxLength: 200,
    });
    const name = readRequiredString(body.name, 'name', {
      maxLength: 120,
    });

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email, hash, name]
    );

    const user = rows[0];
    const token = jwt.sign({ sub: user.id }, config.jwt.secret, {
      expiresIn: '30d',
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isOperator: isOperatorEmail(user.email),
      },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = assertBodyObject(req.body);
    const email = readEmail(body.email);
    const password = readRequiredString(body.password, 'password', {
      maxLength: 200,
    });

    const { rows } = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign({ sub: user.id }, config.jwt.secret, {
      expiresIn: '30d',
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isOperator: isOperatorEmail(user.email),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req as AuthRequest;
    const { rows } = await pool.query(
      'SELECT id, email, name, created_at, last_active_at FROM users WHERE id = $1',
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      ...rows[0],
      isOperator: isOperatorEmail(rows[0].email),
    });
  } catch (err) { next(err); }
});

export default router;
