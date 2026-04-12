import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>('SELECT * FROM user_settings LIMIT 1');
    conn.release();
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

router.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, digest_time, timezone, active_category_id } = req.body;
    const conn = await pool.getConnection();
    const [existing] = await conn.query<any[]>('SELECT id FROM user_settings LIMIT 1');

    if (existing.length === 0) {
      if (!email) { conn.release(); res.status(400).json({ error: 'email is required for initial setup' }); return; }
      await conn.query(
        'INSERT INTO user_settings (email, digest_time, timezone) VALUES (?, ?, ?)',
        [email, digest_time || '08:00', timezone || 'Asia/Kolkata']
      );
    } else {
      const fields: string[] = [];
      const values: any[] = [];
      if (email !== undefined) { fields.push('email = ?'); values.push(email); }
      if (digest_time !== undefined) { fields.push('digest_time = ?'); values.push(digest_time); }
      if (timezone !== undefined) { fields.push('timezone = ?'); values.push(timezone); }
      if (active_category_id !== undefined) { fields.push('active_category_id = ?'); values.push(active_category_id); }
      if (fields.length > 0) {
        values.push(existing[0].id);
        await conn.query(`UPDATE user_settings SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    }

    const [rows] = await conn.query<any[]>('SELECT * FROM user_settings LIMIT 1');
    conn.release();
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
